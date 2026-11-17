from __future__ import annotations

import json
import logging
import ssl
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt

MQTT_HOST = "sf.mqtt.spider-farmer.com"
MQTT_PORT = 8883
ALLOWED_METHODS = {"getDevSta", "getSysSta", "getConfigFile", "getConfigField"}
GETDEVSTA_MIN_INTERVAL_S = 15
WATCHDOG_S = 20

log = logging.getLogger("growcast.ggs")

OnStatus = Callable[[str, str, dict[str, Any]], None]


def assert_read_only(method: str) -> None:
    if not method or method.startswith("set") or method not in ALLOWED_METHODS:
        raise RuntimeError(f"refusing to publish method={method!r}")


def topics(prefix: str, serial: str) -> tuple[str, str]:
    serial = serial.replace(":", "").upper()
    prefix = prefix.upper()
    return (
        f"SF/GGS/{prefix}/API/UP/{serial}",
        f"SF/GGS/{prefix}/API/DOWN/{serial}",
    )


def make_client(user_id: str) -> mqtt.Client:
    client_id = f"{user_id}_{int(time.time())}"
    return mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
        protocol=mqtt.MQTTv31,
        clean_session=True,
    )


def default_ca_file() -> Path:
    return Path(__file__).resolve().parent / "mqtt-ca.pem"


def mqtt_ssl_context(ca_certs: str) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.verify_mode = ssl.CERT_REQUIRED
    context.check_hostname = True
    context.load_verify_locations(cafile=ca_certs)
    # Issuer CA from this broker has no Authority Key Identifier.
    # Keep CERT_REQUIRED + hostname check; drop OpenSSL 3's extra STRICT flag.
    strict = getattr(ssl, "VERIFY_X509_STRICT", 0)
    if strict:
        context.verify_flags &= ~strict
    return context


def configure_tls(
    client: mqtt.Client,
    host: str,
    ca_certs: str | None = None,
) -> None:
    if host != MQTT_HOST:
        raise RuntimeError(f"refusing TLS for host={host!r}")
    path = Path(ca_certs) if ca_certs else default_ca_file()
    if not path.is_file():
        raise RuntimeError(f"missing MQTT CA pin at {path}")
    client.tls_set_context(mqtt_ssl_context(str(path)))


class ReadOnlyMqtt:
    def __init__(
        self,
        *,
        mqtt_name: str,
        mqtt_pwd: str,
        user_id: str,
        on_status: OnStatus,
    ) -> None:
        self._mqtt_name = mqtt_name
        self._mqtt_pwd = mqtt_pwd
        self._user_id = user_id
        self._on_status = on_status
        self._client: mqtt.Client | None = None
        self._devices: dict[str, dict[str, str]] = {}
        self._last_down: dict[str, float] = {}
        self._last_up: dict[str, float] = {}
        self._sub_mids: dict[int, str] = {}
        self._connected = False

    def add_device(self, prefix: str, serial: str, name: str, product_type: str) -> None:
        serial = serial.replace(":", "").upper()
        self._devices[serial] = {
            "prefix": prefix.upper(),
            "serial": serial,
            "name": name,
            "productType": product_type,
        }

    def drop_device(self, serial: str) -> None:
        serial = serial.replace(":", "").upper()
        self._devices.pop(serial, None)

    def connect(self) -> None:
        client = make_client(self._user_id)
        configure_tls(client, MQTT_HOST)
        client.username_pw_set(self._mqtt_name, self._mqtt_pwd)
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.on_subscribe = self._on_subscribe
        client.on_disconnect = self._on_disconnect
        self._client = client
        log.info("mqtt connecting host=%s client_id=%s", MQTT_HOST, client._client_id.decode())
        client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
        client.loop_start()

    def disconnect(self) -> None:
        if self._client is None:
            return
        try:
            self._client.loop_stop()
            self._client.disconnect()
        except Exception:
            log.exception("mqtt disconnect")
        self._client = None
        self._connected = False

    def poll_watchdog(self) -> None:
        now = time.time()
        for serial, meta in list(self._devices.items()):
            last = self._last_up.get(serial, 0)
            if now - last >= WATCHDOG_S:
                self.request_status(serial, meta["prefix"])

    def request_status(self, serial: str, prefix: str) -> None:
        assert_read_only("getDevSta")
        now = time.time()
        last = self._last_down.get(serial, 0)
        if now - last < GETDEVSTA_MIN_INTERVAL_S:
            return
        client = self._client
        if client is None:
            return
        _up, down = topics(prefix, serial)
        payload = {
            "method": "getDevSta",
            "params": {"pid": serial},
            "msgId": str(int(now * 1000)),
        }
        self._last_down[serial] = now
        log.info("mqtt getDevSta serial=%s", serial[-4:])
        client.publish(down, json.dumps(payload), qos=0)

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: Any,
        flags: Any,
        reason_code: Any,
        properties: Any = None,
    ) -> None:
        rc = getattr(reason_code, "value", reason_code)
        if rc not in (0, "Success"):
            log.error("mqtt unauthorized or connect failed rc=%s", rc)
            self._connected = False
            return
        self._connected = True
        log.info("mqtt connected")
        for meta in list(self._devices.values()):
            up, _down = topics(meta["prefix"], meta["serial"])
            result, mid = client.subscribe(up, qos=0)
            if result != mqtt.MQTT_ERR_SUCCESS:
                log.warning("mqtt subscribe error serial=%s", meta["serial"][-4:])
                continue
            self._sub_mids[mid] = meta["serial"]

    def _on_subscribe(
        self,
        client: mqtt.Client,
        userdata: Any,
        mid: int,
        reason_codes: Any,
        properties: Any = None,
    ) -> None:
        codes = reason_codes if isinstance(reason_codes, list) else [reason_codes]
        denied = False
        for code in codes:
            value = getattr(code, "value", code)
            if value not in (0, 1, 2):
                denied = True
        serial = self._sub_mids.pop(mid, None)
        if denied:
            log.warning("mqtt subscribe denied serial=%s", (serial or "?")[-4:])
            if serial:
                self.drop_device(serial)
            return
        if serial and serial in self._devices:
            meta = self._devices[serial]
            self.request_status(meta["serial"], meta["prefix"])

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: Any,
        disconnect_flags: Any,
        reason_code: Any,
        properties: Any = None,
    ) -> None:
        self._connected = False
        log.warning("mqtt disconnected rc=%s", reason_code)

    def _on_message(self, client: mqtt.Client, userdata: Any, message: mqtt.MQTTMessage) -> None:
        try:
            body = json.loads(message.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            log.warning("mqtt non-json payload topic=%s", message.topic)
            return
        if not isinstance(body, dict):
            return
        method = str(body.get("method") or "")
        if method != "getDevSta":
            return
        serial = str(body.get("pid") or "").replace(":", "").upper()
        if serial not in self._devices:
            parts = message.topic.rsplit("/", 1)
            serial = parts[-1].upper() if parts else serial
        if serial not in self._devices:
            log.warning("mqtt status for unknown serial last4=%s", serial[-4:])
            return
        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        self._last_up[serial] = time.time()
        meta = self._devices[serial]
        log.info("mqtt getDevSta rx serial=%s", serial[-4:])
        self._on_status(serial, meta["prefix"], data)
