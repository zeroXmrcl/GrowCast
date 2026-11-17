from __future__ import annotations

import logging
import time
from typing import Any

import requests

log = logging.getLogger("growcast.ggs")


class GrowCastPush:
    def __init__(self, url: str, token: str, debounce_s: float = 2.0) -> None:
        base = url.rstrip("/")
        self._ingest = base + "/api/plugins/v1/growcast.ggs/ingest"
        self._mesh = base + "/api/mesh/growcast.ggs/state"
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
        headers = {"Authorization": f"Bearer {self._token}"}
        ingest = {
            "apiVersion": 1,
            "observedAt": body.get("updatedAt"),
            "state": body,
        }
        try:
            response = requests.post(self._ingest, json=ingest, headers=headers, timeout=10)
        except requests.RequestException as exc:
            log.warning("growcast ingest failed: %s", exc)
            response = None
        if response is not None and response.status_code == 204:
            self._last_post = time.time()
            self._pending = None
            devices = body.get("devices") if isinstance(body.get("devices"), list) else []
            log.info("posted devices=%s online=%s", len(devices), body.get("online"))
            return
        if response is not None and response.status_code == 429:
            self._last_post = time.time()
            log.warning("growcast ingest status=429")
            return
        try:
            fallback = requests.post(self._mesh, json=body, headers=headers, timeout=10)
        except requests.RequestException as exc:
            log.warning("growcast mesh post failed: %s", exc)
            return
        if fallback.status_code == 204:
            self._last_post = time.time()
            self._pending = None
            return
        log.warning("growcast post status=%s body=%s", fallback.status_code, fallback.text[:200])
