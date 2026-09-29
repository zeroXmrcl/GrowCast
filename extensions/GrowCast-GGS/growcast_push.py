from __future__ import annotations

import logging
import time
from typing import Any

import requests

log = logging.getLogger("growcast.ggs")


class GrowCastPush:
    def __init__(self, url: str, token: str, debounce_s: float = 2.0) -> None:
        self._url = url.rstrip("/") + "/api/mesh/growcast.ggs/state"
        self._token = token
        self._debounce_s = debounce_s
        self._last_post = 0.0
        self._pending: dict[str, Any] | None = None

    def offer(self, body: dict[str, Any]) -> None:
        now = time.time()
        self._pending = body
        if now - self._last_post < self._debounce_s:
            return
        self.flush()

    def flush(self) -> None:
        body = self._pending
        if body is None:
            return
        now = time.time()
        if now - self._last_post < self._debounce_s:
            return
        try:
            response = requests.post(
                self._url,
                json=body,
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=10,
            )
        except requests.RequestException as exc:
            log.warning("growcast post failed: %s", exc)
            return
        if response.status_code == 204:
            self._last_post = time.time()
            self._pending = None
            devices = body.get("devices") if isinstance(body.get("devices"), list) else []
            log.info("posted devices=%s online=%s", len(devices), body.get("online"))
            return
        if response.status_code == 429:
            self._last_post = time.time()
            log.warning("growcast post status=429")
            return
        if response.status_code == 401 or response.status_code >= 500:
            log.warning("growcast post status=%s", response.status_code)
            return
        log.warning("growcast post status=%s body=%s", response.status_code, response.text[:200])
