from __future__ import annotations

import datetime
import os
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Mapping

QUALITY_VALUES = ("low", "medium", "high")
QUALITY_CRF = {
    "low": "28",
    "medium": "26",
    "high": "23",
}

def parse_int_setting(
    name: str,
    value: Any,
    *,
    minimum: int | None = None,
    exclusive_minimum: bool = False,
) -> tuple[int | None, str | None]:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, f"{name} must be an integer"

    if minimum is not None:
        if exclusive_minimum and parsed <= minimum:
            return None, f"{name} must be > {minimum}"
        if not exclusive_minimum and parsed < minimum:
            return None, f"{name} must be >= {minimum}"

    return parsed, None

def api_settings_to_env_values(settings: Mapping[str, Any]) -> dict[str, str]:
    interval = settings.get("intervalMinutes")
    return {
        "TZ": settings.get("timezone") or "UTC",
        "TIME_1": settings.get("time1") or "",
        "TIME_2": settings.get("time2") or "",
        "TIME_3": settings.get("time3") or "",
        "INTERVAL": "" if interval is None else str(interval),
        "TIMELAPSE_LENGTH_SECONDS": str(settings.get("timelapseLengthSeconds", 10)),
        "TIMELAPSE_QUALITY": settings.get("timelapseQuality") or "medium",
    }

def env_values_key(env_values: Mapping[str, str]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((str(k), str(v)) for k, v in env_values.items()))

def validate_env_values(env_values: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []

    times = [env_values.get("TIME_1"), env_values.get("TIME_2"), env_values.get("TIME_3")]
    times = [t for t in times if t]

    for t in times:
        try:
            datetime.datetime.strptime(str(t), "%H:%M")
        except ValueError:
            errors.append(f"Invalid time format: {t} (expected HH:MM)")

    interval_raw = env_values.get("INTERVAL", "") or ""
    interval_raw = str(interval_raw).strip()
    if interval_raw:
        interval, err = parse_int_setting("INTERVAL", interval_raw, minimum=0, exclusive_minimum=True)
        if err:
            if "must be an integer" in err:
                errors.append("INTERVAL must be an integer")
            else:
                errors.append("INTERVAL must be > 0")
        elif interval is not None and interval <= 0:
            errors.append("INTERVAL must be > 0")

    if not times and not interval_raw:
        errors.append("You must define TIME_X or INTERVAL")

    quality = env_values.get("TIMELAPSE_QUALITY", "medium") or "medium"
    if quality not in QUALITY_VALUES:
        errors.append(f"Invalid TIMELAPSE_QUALITY: {quality}")

    _, length_err = parse_int_setting(
        "TIMELAPSE_LENGTH_SECONDS",
        env_values.get("TIMELAPSE_LENGTH_SECONDS", "10"),
        minimum=0,
        exclusive_minimum=True,
    )
    if length_err:
        errors.append(length_err)

    for key, minimum, exclusive in (
        ("RETRY_MAX_SECONDS", 0, False),
        ("RETRY_DELAY_SECONDS", 0, True),
    ):
        if key not in env_values:
            continue
        raw = env_values[key]
        if raw is None or raw == "":
            continue
        _, err = parse_int_setting(key, raw, minimum=minimum, exclusive_minimum=exclusive)
        if err:
            errors.append(err)

    return errors

def update_env_file(env_path: Path, updates: Mapping[str, str]) -> None:
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)

    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line if line.endswith("\n") else line + "\n")
            continue
        if "=" in stripped:
            key, _, _ = stripped.partition("=")
            key = key.strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}\n")
                updated_keys.add(key)
                continue
        new_lines.append(line if line.endswith("\n") else line + "\n")

    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}\n")

    env_path.write_text("".join(new_lines), encoding="utf-8")

@dataclass(frozen=True)
class AppConfig:

    tz: str = "UTC"
    time1: str = ""
    time2: str = ""
    time3: str = ""
    interval: str = ""
    timelapse_length_seconds: int = 10
    timelapse_quality: str = "medium"
    retry_max_seconds: int = 3600
    retry_delay_seconds: int = 60
    api_url: str = ""
    api_token: str = ""
    rtsp_url: str = ""
    snapshot_dir: str = "./snapshots"
    timelapse_dir: str = "./timelapse"
    webhook_url: str = ""

    def quality_crf(self) -> str:
        return QUALITY_CRF[self.timelapse_quality]

    def interval_minutes(self) -> int | None:
        raw = (self.interval or "").strip()
        if not raw:
            return None
        return int(raw)

    def to_sync_env_updates(self) -> dict[str, str]:
        return {
            "TZ": self.tz or "UTC",
            "TIME_1": self.time1 or "",
            "TIME_2": self.time2 or "",
            "TIME_3": self.time3 or "",
            "INTERVAL": self.interval or "",
            "TIMELAPSE_LENGTH_SECONDS": str(self.timelapse_length_seconds),
            "TIMELAPSE_QUALITY": self.timelapse_quality,
        }

    def apply_timezone(self) -> None:
        if self.tz:
            os.environ["TZ"] = self.tz
            if hasattr(time, "tzset"):
                time.tzset()

