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

from config import (  # noqa: E402
    AppConfig,
    api_settings_to_env_values,
    load_config_from_environ,
    merge_api_settings,
    update_env_file,
    validate_env_values,
)

class ApiMappingTests(unittest.TestCase):
    def test_maps_representative_valid_payload(self):
        settings = {
            "timezone": "Europe/Berlin",
            "time1": "08:00",
            "time2": "12:30",
            "time3": "",
            "intervalMinutes": 15,
            "timelapseLengthSeconds": 20,
            "timelapseQuality": "high",
        }
        env_values = api_settings_to_env_values(settings)
        self.assertEqual(env_values["TZ"], "Europe/Berlin")
        self.assertEqual(env_values["TIME_1"], "08:00")
        self.assertEqual(env_values["TIME_2"], "12:30")
        self.assertEqual(env_values["TIME_3"], "")
        self.assertEqual(env_values["INTERVAL"], "15")
        self.assertEqual(env_values["TIMELAPSE_LENGTH_SECONDS"], "20")
        self.assertEqual(env_values["TIMELAPSE_QUALITY"], "high")
        self.assertEqual(validate_env_values(env_values), [])

    def test_interval_none_becomes_empty(self):
        env_values = api_settings_to_env_values(
            {
                "time1": "09:00",
                "intervalMinutes": None,
                "timelapseLengthSeconds": 10,
                "timelapseQuality": "medium",
            }
        )
        self.assertEqual(env_values["INTERVAL"], "")
        self.assertEqual(validate_env_values(env_values), [])

    def test_rejects_invalid_quality(self):
        env_values = api_settings_to_env_values(
            {
                "time1": "09:00",
                "timelapseQuality": "ultra",
            }
        )
        errors = validate_env_values(env_values)
        self.assertTrue(any("TIMELAPSE_QUALITY" in e for e in errors))

    def test_rejects_bad_time_and_interval(self):
        errors = validate_env_values(
            {
                "TIME_1": "25:99",
                "INTERVAL": "0",
                "TIMELAPSE_LENGTH_SECONDS": "10",
                "TIMELAPSE_QUALITY": "medium",
            }
        )
        self.assertTrue(any("time format" in e for e in errors))
        self.assertTrue(any("INTERVAL" in e for e in errors))

    def test_rejects_missing_schedule(self):
        errors = validate_env_values(
            {
                "TIME_1": "",
                "TIME_2": "",
                "TIME_3": "",
                "INTERVAL": "",
                "TIMELAPSE_LENGTH_SECONDS": "10",
                "TIMELAPSE_QUALITY": "medium",
            }
        )
        self.assertTrue(any("TIME_X or INTERVAL" in e for e in errors))

    def test_merge_api_preserves_local_fields(self):
        base = AppConfig(
            rtsp_url="rtsp://cam/stream",
            api_url="http://host:3000",
            api_token="secret",
            snapshot_dir="/data/snapshots",
            webhook_url="https://hooks.example/x",
            retry_max_seconds=120,
            time1="01:00",
        )
        merged, errors = merge_api_settings(
            base,
            {
                "timezone": "UTC",
                "time1": "07:15",
                "intervalMinutes": 30,
                "timelapseLengthSeconds": 12,
                "timelapseQuality": "low",
            },
        )
        self.assertEqual(errors, [])
        self.assertIsNotNone(merged)
        assert merged is not None
        self.assertEqual(merged.time1, "07:15")
        self.assertEqual(merged.interval, "30")
        self.assertEqual(merged.timelapse_length_seconds, 12)
        self.assertEqual(merged.timelapse_quality, "low")
        self.assertEqual(merged.rtsp_url, base.rtsp_url)
        self.assertEqual(merged.api_token, base.api_token)
        self.assertEqual(merged.snapshot_dir, base.snapshot_dir)
        self.assertEqual(merged.webhook_url, base.webhook_url)
        self.assertEqual(merged.retry_max_seconds, 120)

    def test_merge_api_invalid_returns_none(self):
        base = AppConfig(rtsp_url="rtsp://x", time1="08:00")
        merged, errors = merge_api_settings(
            base,
            {"timelapseQuality": "nope", "time1": "08:00"},
        )
        self.assertIsNone(merged)
        self.assertTrue(errors)

class EnvFileAndLoadTests(unittest.TestCase):
    def test_update_env_file_preserves_unrelated_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".env"
            path.write_text(
                "# comment\nRTSP_STREAM=rtsp://keep\nTIME_1=01:00\nWH_URL=http://hook\n",
                encoding="utf-8",
            )
            update_env_file(
                path,
                {
                    "TIME_1": "08:00",
                    "INTERVAL": "10",
                    "TZ": "UTC",
                    "TIME_2": "",
                    "TIME_3": "",
                    "TIMELAPSE_LENGTH_SECONDS": "10",
                    "TIMELAPSE_QUALITY": "medium",
                },
            )
            text = path.read_text(encoding="utf-8")
            self.assertIn("RTSP_STREAM=rtsp://keep", text)
            self.assertIn("WH_URL=http://hook", text)
            self.assertIn("TIME_1=08:00", text)
            self.assertIn("INTERVAL=10", text)
            self.assertIn("# comment", text)

    def test_load_config_from_environ_valid(self):
        env = {
            "RTSP_STREAM": "rtsp://cam/1",
            "TIME_1": "08:00",
            "INTERVAL": "",
            "TIMELAPSE_LENGTH_SECONDS": "10",
            "TIMELAPSE_QUALITY": "medium",
            "RETRY_MAX_SECONDS": "100",
            "RETRY_DELAY_SECONDS": "5",
            "TZ": "UTC",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            for key in ("TIME_2", "TIME_3", "API_URL", "API_TOKEN"):
                os.environ.pop(key, None)
            config, errors = load_config_from_environ()
        self.assertEqual(errors, [], errors)
        self.assertEqual(config.rtsp_url, "rtsp://cam/1")
        self.assertEqual(config.time1, "08:00")
        self.assertEqual(config.retry_max_seconds, 100)

if __name__ == "__main__":
    unittest.main()
