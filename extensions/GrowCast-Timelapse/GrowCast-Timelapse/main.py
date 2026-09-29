from __future__ import annotations

import datetime
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import requests
import schedule
from dotenv import load_dotenv

from api import SYNC_INTERVAL_MINUTES, SettingsSync
from config import (
    RuntimeState,
    config_validation_errors,
    load_config_from_environ,
    should_run_trigger,
)
from instance_lock import (
    LockHeldError,
    acquire_instance_lock,
    release_instance_lock,
    resolve_lock_path,
)

ENV_PATH = Path(os.environ.get("GROWCAST_TIMELAPSE_ENV", str(Path(__file__).resolve().parent / ".env")))

def detect_mode(argv: list[str]) -> str:
    if "--validate" in argv:
        return "validate"
    if "--snapshot" in argv:
        return "snapshot"
    if "--render" in argv:
        return "render"
    if "--test" in argv:
        return "test"
    return "daemon"

TIMELAPSE_VF = "hqdn3d=2.5:1.5:4:4,scale=-2:'min(1080,ih)':flags=lanczos"


def list_numeric_webps(directory: str) -> list[str]:
    names: list[str] = []
    if not os.path.isdir(directory):
        return names
    for name in os.listdir(directory):
        if name.lower().endswith(".webp"):
            base = os.path.splitext(name)[0]
            if base.isdigit():
                names.append(name)
    names.sort()
    return names


def concat_file_entry(path: str) -> str:
    resolved = os.path.abspath(path).replace("\\", "/")
    escaped = resolved.replace("'", r"'\''")
    return f"file '{escaped}'"


def write_concat_file(image_files: list[str], snapshot_dir: str, concat_path: str) -> None:
    lines = ["ffconcat version 1.0\n"]
    for name in image_files:
        lines.append(concat_file_entry(os.path.join(snapshot_dir, name)) + "\n")
    with open(concat_path, "w", encoding="utf-8") as handle:
        handle.writelines(lines)


def build_timelapse_cmd(fps: int, concat_path: str, crf: str, temp_file: str) -> list[str]:
    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-f",
        "concat",
        "-safe",
        "0",
        "-r",
        str(fps),
        "-i",
        concat_path,
        "-an",
        "-map_metadata",
        "-1",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        crf,
        "-maxrate",
        "10M",
        "-bufsize",
        "20M",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-vf",
        TIMELAPSE_VF,
        temp_file,
    ]


def _unlink_if_exists(path: str) -> None:
    if os.path.exists(path):
        os.remove(path)

def webhook(file_path: str, webhook_url: str, message: str = "New snapshot!") -> bool:
    if not webhook_url:
        print("WH_URL is not set, skipping upload.")
        return False

    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return False

    try:
        with open(file_path, "rb") as file:
            files = {"file": (os.path.basename(file_path), file)}
            data = {"content": message}
            response = requests.post(
                webhook_url,
                data=data,
                files=files,
                timeout=30,
            )

        if response.status_code in (200, 204):
            print(f"Webhook snapshot uploaded: {file_path}.")
            return True

        print(f"Webhook request failed: {response.status_code}")
        print(response.text)
        return False
    except Exception as e:
        print("Upload error:")
        print(e)
        return False

def create_filename(snapshot_dir: str) -> str:
    os.makedirs(snapshot_dir, exist_ok=True)
    existing = []
    for name in list_numeric_webps(snapshot_dir):
        base = os.path.splitext(name)[0]
        existing.append(int(base))
    next_number = max(existing, default=0) + 1
    return os.path.join(snapshot_dir, f"{next_number:04d}.webp")

