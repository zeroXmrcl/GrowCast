import unittest

from normalize import actuators_from, device_snapshot, finite, live_ingest, sensor_from


CB_DATA = {
    "sensor": {
        "temp": 25.4,
        "humi": 47.2,
        "vpd": 1.71,
    },
    "light": {"on": 1, "level": 11},
    "blower": {"on": 1, "level": 25},
    "humidifier": {"modeType": 4, "level": 0},
    "dehumidifier": {"on": 1, "level": 1},
    "heater": {"on": 0},
}


class FiniteTests(unittest.TestCase):
    def test_numbers(self) -> None:
        self.assertEqual(finite(25.4), 25.4)
        self.assertIsNone(finite("nope"))
        self.assertIsNone(finite(float("nan")))
        self.assertIsNone(finite(None))


class SensorTests(unittest.TestCase):
    def test_cb_sensor(self) -> None:
        sensor = sensor_from(CB_DATA)
        self.assertEqual(sensor["tempC"], 25.4)
        self.assertEqual(sensor["humidityPct"], 47.2)
        self.assertEqual(sensor["vpd"], 1.71)
        self.assertIsNone(sensor["co2"])


class ActuatorTests(unittest.TestCase):
    def test_cb_actuators(self) -> None:
        acts = {item["id"]: item for item in actuators_from(CB_DATA)}
        self.assertEqual(acts["light"]["on"], True)
        self.assertEqual(acts["light"]["level"], 11)
        self.assertEqual(acts["blower"]["on"], True)
        self.assertEqual(acts["blower"]["level"], 25)
        self.assertEqual(acts["humidifier"]["on"], False)
        self.assertEqual(acts["humidifier"]["alarm"], None)
        self.assertEqual(acts["dehumidifier"]["on"], True)
        self.assertEqual(acts["heater"]["on"], False)

    def test_humidifier_empty_alarm(self) -> None:
        acts = {
            item["id"]: item
            for item in actuators_from({
                "humidifier": {"modeType": 4, "on": 1, "level": 2, "alarm": 4},
            })
        }
        self.assertEqual(acts["humidifier"]["on"], True)
        self.assertEqual(acts["humidifier"]["level"], 2)
        self.assertEqual(acts["humidifier"]["alarm"], 4)

    def test_is_day_from_env_target(self) -> None:
        sensor = sensor_from({"sensor": {"temp": 24.5, "isDayEnvTarget": 1, "isDaySensor": 0}})
        self.assertTrue(sensor["isDay"])

    def test_alarm_last_forwards_threshold_raise(self) -> None:
        device = device_snapshot(
            serial="90e5b1b87088",
            name="SF-GGS-CB-7088",
            prefix="CB",
            product_type="SF-GGS-CB",
            online=True,
            data={"alarmLast": {"devType": 2, "alarmType": 2, "epoch": 1, "id": 9}},
        )
        self.assertEqual(device["alarmLast"], {"devType": 2, "alarmType": 2})

    def test_alarm_last_humidifier_is_not_a_climate_raise(self) -> None:
        device = device_snapshot(
            serial="90e5b1b87088",
            name="SF-GGS-CB-7088",
            prefix="CB",
            product_type="SF-GGS-CB",
            online=True,
            data={"alarmLast": {"devType": 27, "alarmType": 4}},
        )
        self.assertEqual(device["alarmLast"], {"devType": 27, "alarmType": 4})

    def test_omit_missing_blocks(self) -> None:
        acts = actuators_from({"sensor": {"temp": 1}})
        self.assertEqual(acts, [])

    def test_lc_brightness(self) -> None:
        acts = actuators_from({"brightness": 40, "mode": 1})
        self.assertEqual(len(acts), 1)
        self.assertEqual(acts[0]["id"], "light")
        self.assertEqual(acts[0]["on"], True)
        self.assertEqual(acts[0]["level"], 40)

    def test_outlets(self) -> None:
        acts = actuators_from({"outlet": {"O1": {"on": 1}, "O2": {"on": 0}}})
        by_id = {item["id"]: item for item in acts}
        self.assertEqual(by_id["outlet-1"]["on"], True)
        self.assertEqual(by_id["outlet-2"]["on"], False)


class SnapshotTests(unittest.TestCase):
    def test_ingest_envelope(self) -> None:
        device = device_snapshot(
            serial="90:e5:b1:b8:70:88",
            name="SF-GGS-CB-7088",
            prefix="CB",
            product_type="SF-GGS-CB",
            online=True,
            data=CB_DATA,
        )
        body = live_ingest([device], online=True, updated_at="2026-08-22T18:00:00.000Z")
        self.assertEqual(body["pluginId"], "growcast.ggs")
        self.assertEqual(body["source"], "ggs-cloud")
        self.assertEqual(device["serial"], "90E5B1B87088")
        self.assertEqual(device["sensor"]["tempC"], 25.4)


if __name__ == "__main__":
    unittest.main()