@dataclass
class RuntimeState:

    config: AppConfig
    paused: bool = False

def should_run_trigger(state: RuntimeState) -> bool:
    return not state.paused

def config_validation_errors(config: AppConfig, *, require_rtsp: bool = True) -> list[str]:
    errors = validate_env_values(
        {
            "TIME_1": config.time1,
            "TIME_2": config.time2,
            "TIME_3": config.time3,
            "INTERVAL": config.interval,
            "TIMELAPSE_LENGTH_SECONDS": str(config.timelapse_length_seconds),
            "TIMELAPSE_QUALITY": config.timelapse_quality,
            "RETRY_MAX_SECONDS": str(config.retry_max_seconds),
            "RETRY_DELAY_SECONDS": str(config.retry_delay_seconds),
        }
    )
    if require_rtsp and not config.rtsp_url:
        errors.append("RTSP_STREAM is required")
    return errors

def load_config_from_environ() -> tuple[AppConfig, list[str]]:
    errors: list[str] = []

    length, err = parse_int_setting(
        "TIMELAPSE_LENGTH_SECONDS",
        os.getenv("TIMELAPSE_LENGTH_SECONDS", "10"),
        minimum=0,
        exclusive_minimum=True,
    )
    if err:
        errors.append(err)
        length = 10

    retry_max, err = parse_int_setting(
        "RETRY_MAX_SECONDS",
        os.getenv("RETRY_MAX_SECONDS", "3600"),
        minimum=0,
    )
    if err:
        errors.append(err)
        retry_max = 3600

    retry_delay, err = parse_int_setting(
        "RETRY_DELAY_SECONDS",
        os.getenv("RETRY_DELAY_SECONDS", "60"),
        minimum=0,
        exclusive_minimum=True,
    )
    if err:
        errors.append(err)
        retry_delay = 60

    assert length is not None and retry_max is not None and retry_delay is not None

    config = AppConfig(
        tz=os.getenv("TZ") or "UTC",
        time1=os.getenv("TIME_1") or "",
        time2=os.getenv("TIME_2") or "",
        time3=os.getenv("TIME_3") or "",
        interval=os.getenv("INTERVAL") or "",
        timelapse_length_seconds=length,
        timelapse_quality=os.getenv("TIMELAPSE_QUALITY") or "medium",
        retry_max_seconds=retry_max,
        retry_delay_seconds=retry_delay,
        api_url=os.getenv("API_URL") or "",
        api_token=os.getenv("API_TOKEN") or "",
        rtsp_url=os.getenv("RTSP_STREAM") or "",
        snapshot_dir=os.getenv("SNAPSHOT_DIR_OUT") or "./snapshots",
        timelapse_dir=os.getenv("TIMELAPSE_DIR_OUT") or "./timelapse",
        webhook_url=os.getenv("WH_URL") or "",
    )

    schedule_errors = validate_env_values(
        {
            "TIME_1": config.time1,
            "TIME_2": config.time2,
            "TIME_3": config.time3,
            "INTERVAL": config.interval,
            "TIMELAPSE_LENGTH_SECONDS": os.getenv("TIMELAPSE_LENGTH_SECONDS", "10"),
            "TIMELAPSE_QUALITY": os.getenv("TIMELAPSE_QUALITY") or "medium",
            "RETRY_MAX_SECONDS": os.getenv("RETRY_MAX_SECONDS", "3600"),
            "RETRY_DELAY_SECONDS": os.getenv("RETRY_DELAY_SECONDS", "60"),
        }
    )
    for msg in schedule_errors:
        if msg not in errors:
            errors.append(msg)

    if not config.rtsp_url:
        errors.append("RTSP_STREAM is required")

    return config, errors

def merge_api_settings(base: AppConfig, settings: Mapping[str, Any]) -> tuple[AppConfig | None, list[str]]:
    env_values = api_settings_to_env_values(settings)
    errors = validate_env_values(env_values)
    if errors:
        return None, errors

    length, length_err = parse_int_setting(
        "TIMELAPSE_LENGTH_SECONDS",
        env_values["TIMELAPSE_LENGTH_SECONDS"],
        minimum=0,
        exclusive_minimum=True,
    )
    if length_err or length is None:
        return None, errors + ([length_err] if length_err else ["TIMELAPSE_LENGTH_SECONDS invalid"])

    return (
        replace(
            base,
            tz=env_values["TZ"],
            time1=env_values["TIME_1"],
            time2=env_values["TIME_2"],
            time3=env_values["TIME_3"],
            interval=env_values["INTERVAL"],
            timelapse_length_seconds=length,
            timelapse_quality=env_values["TIMELAPSE_QUALITY"],
        ),
        [],
    )
