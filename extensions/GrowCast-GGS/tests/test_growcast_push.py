import unittest
from unittest.mock import MagicMock, patch

import requests

from growcast_push import GrowCastPush

BODY = {"pluginId": "growcast.ggs", "online": True, "devices": []}


class FlushDebounceTests(unittest.TestCase):
    def test_offer_then_flush_posts_once_inside_debounce(self) -> None:
        pusher = GrowCastPush("http://127.0.0.1:3000", "token", debounce_s=2.0)
        ok = MagicMock()
        ok.status_code = 204
        t0 = 1_700_000_000.0

        with patch("growcast_push.time.time", return_value=t0):
            with patch("growcast_push.requests.post", return_value=ok) as post:
                pusher.offer(BODY)
                pusher.offer(BODY)
                pusher.flush()
                pusher.flush()
                self.assertEqual(post.call_count, 1)
                self.assertEqual(pusher._pending, BODY)

    def test_connection_error_keeps_pending_and_retries_after_debounce(self) -> None:
        pusher = GrowCastPush("http://growcast:3000", "token", debounce_s=2.0)
        ok = MagicMock()
        ok.status_code = 204
        t0 = 1_700_000_000.0

        with patch("growcast_push.time.time", return_value=t0):
            with patch(
                "growcast_push.requests.post",
                side_effect=requests.ConnectionError("Failed to resolve 'growcast'"),
            ) as post:
                pusher.offer(BODY)
                self.assertEqual(post.call_count, 1)
                self.assertEqual(pusher._pending, BODY)

        with patch("growcast_push.time.time", return_value=t0 + 2.0):
            with patch("growcast_push.requests.post", return_value=ok) as post:
                pusher.flush()
                self.assertEqual(post.call_count, 1)
                self.assertIsNone(pusher._pending)

    def test_429_backs_off_instead_of_retrying_immediately(self) -> None:
        pusher = GrowCastPush("http://127.0.0.1:3000", "token", debounce_s=2.0)
        limited = MagicMock()
        limited.status_code = 429
        ok = MagicMock()
        ok.status_code = 204
        t0 = 1_700_000_000.0

        with patch("growcast_push.time.time", return_value=t0):
            with patch("growcast_push.requests.post", return_value=limited) as post:
                pusher.offer(BODY)
                pusher.flush()
                self.assertEqual(post.call_count, 1)
                self.assertEqual(pusher._pending, BODY)

        with patch("growcast_push.time.time", return_value=t0 + 1.0):
            with patch("growcast_push.requests.post", return_value=ok) as post:
                pusher.flush()
                self.assertEqual(post.call_count, 0)

        with patch("growcast_push.time.time", return_value=t0 + 2.0):
            with patch("growcast_push.requests.post", return_value=ok) as post:
                pusher.flush()
                self.assertEqual(post.call_count, 1)
                self.assertIsNone(pusher._pending)


if __name__ == "__main__":
    unittest.main()
