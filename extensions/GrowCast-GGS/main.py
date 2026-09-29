from __future__ import annotations

import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from growcast_push import GrowCastPush
from normalize import device_snapshot, live_ingest
from sf_client import ReadOnlyMqtt

log = logging.getLogger("growcast.ggs")


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def require_env(*keys: str) -> dict[str, str]:
    missing = [key for key in keys if not os.environ.get(key, "").strip()]
    if missing:
        log.error("missing env %s", ",".join(missing))
        raise SystemExit(2)
    return {key: os.environ[key].strip() for key in keys}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "info").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    load_env_file(Path(__file__).resolve().parent / ".env")
    env = require_env("SF_MQTT_NAME", "SF_MQTT_PWD", "SF_SERIAL", "GROWCAST_MESH_TOKEN")
    user_id = os.environ.get("SF_USER_ID", "").strip() or "growcast"
    prefix = os.environ.get("SF_PREFIX", "CB").strip() or "CB"
    growcast_url = os.environ.get("GROWCAST_URL", "http://127.0.0.1:3000").strip()
    lc_serials = [
        item.replace(":", "").upper()
        for item in os.environ.get("SF_LC_SERIALS", "").split(",")
        if item.strip()
    ]

    snapshots: dict[str, dict[str, Any]] = {}
    pusher = GrowCastPush(growcast_url, env["GROWCAST_MESH_TOKEN"])

    def on_status(serial: str, device_prefix: str, data: dict[str, Any]) -> None:
        product = "SF-GGS-LC" if device_prefix == "LC" else "SF-GGS-CB"
        name = f"{product}-{serial[-4:]}"
        snapshots[serial] = device_snapshot(
            serial=serial,
            name=name,
            prefix=device_prefix,
            product_type=product,
            online=True,
            data=data,
        )
        pusher.offer(
            live_ingest(list(snapshots.values()), online=True, updated_at=iso_now())
        )

    mqtt = ReadOnlyMqtt(
        mqtt_name=env["SF_MQTT_NAME"],
        mqtt_pwd=env["SF_MQTT_PWD"],
        user_id=user_id,
        on_status=on_status,
    )
    mqtt.add_device(prefix, env["SF_SERIAL"], f"SF-GGS-CB-{env['SF_SERIAL'][-4:]}", "SF-GGS-CB")
    for serial in lc_serials:
        if serial == env["SF_SERIAL"].replace(":", "").upper():
            continue
        mqtt.add_device("LC", serial, f"SF-GGS-LC-{serial[-4:]}", "SF-GGS-LC")

    stop = False

    def handle_stop(_signum: int, _frame: Any) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)

    backoff = 5
    while not stop:
        try:
            mqtt.connect()
            while not stop:
                mqtt.poll_watchdog()
                pusher.flush()
                time.sleep(1)
            break
        except Exception:
            log.exception("mqtt loop crashed")
        mqtt.disconnect()
        if stop:
            break
        log.info("reconnect in %ss", backoff)
        time.sleep(backoff)
        backoff = min(backoff * 2, 60) if backoff < 60 else 60
        if backoff == 60:
            backoff = 60

    mqtt.disconnect()
    log.info("exit")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
