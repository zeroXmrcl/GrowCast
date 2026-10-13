import unittest
from unittest.mock import MagicMock

from sf_login import encrypt_body
from thp import THP_URL, fetch_thp, pair_samples


class PairTests(unittest.TestCase):
    def test_pairs_same_minute_and_computes_missing_vpd(self) -> None:
        points = pair_samples(
            [{"time": "2026-10-13T11:00:10Z", "temp": 24.0}],
            [{"time": "2026-10-13T11:00:40Z", "humi": 60.0}],
            [],
        )
        self.assertEqual(len(points), 1)
        self.assertEqual(points[0]["tempC"], 24.0)
        self.assertEqual(points[0]["humidityPct"], 60.0)
        self.assertGreater(points[0]["vpd"], 0)
        self.assertEqual(points[0]["t"], "2026-10-13T11:00:00.000Z")

    def test_drops_a_minute_without_humidity(self) -> None:
        self.assertEqual(pair_samples([{"time": "2026-10-13T11:00:00Z", "temp": 24.0}], [], []), [])


class FetchTests(unittest.TestCase):
    def test_posts_encrypted_type_3_and_returns_points(self) -> None:
        seen: dict[str, object] = {}

        def post(url, data=None, headers=None, timeout=None):  # noqa: ANN001
            seen["url"] = url
            seen["data"] = data
            response = MagicMock()
            response.status_code = 200
            response.text = encrypt_body({
                "code": "000",
                "data": [{
                    "time": "2026-10-13T11:00:00Z",
                    "temp": 24.8,
                    "humi": 61.4,
                    "vpd": 1.18,
                }],
            })
            return response

        points = fetch_thp("rest-token", "90E5B1B87088", post=post, now_s=1_700_000_000)
        self.assertEqual(seen["url"], THP_URL)
        self.assertEqual(points[0]["tempC"], 24.8)
        self.assertEqual(points[0]["vpd"], 1.18)

    def test_bad_code_raises_and_has_no_points(self) -> None:
        def post(url, data=None, headers=None, timeout=None):  # noqa: ANN001
            response = MagicMock()
            response.status_code = 200
            response.text = encrypt_body({"code": "102", "msg": "token.invalid", "data": None})
            return response

        with self.assertRaises(Exception):
            fetch_thp("rest-token", "90E5B1B87088", post=post, now_s=1)
