from __future__ import annotations

from typing import Any, Callable

PLUGIN_ID = "growcast.ggs"


def finite(value: Any) -> float | None:
    if value is None or value is False:
        if value is False:
            return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def generic_on(block: dict[str, Any]) -> bool:
    return block.get("on", block.get("mOnOff")) in (1, True, "1")


def humidifier_on(block: dict[str, Any]) -> bool:
    level = finite(block.get("level"))
    return level is not None and level > 0


ActuatorOn = Callable[[dict[str, Any]], bool]

ACTUATOR_SPECS: list[tuple[str, str, str, ActuatorOn]] = [
    ("light", "Light", "light", generic_on),
    ("light2", "Light 2", "light", generic_on),
    ("fan", "Fan", "fan", generic_on),
    ("blower", "Blower", "blower", generic_on),
    ("humidifier", "Humidifier", "humidifier", humidifier_on),
    ("dehumidifier", "Dehumidifier", "dehumidifier", generic_on),
    ("heater", "Heater", "heater", generic_on),
]


def day_flag(sensor: dict[str, Any]) -> bool | None:
    for key in ("isDayEnvTarget", "isDaySensor"):
        if key in sensor:
            return sensor.get(key) in (1, True, "1")
    return None


def block_alarm(block: dict[str, Any]) -> int | None:
    number = finite(block.get("alarm"))
    if number is None:
        return None
    code = int(number)
    if code <= 0 or code > 99:
        return None
    return code


def alarm_last(data: dict[str, Any]) -> dict[str, int | None] | None:
    raw = data.get("alarmLast")
    if not isinstance(raw, dict):
        return None
    dev = finite(raw.get("devType"))
    if dev is None:
        return None
    code = int(dev)
    if code < 0 or code > 99:
        return None
    alarm_type = finite(raw.get("alarmType"))
    return {
        "devType": code,
        "alarmType": int(alarm_type) if alarm_type is not None else None,
    }


def sensor_from(data: dict[str, Any]) -> dict[str, float | bool | None]:
    sensor = data.get("sensor") if isinstance(data.get("sensor"), dict) else {}
    return {
        "tempC": finite(sensor.get("temp")),
        "humidityPct": finite(sensor.get("humi")),
        "vpd": finite(sensor.get("vpd")),
        "co2": finite(sensor.get("co2")),
        "ppfd": finite(sensor.get("ppfd")),
        "tempSoilC": finite(sensor.get("tempSoil")),
        "humiditySoilPct": finite(sensor.get("humiSoil")),
        "ecSoil": finite(sensor.get("ECSoil")),
        "isDay": day_flag(sensor),
    }


def actuators_from(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, label, kind, on_fn in ACTUATOR_SPECS:
        block = data.get(key)
        if not isinstance(block, dict):
            continue
        out.append(
            {
                "id": key,
                "label": label,
                "kind": kind,
                "on": on_fn(block),
                "level": finite(block.get("level")),
                "alarm": block_alarm(block),
            }
        )
    has_light = any(item["id"] in ("light", "light2") for item in out)
    if not has_light:
        brightness = finite(data.get("brightness"))
        if brightness is not None:
            out.append(
                {
                    "id": "light",
                    "label": "Light",
                    "kind": "light",
                    "on": brightness > 0,
                    "level": brightness,
                    "alarm": None,
                }
            )
    outlet = data.get("outlet")
    if isinstance(outlet, dict):
        for name, block in outlet.items():
            if not isinstance(block, dict):
                continue
            suffix = name[1:] if str(name).upper().startswith("O") else str(name)
            out.append(
                {
                    "id": f"outlet-{suffix}",
                    "label": f"Outlet {suffix}",
                    "kind": "outlet",
                    "on": generic_on(block),
                    "level": finite(block.get("level")),
                    "alarm": block_alarm(block),
                }
            )
    return out


def display_name(prefix: str, serial: str, peers: list[str]) -> str:
    """Public label. Does not include the controller serial."""
    base = {"LC": "Lights", "PS": "Power"}.get(prefix.upper(), "Climate")
    ordered = sorted({item.replace(":", "").upper() for item in peers if item})
    key = serial.replace(":", "").upper()
    if len(ordered) <= 1:
        return base
    index = ordered.index(key) + 1 if key in ordered else 1
    return f"{base} {index}"


def device_snapshot(
    *,
    serial: str,
    name: str,
    prefix: str,
    product_type: str,
    online: bool,
    data: dict[str, Any] | None,
) -> dict[str, Any]:
    payload = data if isinstance(data, dict) else {}
    return {
        "serial": serial.replace(":", "").upper(),
        "name": name,
        "prefix": prefix,
        "productType": product_type,
        "online": online,
        "sensor": sensor_from(payload),
        "actuators": actuators_from(payload),
        "alarmLast": alarm_last(payload),
    }


def live_ingest(
    devices: list[dict[str, Any]],
    *,
    online: bool,
    updated_at: str,
) -> dict[str, Any]:
    return {
        "pluginId": PLUGIN_ID,
        "source": "ggs-cloud",
        "updatedAt": updated_at,
        "online": online,
        "devices": devices,
    }
