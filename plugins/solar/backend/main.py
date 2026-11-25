"""GrowCast Solar backend: poll FENECON FEMS and ingest metrics. Missing stays missing."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any

import requests

CHANNELS = {
    "pv.power": "_sum/ProductionActivePower",
    "battery.soc": "_sum/EssSoc",
    "battery.power": "_sum/EssDischargePower",
    "grid.power": "_sum/GridActivePower",
    "house.power": "_sum/ConsumptionActivePower",
    "grid.mode": "_sum/GridMode",
    "pv.energy": "_sum/ProductionActiveEnergy",
    "grid.import": "_sum/GridBuyActiveEnergy",
    "grid.export": "_sum/GridSellActiveEnergy",
    "house.energy": "_sum/ConsumptionActiveEnergy",
    "battery.charge": "_sum/EssDcChargeEnergy",
    "battery.discharge": "_sum/EssDcDischargeEnergy",
}


class HostClient:
    def __init__(self) -> None:
        self.base = os.environ.get("GROWCAST_URL", "http://127.0.0.1:3000").rstrip("/")
        self.plugin_id = os.environ["GROWCAST_PLUGIN_ID"]
        token = os.environ.get("GROWCAST_PLUGIN_TOKEN") or os.environ.get("GROWCAST_MESH_TOKEN") or ""
        if not token:
            raise RuntimeError("GROWCAST_PLUGIN_TOKEN is not set")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token}"

    def _url(self, suffix: str) -> str:
        return f"{self.base}/api/plugins/v1/{self.plugin_id}/{suffix}"

    def config(self) -> dict[str, Any]:
        response = self.session.get(self._url("config"), timeout=10)
        response.raise_for_status()
        body = response.json()
        cfg = body.get("config") if isinstance(body, dict) else {}
        return cfg if isinstance(cfg, dict) else {}

    def ingest(self, metrics: dict[str, dict[str, float]]) -> int:
        payload = {
            "apiVersion": 1,
            "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "metrics": metrics,
        }
        return self.session.post(self._url("ingest"), json=payload, timeout=10).status_code

    def heartbeat(self, ok: bool, status: str | None = None) -> int:
        body: dict[str, Any] = {"ok": ok}
        if status:
            body["status"] = status
        return self.session.post(self._url("heartbeat"), json=body, timeout=10).status_code


def read_rest(host: str, password: str) -> dict[str, dict[str, float]]:
    session = requests.Session()
    session.auth = ("x", password)
    metrics: dict[str, dict[str, float]] = {}
    for key, channel in CHANNELS.items():
        try:
            response = session.get(f"http://{host}/rest/channel/{channel}", timeout=5)
            response.raise_for_status()
            value = response.json().get("value")
        except (requests.RequestException, ValueError, AttributeError):
            continue
        if isinstance(value, (int, float)):
            metrics[key] = {"value": float(value)}
    return metrics


def main() -> None:
    plugin = HostClient()
    while True:
        cfg = plugin.config()
        host = str(cfg.get("host") or "")
        password = str(cfg.get("password") or "user")
        interval = int(cfg.get("intervalS") or 10)
        metrics: dict[str, Any] = {}
        if host:
            metrics = read_rest(host, password)
        if metrics:
            plugin.ingest(metrics)
        plugin.heartbeat(ok=bool(metrics), status="ok" if metrics else "no readings")
        time.sleep(max(5, interval))


if __name__ == "__main__":
    main()
