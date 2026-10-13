from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Callable

import requests

from sf_login import LoginError, decode_response, encrypt_body, login_systemdata

THP_URL = "https://api.spider-farmer.com/api/ios/udm/getDeviceTHPData/v2"
Post = Callable[..., requests.Response]


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def _minute(raw: str) -> str | None:
    text = raw.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc).replace(second=0, microsecond=0)
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _read(row: dict[str, Any], names: tuple[str, ...]) -> float | None:
    for name in names:
        if name in row:
            return _finite(row.get(name))
    return None


def _rows(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    return []


def pair_samples(
    temp_rows: list[dict[str, Any]],
    humidity_rows: list[dict[str, Any]],
    vpd_rows: list[dict[str, Any]],
) -> list[dict[str, float | str]]:
    temp: dict[str, float] = {}
    humidity: dict[str, float] = {}
    vpd: dict[str, float] = {}
    for row in temp_rows:
        minute = _minute(str(row.get("time") or row.get("t") or ""))
        value = _read(row, ("temp", "temperature", "tempC"))
        if minute and value is not None:
            temp[minute] = value
    for row in humidity_rows:
        minute = _minute(str(row.get("time") or row.get("t") or ""))
        value = _read(row, ("humi", "humidity", "humidityPct"))
        if minute and value is not None:
            humidity[minute] = value
    for row in vpd_rows:
        minute = _minute(str(row.get("time") or row.get("t") or ""))
        value = _read(row, ("vpd", "VPD"))
        if minute and value is not None:
            vpd[minute] = value
    points: list[dict[str, float | str]] = []
    for minute in sorted(set(temp) & set(humidity)):
        temp_c = temp[minute]
        humidity_pct = humidity[minute]
        denom = temp_c + 237.3
        computed = None if denom == 0 else 0.6108 * math.exp((17.27 * temp_c) / denom) * (1 - humidity_pct / 100)
        chosen = vpd.get(minute, computed)
        if chosen is None or not math.isfinite(chosen):
            continue
        points.append({
            "t": minute,
            "tempC": temp_c,
            "humidityPct": humidity_pct,
            "vpd": chosen,
        })
    return points


def points_from_payload(payload: dict[str, Any]) -> list[dict[str, float | str]]:
    code = str(payload.get("code") if payload.get("code") is not None else "")
    if code != "000":
        msg = payload.get("msg")
        raise LoginError(code or "?", str(msg) if msg is not None else "history failed")
    data = payload.get("data")
    if isinstance(data, list):
        return pair_samples(data, data, data)
    if isinstance(data, dict):
        return pair_samples(_rows(data.get("temp")), _rows(data.get("humidity")), _rows(data.get("vpd")))
    raise LoginError("000", "missing data")


def fetch_thp(
    token: str,
    device_id: str,
    *,
    post: Post = requests.post,
    now_s: int | None = None,
) -> list[dict[str, float | str]]:
    import time

    stamp = int(time.time()) if now_s is None else now_s
    response = post(
        THP_URL,
        data=encrypt_body({"deviceId": device_id, "token": token, "type": 3}),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Dart/3.5 (dart:io)",
            "systemdata": login_systemdata(stamp),
        },
        timeout=20,
    )
    if response.status_code != 200:
        raise LoginError(str(response.status_code), "http")
    return points_from_payload(decode_response(response.text))
