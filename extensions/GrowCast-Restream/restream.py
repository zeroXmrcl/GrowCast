#!/usr/bin/env python3
"""Watch GrowCast restream control files and push Chromium+overlay to Twitch."""

from __future__ import annotations

import json
import logging
import os
import re
import signal
import subprocess
import threading
import time
from pathlib import Path

DATA = Path(os.environ.get("RESTREAM_DATA_DIR", "/data/restream"))
CONTROL = DATA / "control.json"
KEY = DATA / "twitch.key"
STATUS = DATA / "status.json"
GROWCAST_URL = os.environ.get("GROWCAST_URL", "http://growcast:3000").rstrip("/")
TOKEN = os.environ.get("GROWCAST_RESTREAM_TOKEN", "").strip()
INGEST = os.environ.get("TWITCH_INGEST", "rtmps://live.twitch.tv:443/app").rstrip("/")
DISPLAY = os.environ.get("DISPLAY", ":99")

log = logging.getLogger("growcast.restream")

NOISY_STDERR = {"chromium"}

xvfb: subprocess.Popen[bytes] | None = None
chrome: subprocess.Popen[bytes] | None = None
ffmpeg: subprocess.Popen[bytes] | None = None
chrome_profile = ""
stopping = False
last_note = ""
last_live_log = 0.0


def redact(text: str, key: str = "") -> str:
    out = re.sub(r"rtmps?://\S+", "[ingest]", text, flags=re.I)
    secret = key.strip()
    if secret:
        out = out.replace(secret, "[key]")
    if TOKEN:
        out = out.replace(TOKEN, "[token]")
    return out[-400:]


def note(msg: str, *args: object, level: int = logging.INFO) -> None:
    global last_note
    rendered = msg % args if args else msg
    if rendered == last_note:
        return
    last_note = rendered
    log.log(level, msg, *args)


def clear_note() -> None:
    global last_note
    last_note = ""


