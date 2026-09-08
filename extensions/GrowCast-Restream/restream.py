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
TOKEN_FILE = DATA / "capture.token"
GROWCAST_URL = os.environ.get("GROWCAST_URL", "http://growcast:3000").rstrip("/")
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


def capture_token() -> str:
    env = os.environ.get("GROWCAST_RESTREAM_TOKEN", "").strip()
    if env:
        return env
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def redact(text: str, key: str = "", token: str = "") -> str:
    out = re.sub(r"rtmps?://\S+", "[ingest]", text, flags=re.I)
    secret = key.strip()
    if secret:
        out = out.replace(secret, "[key]")
    secret_token = token.strip()
    if secret_token:
        out = out.replace(secret_token, "[token]")
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
        "lastError": redact(last_error, key, capture_token()),
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


def drain_stderr(proc: subprocess.Popen[bytes], name: str, key: str, token: str) -> None:
    level = logging.DEBUG if name in NOISY_STDERR else logging.WARNING

    def run() -> None:
        if proc.stderr is None:
            return
        for raw in proc.stderr:
            line = redact(raw.decode("utf-8", "replace"), key, token).rstrip()
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


PULSE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")
SILENT_AUDIO = "-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100"


def pulse_socket() -> str:
    runtime = os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/runtime-{os.getuid()}"
    return f"unix:{runtime}/pulse/native"


def limited_env(**extra: str) -> dict[str, str]:
    env: dict[str, str] = {"DISPLAY": DISPLAY}
    for name in ("PATH", "HOME", "XDG_RUNTIME_DIR", "PULSE_SERVER", "LANG"):
        value = os.environ.get(name)
        if value:
            env[name] = value
    env.setdefault("XDG_RUNTIME_DIR", f"/tmp/runtime-{os.getuid()}")
    env.setdefault("PULSE_SERVER", pulse_socket())
    env.update(extra)
    return env


def ensure_xdg_runtime_dir() -> None:
    runtime = os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/runtime-{os.getuid()}"
    try:
        Path(runtime).mkdir(parents=True, exist_ok=True)
        os.chmod(runtime, 0o700)
    except OSError as err:
        log.warning("XDG_RUNTIME_DIR %s: %s", runtime, err)
        return
    os.environ["XDG_RUNTIME_DIR"] = runtime


