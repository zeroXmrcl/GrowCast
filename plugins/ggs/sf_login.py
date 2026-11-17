from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping

import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

LOGIN_URL = "https://api.spider-farmer.com/api/ios/ulogin/mailLogin/v2"
_KEY = b"Meizhi1234567890"
_IV = b"1234567890123456"

Post = Callable[..., requests.Response]


class LoginError(Exception):
    def __init__(self, code: str, msg: str) -> None:
        self.code = code
        self.msg = msg
        super().__init__(f"{code} {msg}")


@dataclass(frozen=True)
class BrokerLogin:
    mqtt_name: str
    mqtt_pwd: str
    user_id: str
    via: str


def _pkcs7(raw: bytes) -> bytes:
    pad = 16 - (len(raw) % 16)
    return raw + bytes([pad]) * pad


def _unpad(raw: bytes) -> bytes:
    if not raw:
        raise LoginError("decrypt", "empty")
    pad = raw[-1]
    if pad < 1 or pad > 16 or raw[-pad:] != bytes([pad]) * pad:
        raise LoginError("decrypt", "bad padding")
    return raw[:-pad]


def encrypt_body(obj: dict[str, Any]) -> str:
    raw = _pkcs7(json.dumps(obj, separators=(",", ":")).encode())
    enc = Cipher(algorithms.AES(_KEY), modes.CBC(_IV)).encryptor()
    return base64.b64encode(enc.update(raw) + enc.finalize()).decode()


def decrypt_body(text: str) -> dict[str, Any]:
    try:
        raw = base64.b64decode(text.strip(), validate=True)
    except Exception as exc:
        raise LoginError("decrypt", "not base64") from exc
    dec = Cipher(algorithms.AES(_KEY), modes.CBC(_IV)).decryptor()
    try:
        plain = _unpad(dec.update(raw) + dec.finalize())
        parsed = json.loads(plain.decode())
    except LoginError:
        raise
    except Exception as exc:
        raise LoginError("decrypt", "bad ciphertext") from exc
    if not isinstance(parsed, dict):
        raise LoginError("decrypt", "not an object")
    return parsed


def login_systemdata(now_s: int) -> str:
    header = {
        "reqId": now_s * 1000,
        "appVersion": "2.5.2",
        "osType": "iOS",
        "osVersion": "27.0",
        "deviceType": "iPhone",
        "deviceId": "growcast-ggs",
        "netType": "wifi",
        "timestamp": now_s,
        "timezone": "Europe/Berlin",
        "language": "English",
    }
    return json.dumps(header, separators=(",", ":"))


def session_from_login(payload: dict[str, Any]) -> BrokerLogin:
    code = str(payload.get("code") if payload.get("code") is not None else "")
    if code != "000":
        msg = payload.get("msg")
        raise LoginError(code or "?", str(msg) if msg is not None else "login failed")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise LoginError("000", "missing data")
    mqtt_name = str(data.get("mqttName") or "").strip()
    mqtt_pwd = str(data.get("mqttPwd") or "").strip()
    if not mqtt_name or not mqtt_pwd:
        raise LoginError("000", "missing mqtt credentials")
    user_id = str(data.get("userId") or "").strip() or "175391"
    return BrokerLogin(mqtt_name=mqtt_name, mqtt_pwd=mqtt_pwd, user_id=user_id, via="mail")


def decode_response(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("{"):
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise LoginError("decrypt", "bad json") from exc
        if not isinstance(parsed, dict):
            raise LoginError("decrypt", "not an object")
        return parsed
    return decrypt_body(stripped.strip('"'))


def mail_login(
    email: str,
    password: str,
    *,
    post: Post = requests.post,
    now_s: int | None = None,
) -> BrokerLogin:
    stamp = int(time.time()) if now_s is None else now_s
    response = post(
        LOGIN_URL,
        data=encrypt_body({"email": email, "loginMethod": 1, "password": password}),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Dart/3.5 (dart:io)",
            "systemdata": login_systemdata(stamp),
        },
        timeout=20,
    )
    if response.status_code != 200:
        raise LoginError(str(response.status_code), "http")
    return session_from_login(decode_response(response.text))


def resolve_broker_login(
    environ: Mapping[str, str],
    login: Callable[[str, str], BrokerLogin] = mail_login,
) -> BrokerLogin:
    email = environ.get("SF_EMAIL", "").strip()
    password = environ.get("SF_PASSWORD", "").strip()
    if email and password:
        return login(email, password)
    if password and not email:
        raise ValueError("need both SF_EMAIL and SF_PASSWORD")
    mqtt_name = environ.get("SF_MQTT_NAME", "").strip()
    mqtt_pwd = environ.get("SF_MQTT_PWD", "").strip()
    if not mqtt_name or not mqtt_pwd:
        raise ValueError("need SF_EMAIL and SF_PASSWORD, or SF_MQTT_NAME and SF_MQTT_PWD")
    user_id = environ.get("SF_USER_ID", "").strip() or "175391"
    return BrokerLogin(mqtt_name=mqtt_name, mqtt_pwd=mqtt_pwd, user_id=user_id, via="env")
