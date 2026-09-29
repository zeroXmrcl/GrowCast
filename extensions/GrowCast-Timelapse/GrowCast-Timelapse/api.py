from __future__ import annotations

import datetime
from enum import Enum
from pathlib import Path
from typing import Callable

import requests

from config import (
    RuntimeState,
    api_settings_to_env_values,
    env_values_key,
    merge_api_settings,
    update_env_file,
)

PLUGIN_ID = "growcast.timelapse"
SYNC_INTERVAL_MINUTES = 10

class SyncResult(Enum):
    APPLIED = "applied"
    NO_CHANGE = "no_change"
    FAILED = "failed"

def log_api(message: str) -> None:
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[API {timestamp}] {message}")

class SettingsSync:

    def __init__(
        self,
        env_path: Path,
        state: RuntimeState,
        on_reschedule: Callable[[], None],
    ):
        self.env_path = Path(env_path)
        self.state = state
        self.on_reschedule = on_reschedule
        self.last_settings_version = None
        self.last_applied_env_key = None

    @property
    def enabled(self) -> bool:
        cfg = self.state.config
        return bool(cfg.api_url and cfg.api_token)

    def fetch_mesh_settings(self) -> dict:
        cfg = self.state.config
        base_url = cfg.api_url.rstrip("/")
        url = f"{base_url}/api/mesh/{PLUGIN_ID}"
        log_api(f"Fetching settings from {url}")

        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {cfg.api_token}"},
            timeout=30,
            allow_redirects=False,
        )
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError:
            preview = (response.text or "")[:200]
            raise ValueError(
                f"API returned non-JSON response (status={response.status_code}): {preview!r}"
            ) from None
        log_api(
            f"Fetched settings (version={payload.get('settingsVersion')}, "
            f"paused={payload.get('settings', {}).get('paused')})"
        )
        return payload

    def settings_changed(self, settings: dict, settings_version) -> bool:
        env_values = api_settings_to_env_values(settings)
        env_key = env_values_key(env_values)

        if settings_version is not None:
            return self.last_settings_version != settings_version

        if self.last_applied_env_key is None:
            return True

        if env_key != self.last_applied_env_key:
            log_api("settingsVersion missing; applying because settings content changed")
            return True

        return False

    def apply_settings(self, settings: dict, settings_version) -> SyncResult:
        candidate, errors = merge_api_settings(self.state.config, settings)
        if errors or candidate is None:
            for err in errors:
                log_api(f"Rejected API settings: {err}")
            if not errors:
                log_api("Rejected API settings: validation failed")
            return SyncResult.FAILED

        previous_config = self.state.config
        previous_version = self.last_settings_version
        previous_key = self.last_applied_env_key
        env_updates = candidate.to_sync_env_updates()

        self.state.config = candidate
        candidate.apply_timezone()

        try:
            update_env_file(self.env_path, env_updates)
        except OSError as e:
            log_api(f"Failed to write .env: {e}")
            self.state.config = previous_config
            previous_config.apply_timezone()
            self.last_settings_version = previous_version
            self.last_applied_env_key = previous_key
            return SyncResult.FAILED

        self.last_settings_version = settings_version
        self.last_applied_env_key = env_values_key(env_updates)

        cfg = self.state.config
        log_api(
            f"Applied settings to .env (version={settings_version}, paused={self.state.paused}, "
            f"TIME_1={cfg.time1 or '-'}, TIME_2={cfg.time2 or '-'}, "
            f"TIME_3={cfg.time3 or '-'}, INTERVAL={cfg.interval or '-'}, "
            f"TIMELAPSE_LENGTH_SECONDS={cfg.timelapse_length_seconds}, "
            f"TIMELAPSE_QUALITY={cfg.timelapse_quality})"
        )

        self.on_reschedule()
        return SyncResult.APPLIED

    def sync(self) -> SyncResult:
        try:
            payload = self.fetch_mesh_settings()
        except Exception as e:
            log_api(f"Failed to fetch settings: {e}")
            return SyncResult.FAILED

        settings_version = payload.get("settingsVersion")
        settings = payload.get("settings", {}) or {}

        self.state.paused = bool(settings.get("paused", False))

        if not self.settings_changed(settings, settings_version):
            return SyncResult.NO_CHANGE

        return self.apply_settings(settings, settings_version)