def pulse_is_running() -> bool:
    try:
        return (
            subprocess.run(
                ["pulseaudio", "--check"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=3,
            ).returncode
            == 0
        )
    except (OSError, subprocess.TimeoutExpired):
        return False


def _pactl(*args: str) -> None:
    try:
        subprocess.run(
            ["pactl", *args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def _pactl_out(*args: str) -> str:
    try:
        listed = subprocess.run(
            ["pactl", *args],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if listed.returncode != 0:
        return ""
    return listed.stdout.strip()


def _safe_pulse_name(value: str) -> str:
    name = value.strip().splitlines()[0] if value.strip() else ""
    if PULSE_NAME.fullmatch(name):
        return name
    return ""


def _prepare_pulse_sink() -> None:
    _pactl("load-module", "module-always-sink")
    sink = _safe_pulse_name(_pactl_out("get-default-sink"))
    if sink:
        _pactl("set-default-source", f"{sink}.monitor")


def pulse_record_source() -> str:
    source = _safe_pulse_name(_pactl_out("get-default-source"))
    if source:
        return source
    sink = _safe_pulse_name(_pactl_out("get-default-sink"))
    if sink:
        return f"{sink}.monitor"
    return "default"


def pulse_audio_input() -> str:
    return f"-f pulse -i {pulse_record_source()}"


def ensure_pulse() -> bool:
    ensure_xdg_runtime_dir()
    os.environ["PULSE_SERVER"] = pulse_socket()
    if not pulse_is_running():
        try:
            started = subprocess.run(
                ["pulseaudio", "--start", "--exit-idle-time=-1", "--disable-shm"],
                capture_output=True,
                timeout=8,
            )
        except FileNotFoundError:
            log.warning("pulseaudio not installed")
            return False
        except (OSError, subprocess.TimeoutExpired) as err:
            log.warning("pulseaudio not started: %s", err)
            return False
        if started.returncode != 0:
            err = redact(started.stderr.decode("utf-8", "replace"))
            log.warning("pulseaudio start failed: %s", err.strip() or started.returncode)
            return False
        log.info("pulseaudio started")
    for _ in range(10):
        _prepare_pulse_sink()
        if pulse_record_source() != "default":
            break
        time.sleep(0.2)
    log.info("pulse source=%s server=%s", pulse_record_source(), os.environ.get("PULSE_SERVER", ""))
    if pulse_is_running():
        return True
    log.warning("pulseaudio daemon is not running")
    return False


def ffmpeg_command(audio_input: str) -> str:
    return (
        "exec ffmpeg -hide_banner -loglevel error "
        '-f x11grab -draw_mouse 0 -video_size 1920x1080 -framerate 15 -i "$DISPLAY" '
        f"{audio_input} "
        "-c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g 30 "
        "-b:v 2500k -maxrate 2500k -bufsize 5000k -c:a aac -f flv "
        '"$FFMPEG_OUTPUT"'
    )


def spawn_ffmpeg(audio_input: str, key: str, token: str) -> subprocess.Popen[bytes]:
    proc = subprocess.Popen(
        ["sh", "-c", ffmpeg_command(audio_input)],
        env=limited_env(FFMPEG_OUTPUT=f"{INGEST}/{key}"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    drain_stderr(proc, "ffmpeg", key, token)
    return proc


def start_stack(key: str, token: str) -> None:
    global xvfb, chrome, ffmpeg, chrome_profile
    if xvfb is None or xvfb.poll() is not None:
        log.info("starting xvfb display=%s 1920x1080", DISPLAY)
        xvfb = subprocess.Popen(
            ["Xvfb", DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        drain_stderr(xvfb, "xvfb", key, token)
        time.sleep(0.4)
        if not running(xvfb):
            log.error("xvfb exited immediately")
    ensure_pulse()
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
            f"{capture}?token={token}",
        ],
        env=limited_env(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    drain_stderr(chrome, "chromium", key, token)
    time.sleep(2)
    if not running(chrome):
        log.error("chromium exited code=%s", chrome.returncode if chrome else "?")
    log.info("pulse sink-inputs=%s", _pactl_out("list", "short", "sink-inputs") or "none")
    log.info("starting ffmpeg ingest=%s", INGEST)
    if pulse_is_running():
        source = pulse_record_source()
        ffmpeg = spawn_ffmpeg(pulse_audio_input(), key, token)
        deadline = time.monotonic() + 1.0
        while running(ffmpeg) and time.monotonic() < deadline:
            time.sleep(0.1)
        if running(ffmpeg):
            log.info("ffmpeg audio=pulse source=%s", source)
            return
        log.warning("ffmpeg pulse input failed, falling back to anullsrc")
        stop_proc(ffmpeg, "ffmpeg")
        ffmpeg = None
    else:
        log.warning("pulse missing, ffmpeg audio=anullsrc")
    ffmpeg = spawn_ffmpeg(SILENT_AUDIO, key, token)
    log.info("ffmpeg audio=anullsrc")


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
        "set" if capture_token() else "missing",
        INGEST,
        DATA,
    )
    write_status("off")
    while not stopping:
        want = enabled()
        key = stream_key()
        token = capture_token()
        if not want or not key or not token:
            if running(ffmpeg) or running(chrome):
                log.info("start not requested or missing credentials, stopping encode")
                stop_all()
                clear_note()
            if not want:
                note("idle (Settings Start not pressed)")
                write_status("off", "", key)
            elif not token:
                note("cannot start: token=missing", level=logging.ERROR)
                write_status("error", "token=missing", key)
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
            start_stack(key, token)
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
