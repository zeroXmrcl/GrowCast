"""MIT-licensed GrowCast plugin backend SDK (Python)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests

API_VERSION = 1


class Plugin:
    def __init__(self, base_url: str, plugin_id: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.plugin_id = plugin_id
        self.token = token
        self._session = requests.Session()
        self._session.headers["Authorization"] = f"Bearer {token}"

    @classmethod
    def from_env(cls) -> "Plugin":
        base = os.environ.get("GROWCAST_URL", "http://127.0.0.1:3000")
        plugin_id = os.environ["GROWCAST_PLUGIN_ID"]
        token = os.environ.get("GROWCAST_PLUGIN_TOKEN") or os.environ.get("GROWCAST_MESH_TOKEN") or ""
        if not token:
            raise RuntimeError("GROWCAST_PLUGIN_TOKEN is not set")
        return cls(base, plugin_id, token)

    def _url(self, suffix: str) -> str:
        return f"{self.base_url}/api/plugins/v1/{self.plugin_id}/{suffix}"

    def config(self) -> dict[str, Any]:
        response = self._session.get(self._url("config"), timeout=10)
        response.raise_for_status()
        body = response.json()
        cfg = body.get("config") if isinstance(body, dict) else {}
        return cfg if isinstance(cfg, dict) else {}

    def ingest(self, metrics: dict[str, dict[str, float]], state: dict[str, Any] | None = None) -> int:
        payload: dict[str, Any] = {
            "apiVersion": API_VERSION,
            "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "metrics": metrics,
        }
        if state is not None:
            payload["state"] = state
        response = self._session.post(self._url("ingest"), json=payload, timeout=10)
        return response.status_code

    def heartbeat(self, ok: bool, status: str | None = None) -> int:
        body: dict[str, Any] = {"ok": ok}
        if status:
            body["status"] = status
        response = self._session.post(self._url("heartbeat"), json=body, timeout=10)
        return response.status_code