def write_status(state: str, last_error: str = "", key: str = "") -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    payload = {
        "state": state,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lastError": redact(last_error, key),
    }
    STATUS.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def enabled() -> bool:
    try:
        raw = json.loads(CONTROL.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return False
    except (OSError, json.JSONDecodeError) as err:
        note("control.json unreadable: %s", err, level=logging.WARNING)
        return False
    return raw.get("enabled") is True


def stream_key() -> str:
    try:
        return KEY.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def drain_stderr(proc: subprocess.Popen[bytes], name: str, key: str) -> None:
    level = logging.DEBUG if name in NOISY_STDERR else logging.WARNING

    def run() -> None:
        if proc.stderr is None:
            return
        for raw in proc.stderr:
            line = redact(raw.decode("utf-8", "replace"), key).rstrip()
            if line:
                log.log(level, "%s: %s", name, line)

    threading.Thread(target=run, daemon=True, name=f"{name}-stderr").start()


def stop_proc(proc: subprocess.Popen[bytes] | None, name: str) -> None:
    if proc is None or proc.poll() is not None:
        return
    log.info("stopping %s pid=%s", name, proc.pid)
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        log.warning("%s did not exit, killing pid=%s", name, proc.pid)
        proc.kill()


def stop_all() -> None:
    global chrome, ffmpeg, chrome_profile
    stop_proc(ffmpeg, "ffmpeg")
    stop_proc(chrome, "chromium")
    ffmpeg = None
    chrome = None
    if chrome_profile:
        subprocess.run(["rm", "-rf", chrome_profile], check=False)
        chrome_profile = ""


def start_stack(key: str) -> None:
    global xvfb, chrome, ffmpeg, chrome_profile
    if xvfb is None or xvfb.poll() is not None:
        log.info("starting xvfb display=%s 1920x1080", DISPLAY)
        xvfb = subprocess.Popen(
            ["Xvfb", DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        drain_stderr(xvfb, "xvfb", key)
        time.sleep(0.4)
        if not running(xvfb):
            log.error("xvfb exited immediately")
    chrome_profile = f"/tmp/growcast-chrome-{os.getpid()}-{time.time_ns()}"
    capture = f"{GROWCAST_URL}/overlay/capture"
    log.info("starting chromium kiosk %s", capture)
    chrome = subprocess.Popen(
        [
            "chromium",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--autoplay-policy=no-user-gesture-required",
            "--kiosk",
            "--window-size=1920,1080",
            f"--user-data-dir={chrome_profile}",
            f"{capture}?token={TOKEN}",
        ],
        env={**os.environ, "DISPLAY": DISPLAY},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    drain_stderr(chrome, "chromium", key)
    time.sleep(2)
    if not running(chrome):
        log.error("chromium exited code=%s", chrome.returncode if chrome else "?")
    log.info("starting ffmpeg ingest=%s", INGEST)
    ffmpeg = subprocess.Popen(
        [
            "sh",
            "-c",
            'exec ffmpeg -hide_banner -loglevel error -f x11grab -draw_mouse 0 -video_size 1920x1080 -framerate 15 -i "$DISPLAY" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g 30 -b:v 2500k -maxrate 2500k -bufsize 5000k -c:a aac -shortest -f flv "$FFMPEG_OUTPUT"',
        ],
        env={**os.environ, "DISPLAY": DISPLAY, "FFMPEG_OUTPUT": f"{INGEST}/{key}"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    drain_stderr(ffmpeg, "ffmpeg", key)


def running(proc: subprocess.Popen[bytes] | None) -> bool:
    return proc is not None and proc.poll() is None


def shutdown(_signum: int | None = None, _frame: object | None = None) -> None:
    global stopping
    log.info("shutdown signal=%s", _signum)
    stopping = True
    stop_all()
    stop_proc(xvfb, "xvfb")
    write_status("off")
    raise SystemExit(0)


def main() -> None:
    global last_live_log
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "info").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    log.info(
        "boot growcast=%s token=%s ingest=%s data=%s",
        GROWCAST_URL,
        "set" if TOKEN else "missing",
        INGEST,
        DATA,
    )
    write_status("off")
    while not stopping:
        want = enabled()
        key = stream_key()
        if not want or not key or not TOKEN:
            if running(ffmpeg) or running(chrome):
                log.info("start not requested or missing credentials, stopping encode")
                stop_all()
                clear_note()
            if not want:
                note("idle (Settings Start not pressed)")
                write_status("off", "", key)
            elif not TOKEN:
                note("cannot start: GROWCAST_RESTREAM_TOKEN is missing", level=logging.ERROR)
                write_status("error", "missing GROWCAST_RESTREAM_TOKEN", key)
            else:
                note("cannot start: no Twitch stream key in Settings", level=logging.ERROR)
                write_status("error", "missing key", key)
            time.sleep(2)
            continue
        if not running(ffmpeg):
            code = ffmpeg.returncode if ffmpeg is not None else None
            if code is not None:
                log.warning("ffmpeg not running code=%s, restarting", code)
            stop_all()
            clear_note()
            write_status("starting", "", key)
            log.info("starting encode stack")
            start_stack(key)
            time.sleep(1)
            if running(ffmpeg):
                last_live_log = time.monotonic()
                log.info("live")
                write_status("live", "", key)
            else:
                log.error("ffmpeg failed to stay up code=%s", ffmpeg.returncode if ffmpeg else "?")
                write_status("error", "ffmpeg exited", key)
                stop_all()
                time.sleep(5)
            continue
        if not running(chrome):
            log.warning("chromium exited code=%s, reconnecting", chrome.returncode if chrome else "?")
            write_status("reconnecting", "", key)
            stop_all()
            clear_note()
            time.sleep(2)
            continue
        now = time.monotonic()
        if now - last_live_log >= 60:
            log.info(
                "still live chromium pid=%s ffmpeg pid=%s",
                chrome.pid if chrome else "?",
                ffmpeg.pid if ffmpeg else "?",
            )
            last_live_log = now
        write_status("live", "", key)
        time.sleep(2)


if __name__ == "__main__":
    main()
