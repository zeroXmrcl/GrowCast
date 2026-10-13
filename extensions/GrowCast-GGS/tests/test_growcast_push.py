import unittest
from unittest.mock import MagicMock, patch

import requests

from growcast_push import GrowCastPush, history_batches

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


class HistoryBatchTests(unittest.TestCase):
    def test_eight_thousand_one_points_are_two_batches(self) -> None:
        points = [{"n": index} for index in range(8_001)]
        batches = history_batches(points)
        self.assertEqual(len(batches), 2)
        self.assertEqual(len(batches[0]), 8_000)
        self.assertEqual(len(batches[1]), 1)

    def test_post_history_continues_after_a_rejected_batch(self) -> None:
        pusher = GrowCastPush("http://127.0.0.1:3000", "mesh-token")
        rejected = MagicMock()
        rejected.status_code = 413
        ok = MagicMock()
        ok.status_code = 204
        points = [{"n": index} for index in range(8_001)]
        with patch("growcast_push.requests.post", side_effect=[rejected, ok]) as post:
            pusher.post_history(points)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(len(post.call_args_list[0].kwargs["json"]["points"]), 8_000)
        self.assertEqual(len(post.call_args_list[1].kwargs["json"]["points"]), 1)
        self.assertEqual(pusher._pending, None)
        joined = " ".join(str(call.kwargs.get("json")) for call in post.call_args_list)
        self.assertNotIn("mesh-token", joined)


if __name__ == "__main__":
    unittest.main()