def grab_snapshot(rtsp_url: str, snapshot_dir: str):
    print("Taking snapshot...")
    filename = create_filename(snapshot_dir)
    print(filename)

    cmd = [
        "ffmpeg",
        "-y",
        "-rtsp_transport",
        "tcp",
        "-i",
        rtsp_url,
        "-frames:v",
        "1",
        "-q:v",
        "80",
        filename,
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=60,
            text=True,
        )
    except subprocess.TimeoutExpired as e:
        print("ERROR: snapshot attempt timed out")
        if e.stderr:
            print(e.stderr)
        if os.path.exists(filename):
            os.remove(filename)
        return False

    if result.returncode == 0:
        print(f"File saved: {filename}")
        return filename

    print("ERROR: ")
    print(result.stderr)
    if os.path.exists(filename):
        os.remove(filename)
    return False

def save_snapshot(state: RuntimeState):
    cfg = state.config
    deadline = time.monotonic() + cfg.retry_max_seconds

    while True:
        snapshot = grab_snapshot(cfg.rtsp_url, cfg.snapshot_dir)
        if snapshot:
            return snapshot

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            print(
                f"Could not take snapshot within {cfg.retry_max_seconds} seconds - Giving up."
            )
            return False

        wait_seconds = min(cfg.retry_delay_seconds, remaining)
        print(f"Camera unavailable. Retrying in {int(wait_seconds)} seconds...")
        time.sleep(wait_seconds)

def create_timelapse(state: RuntimeState) -> bool:
    cfg = state.config
    print("Creating timelapse...")
    os.makedirs(cfg.timelapse_dir, exist_ok=True)

    image_files = list_numeric_webps(cfg.snapshot_dir)
    if not image_files:
        print("No images found.")
        return False

    image_count = len(image_files)
    fps = max(1, math.ceil(image_count / cfg.timelapse_length_seconds))
    output_file = os.path.join(cfg.timelapse_dir, "latest_timelapse.mp4")
    # Write to a sibling file first. ffmpeg +faststart remuxes the finished
    # MP4 (moves moov to the start). Overwriting the published path in place
    # can leave two moov atoms and a truncated mdat that browsers cannot play.
    temp_file = os.path.join(cfg.timelapse_dir, "latest_timelapse.partial.mp4")
    concat_path = os.path.join(cfg.timelapse_dir, "latest_timelapse.concat.txt")
    write_concat_file(image_files, cfg.snapshot_dir, concat_path)
    cmd = build_timelapse_cmd(fps, concat_path, cfg.quality_crf(), temp_file)

    print(f"Creating timelapse, found {image_count} images, {fps} fps ...")

    result = subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode == 0:
        os.replace(temp_file, output_file)
        _unlink_if_exists(concat_path)
        print(f"Timelapse saved: {output_file}")
        return True

    print("ERROR: ")
    print(result.stderr)
    _unlink_if_exists(temp_file)
    _unlink_if_exists(concat_path)
    return False

def trigger(state: RuntimeState):
    if not should_run_trigger(state):
        print(
            "Paused - skipping snapshot at "
            f"{datetime.datetime.now().strftime('%d - %m - %Y // %H : %M')}"
        )
        return

    print(
        "Trigger has been executed at "
        f"{datetime.datetime.now().strftime('%d - %m - %Y // %H : %M')}"
    )
    success = save_snapshot(state)
    if success:
        webhook(
            success,
            state.config.webhook_url,
            datetime.datetime.now().strftime("%d - %m - %Y // %H : %M"),
        )
        create_timelapse(state)

def welcome(state: RuntimeState, settings_sync: SettingsSync) -> None:
    cfg = state.config
    print("Configuration looks good!")
    print("GrowCast Timelapse started!")
    print("---------------------------")
    if cfg.time1 or cfg.time2 or cfg.time3:
        print(f"Times set: {cfg.time1} {cfg.time2} {cfg.time3}")
    interval = (cfg.interval or "").strip()
    if interval and interval != "-":
        print(f"Snapshot interval: {interval} minutes")
    else:
        print("Snapshot interval: (using fixed TIME_* only)")
    print(f"Snapshot directory: {cfg.snapshot_dir}")
    print("---------------------------")
    print(f"Timelapse directory: {cfg.timelapse_dir}")
    print(f"Timelapse length: {cfg.timelapse_length_seconds} seconds")
    print(f"Timelapse quality: {cfg.timelapse_quality}")
    print("---------------------------")
    if settings_sync.enabled:
        print(
            f"API sync: enabled ({cfg.api_url}, every {SYNC_INTERVAL_MINUTES} min)"
        )
        print(f"Paused: {state.paused}")
    else:
        print("API sync: disabled")
    print("---------------------------")

