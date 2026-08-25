#!/usr/bin/env python3
"""Watch GrowCast restream control files and push Chromium+overlay to Twitch."""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
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

xvfb: subprocess.Popen[bytes] | None = None
chrome: subprocess.Popen[bytes] | None = None
ffmpeg: subprocess.Popen[bytes] | None = None
chrome_profile = ""
stopping = False


def redact(text: str, key: str = "") -> str:
    out = re.sub(r"rtmps?://\S+", "[ingest]", text, flags=re.I)
    secret = key.strip()
    if secret:
        out = out.replace(secret, "[key]")
    return out[-400:]


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
    except (OSError, json.JSONDecodeError):
        return False
    return raw.get("enabled") is True


def stream_key() -> str:
    try:
        return KEY.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def stop_proc(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def stop_all() -> None:
    global chrome, ffmpeg, chrome_profile
    stop_proc(ffmpeg)
    stop_proc(chrome)
    ffmpeg = None
    chrome = None
    if chrome_profile:
        subprocess.run(["rm", "-rf", chrome_profile], check=False)
        chrome_profile = ""


def start_stack(key: str) -> None:
    global xvfb, chrome, ffmpeg, chrome_profile
    if xvfb is None or xvfb.poll() is not None:
        xvfb = subprocess.Popen(
            ["Xvfb", DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.4)
    chrome_profile = f"/tmp/growcast-chrome-{os.getpid()}-{time.time_ns()}"
    capture = f"{GROWCAST_URL}/overlay/capture?token={TOKEN}"
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
            capture,
        ],
        env={**os.environ, "DISPLAY": DISPLAY},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)
    ingest = f"{INGEST}/{key}"
    ffmpeg = subprocess.Popen(
        [
            "sh",
            "-c",
            'exec ffmpeg -hide_banner -loglevel error -f x11grab -draw_mouse 0 -video_size 1920x1080 -framerate 15 -i "$DISPLAY" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g 30 -b:v 2500k -maxrate 2500k -bufsize 5000k -c:a aac -shortest -f flv "$FFMPEG_OUTPUT"',
        ],
        env={**os.environ, "DISPLAY": DISPLAY, "FFMPEG_OUTPUT": ingest},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def running(proc: subprocess.Popen[bytes] | None) -> bool:
    return proc is not None and proc.poll() is None


def shutdown(_signum: int | None = None, _frame: object | None = None) -> None:
    global stopping
    stopping = True
    stop_all()
    stop_proc(xvfb)
    write_status("off")
    raise SystemExit(0)


def main() -> None:
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    write_status("off")
    while not stopping:
        want = enabled()
        key = stream_key()
        if not want or not key or not TOKEN:
            if running(ffmpeg) or running(chrome):
                stop_all()
            write_status(
                "off" if not want else "error",
                "" if not want else "missing key or GROWCAST_RESTREAM_TOKEN",
                key,
            )
            time.sleep(2)
            continue
        if not running(ffmpeg):
            stop_all()
            write_status("starting", "", key)
            start_stack(key)
            time.sleep(1)
            if running(ffmpeg):
                write_status("live", "", key)
            else:
                write_status("error", "ffmpeg exited", key)
                stop_all()
                time.sleep(5)
            continue
        if not running(chrome):
            write_status("reconnecting", "", key)
            stop_all()
            time.sleep(2)
            continue
        write_status("live", "", key)
        time.sleep(2)


if __name__ == "__main__":
    main()
