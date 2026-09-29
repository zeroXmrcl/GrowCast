from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api import SettingsSync, SyncResult  # noqa: E402
from config import AppConfig, RuntimeState, should_run_trigger  # noqa: E402
from instance_lock import (  # noqa: E402
    LockHeldError,
    acquire_instance_lock,
    is_pid_running,
    read_lock_pid,
    release_instance_lock,
)
from main import trigger  # noqa: E402

class PauseTests(unittest.TestCase):
    def test_should_run_trigger_respects_pause(self):
        state = RuntimeState(config=AppConfig(rtsp_url="rtsp://x", time1="08:00"))
        self.assertTrue(should_run_trigger(state))
        state.paused = True
        self.assertFalse(should_run_trigger(state))
        state.paused = False
        self.assertTrue(should_run_trigger(state))

    def test_trigger_skips_when_paused(self):
        state = RuntimeState(
            config=AppConfig(rtsp_url="rtsp://x", time1="08:00"),
            paused=True,
        )
        with mock.patch("main.save_snapshot") as save:
            trigger(state)
            save.assert_not_called()

    def test_trigger_runs_when_not_paused(self):
        state = RuntimeState(
            config=AppConfig(rtsp_url="rtsp://x", time1="08:00", webhook_url=""),
            paused=False,
        )
        with mock.patch("main.save_snapshot", return_value=False) as save:
            trigger(state)
            save.assert_called_once_with(state)

class AtomicApplyTests(unittest.TestCase):
    def _base_state(self, tmp: str) -> RuntimeState:
        return RuntimeState(
            config=AppConfig(
                rtsp_url="rtsp://cam",
                api_url="http://api.example",
                api_token="tok",
                time1="06:00",
                timelapse_length_seconds=10,
                timelapse_quality="medium",
                snapshot_dir=tmp,
            )
        )

    def test_apply_success_updates_runtime_env_and_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("RTSP_STREAM=rtsp://cam\nTIME_1=06:00\n", encoding="utf-8")
            state = self._base_state(tmp)
            rescheduled = []

            sync = SettingsSync(env_path, state, on_reschedule=lambda: rescheduled.append(1))
            result = sync.apply_settings(
                {
                    "timezone": "UTC",
                    "time1": "09:30",
                    "time2": "",
                    "time3": "",
                    "intervalMinutes": 20,
                    "timelapseLengthSeconds": 15,
                    "timelapseQuality": "high",
                    "paused": False,
                },
                settings_version=42,
            )
            self.assertEqual(result, SyncResult.APPLIED)
            self.assertEqual(sync.last_settings_version, 42)
            self.assertEqual(state.config.time1, "09:30")
            self.assertEqual(state.config.interval, "20")
            self.assertEqual(state.config.timelapse_length_seconds, 15)
            self.assertEqual(state.config.timelapse_quality, "high")
            text = env_path.read_text(encoding="utf-8")
            self.assertIn("TIME_1=09:30", text)
            self.assertIn("INTERVAL=20", text)
            self.assertIn("RTSP_STREAM=rtsp://cam", text)
            self.assertEqual(rescheduled, [1])

    def test_apply_validation_failure_updates_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("RTSP_STREAM=rtsp://cam\nTIME_1=06:00\n", encoding="utf-8")
            original = env_path.read_text(encoding="utf-8")
            state = self._base_state(tmp)
            before = state.config
            rescheduled = []

            sync = SettingsSync(env_path, state, on_reschedule=lambda: rescheduled.append(1))
            sync.last_settings_version = 7
            result = sync.apply_settings(
                {
                    "time1": "not-a-time",
                    "timelapseQuality": "medium",
                    "timelapseLengthSeconds": 10,
                },
                settings_version=99,
            )
            self.assertEqual(result, SyncResult.FAILED)
            self.assertEqual(sync.last_settings_version, 7)
            self.assertIs(state.config, before)
            self.assertEqual(state.config.time1, "06:00")
            self.assertEqual(env_path.read_text(encoding="utf-8"), original)
            self.assertEqual(rescheduled, [])

    def test_apply_write_failure_rolls_back_runtime_and_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("TIME_1=06:00\n", encoding="utf-8")
            state = self._base_state(tmp)
            before = state.config
            sync = SettingsSync(env_path, state, on_reschedule=lambda: None)
            sync.last_settings_version = 3

            with mock.patch("api.update_env_file", side_effect=OSError("disk full")):
                result = sync.apply_settings(
                    {
                        "time1": "11:00",
                        "timelapseLengthSeconds": 10,
                        "timelapseQuality": "medium",
                    },
                    settings_version=100,
                )

            self.assertEqual(result, SyncResult.FAILED)
            self.assertEqual(sync.last_settings_version, 3)
            self.assertIs(state.config, before)
            self.assertEqual(state.config.time1, "06:00")

    def test_sync_sets_pause_even_when_no_settings_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            state = self._base_state(tmp)
            sync = SettingsSync(env_path, state, on_reschedule=lambda: None)
            sync.last_settings_version = 5
            payload = {
                "settingsVersion": 5,
                "settings": {
                    "paused": True,
                    "time1": "06:00",
                    "timelapseLengthSeconds": 10,
                    "timelapseQuality": "medium",
                },
            }
            with mock.patch.object(sync, "fetch_mesh_settings", return_value=payload):
                result = sync.sync()
            self.assertEqual(result, SyncResult.NO_CHANGE)
            self.assertTrue(state.paused)

class LockTests(unittest.TestCase):
    def test_second_acquire_fails_while_holder_live(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / ".timelapse.lock"
            acquire_instance_lock(lock_path, install_handlers=False)
            try:
                with self.assertRaises(LockHeldError):
                    acquire_instance_lock(
                        lock_path,
                        install_handlers=False,
                        is_running=lambda _pid: True,
                    )
            finally:
                release_instance_lock(lock_path)

    def test_stale_lock_from_dead_pid_is_recoverable(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / ".timelapse.lock"
            dead_pid = 999_999_999
            self.assertFalse(is_pid_running(dead_pid))
            lock_path.write_text(f"{dead_pid}\n", encoding="utf-8")

            acquired = acquire_instance_lock(
                lock_path,
                install_handlers=False,
                is_running=is_pid_running,
            )
            try:
                self.assertEqual(acquired, lock_path)
                self.assertEqual(read_lock_pid(lock_path), os.getpid())
            finally:
                release_instance_lock(lock_path)

    def test_exclusive_create_prevents_double_owner_without_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / ".timelapse.lock"
            acquire_instance_lock(lock_path, pid=111, install_handlers=False)
            try:
                with self.assertRaises(LockHeldError) as ctx:
                    acquire_instance_lock(
                        lock_path,
                        pid=222,
                        install_handlers=False,
                        is_running=lambda pid: pid == 111,
                    )
                self.assertEqual(ctx.exception.holder_pid, 111)
            finally:
                if lock_path.exists():
                    lock_path.unlink()
                import instance_lock as il

                il._held_lock_path = None

class NoCatchUpTests(unittest.TestCase):
    def test_no_catchup_symbols_in_shipped_modules(self):
        names = ("api.py", "main.py", "config.py", "instance_lock.py")
        banned = (
            "catch_up",
            "catchup",
            "missed_while_paused",
            "run_pending_catchup",
            "PauseGate",
        )
        for name in names:
            text = (ROOT / name).read_text(encoding="utf-8").lower()
            for token in banned:
                self.assertNotIn(
                    token.lower(),
                    text,
                    msg=f"{name} still contains {token}",
                )

if __name__ == "__main__":
    unittest.main()