def print_errors(errors: list[str]) -> None:
    for err in errors:
        print(err)

def reschedule_jobs(state: RuntimeState, settings_sync: SettingsSync) -> None:
    schedule.clear()
    cfg = state.config

    if cfg.time1:
        schedule.every().day.at(cfg.time1).do(trigger, state)
    if cfg.time2:
        schedule.every().day.at(cfg.time2).do(trigger, state)
    if cfg.time3:
        schedule.every().day.at(cfg.time3).do(trigger, state)

    minutes = cfg.interval_minutes()
    if minutes is not None and minutes > 0:
        schedule.every(minutes).minutes.do(trigger, state)

    if settings_sync.enabled:
        schedule.every(SYNC_INTERVAL_MINUTES).minutes.do(settings_sync.sync)

def run_daemon(state: RuntimeState, settings_sync: SettingsSync) -> None:
    if settings_sync.enabled:
        settings_sync.sync()

    errors = config_validation_errors(state.config, require_rtsp=True)
    if errors:
        print_errors(errors)
        raise ValueError("Invalid .env configuration")

    welcome(state, settings_sync)
    reschedule_jobs(state, settings_sync)

    while True:
        schedule.run_pending()
        time.sleep(1)

def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    mode = detect_mode(argv)

    load_dotenv(ENV_PATH)
    config, errors = load_config_from_environ()

    if mode == "validate":
        if errors:
            print_errors(errors)
        print("input valid:", len(errors) == 0)
        return 0

    state = RuntimeState(config=config)

    settings_sync: SettingsSync

    def on_reschedule() -> None:
        reschedule_jobs(state, settings_sync)

    settings_sync = SettingsSync(ENV_PATH, state, on_reschedule=on_reschedule)

    if mode == "snapshot":
        if not config.rtsp_url:
            print("RTSP_STREAM is required")
            return 1
        if any("TIMELAPSE_LENGTH" in e or "RETRY_" in e for e in errors):
            numeric_errors = [
                e
                for e in errors
                if e.startswith("RETRY_") or e.startswith("TIMELAPSE_LENGTH")
            ]
            if numeric_errors:
                print_errors(numeric_errors)
                return 1
    elif mode == "render":
        length_errors = [e for e in errors if e.startswith("TIMELAPSE_")]
        if length_errors:
            print_errors(length_errors)
            return 1
    elif mode == "test":
        if errors:
            print_errors(errors)
            raise ValueError("Invalid .env configuration")

    skip_lock = os.getenv("SKIP_LOCK", "0").lower() in ("1", "true", "yes")
    if not skip_lock:
        lock_path = resolve_lock_path(config.snapshot_dir, os.getenv("LOCK_FILE"))
        try:
            acquired = acquire_instance_lock(lock_path)
            print(f"[lock] Acquired lock {acquired} (PID {os.getpid()})")
        except LockHeldError as e:
            print(f"ERROR: {e}")
            print(f"Lock file: {e.lock_path}")
            print("If the old instance crashed, delete the lockfile manually,")
            print("or start with SKIP_LOCK=1 (not recommended for normal use).")
            return 1

    if mode == "snapshot":
        save_snapshot(state)
        return 0

    if mode == "render":
        create_timelapse(state)
        return 0

    if mode == "test":
        trigger(state)
        return 0

    run_daemon(state, settings_sync)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        release_instance_lock()
        raise
