#!/bin/sh
# Wait for a camera URL, then run the timelapse worker.
# Restart that process when its env file or the mesh token changes.
set -eu

ENV_FILE=/data/timelapse.env
TOKEN_FILE=/data/mesh.token
cd /app/GrowCast-Timelapse

strip_quotes() {
  v=$(printf '%s' "$1" | tr -d '\r')
  first=${v%"${v#?}"}
  last=${v#"${v%?}"}
  if [ -n "$v" ] && [ "$first" = "$last" ] && { [ "$first" = '"' ] || [ "$first" = "'" ]; }; then
    v=${v#?}
    v=${v%?}
  fi
  printf '%s' "$v"
}

value_of() {
  file=$1
  want=$2
  if [ ! -f "$file" ]; then
    return 0
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
    esac
    key=${line%%=*}
    if [ "$key" = "$want" ]; then
      strip_quotes "${line#*=}"
      return 0
    fi
  done < "$file"
}

load_env() {
  RTSP_STREAM=$(value_of "$ENV_FILE" RTSP_STREAM || true)
  TZ=$(value_of "$ENV_FILE" TZ || true)
  INTERVAL=$(value_of "$ENV_FILE" INTERVAL || true)
  TIME_1=$(value_of "$ENV_FILE" TIME_1 || true)
  TIME_2=$(value_of "$ENV_FILE" TIME_2 || true)
  TIME_3=$(value_of "$ENV_FILE" TIME_3 || true)
  TIMELAPSE_LENGTH_SECONDS=$(value_of "$ENV_FILE" TIMELAPSE_LENGTH_SECONDS || true)
  TIMELAPSE_QUALITY=$(value_of "$ENV_FILE" TIMELAPSE_QUALITY || true)
  export RTSP_STREAM TZ INTERVAL TIME_1 TIME_2 TIME_3 TIMELAPSE_LENGTH_SECONDS TIMELAPSE_QUALITY
  export SNAPSHOT_DIR_OUT=./snapshots
  export TIMELAPSE_DIR_OUT=./timelapse
  if [ -n "${GROWCAST_URL:-}" ]; then
    export API_URL="$GROWCAST_URL"
  fi
  if [ -f "$TOKEN_FILE" ]; then
    token=$(tr -d "\r\n" < "$TOKEN_FILE" || true)
    if [ -n "$token" ]; then
      export API_TOKEN="$token"
      export GROWCAST_MESH_TOKEN="$token"
    fi
  fi
}

stamp() {
  if [ -f "$1" ]; then
    stat -c %Y "$1" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

ready() {
  if [ -z "${RTSP_STREAM:-}" ] || [ -z "${GROWCAST_MESH_TOKEN:-}" ]; then
    return 1
  fi
  if [ -n "${INTERVAL:-}" ] || [ -n "${TIME_1:-}" ] || [ -n "${TIME_2:-}" ] || [ -n "${TIME_3:-}" ]; then
    return 0
  fi
  return 1
}

pid=""
trap 'if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; exit 0' TERM INT

# Older installs kept the camera URL in the plugin .env. Copy only keys
# that data/timelapse.env does not already have.
import_legacy() {
  dest=$1
  legacy=$2
  if [ ! -f "$legacy" ]; then
    return 0
  fi
  umask 077
  tmp=$(mktemp)
  if [ -f "$dest" ]; then
    cat "$dest" > "$tmp" || true
  fi
  added=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
    esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in
      API_URL|API_TOKEN|GROWCAST_URL|GROWCAST_MESH_TOKEN|LOG_LEVEL|SNAPSHOT_DIR_OUT|TIMELAPSE_DIR_OUT) continue ;;
    esac
    if [ -z "$val" ]; then
      continue
    fi
    val=$(strip_quotes "$val")
    if [ -z "$val" ]; then
      continue
    fi
    existing=$(value_of "$tmp" "$key" || true)
    if [ -n "$existing" ]; then
      continue
    fi
    grep -v "^${key}=$" "$tmp" > "${tmp}.next" || true
    mv "${tmp}.next" "$tmp"
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
    added=1
  done < "$legacy"
  if [ "$added" -eq 1 ]; then
    mv "$tmp" "$dest"
    chmod 600 "$dest" 2>/dev/null || true
    echo "timelapse imported the camera config from the previous plugin env"
  else
    rm -f "$tmp"
  fi
}

import_legacy "$ENV_FILE" /opt/legacy-timelapse/.env

# The worker applies mesh settings over the env file. If that file is missing,
# the app would invent an empty schedule and drop the imported times.
seed_mesh() {
  mesh=/data/mesh/growcast.timelapse.json
  if [ ! -f "$ENV_FILE" ]; then
    return 0
  fi
  mkdir -p /data/mesh 2>/dev/null || return 0
  python - "$ENV_FILE" "$mesh" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

env_path, mesh_path = map(Path, sys.argv[1:])

def parse_env(text):
    values = {}
    for line in text.splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key:
            values[key] = value
    return values

def has_schedule(data):
    if not isinstance(data, dict):
        return False
    settings = data.get("settings") if isinstance(data.get("settings"), dict) else data
    times = (
        settings.get("time_1"), settings.get("time1"),
        settings.get("time_2"), settings.get("time2"),
        settings.get("time_3"), settings.get("time3"),
    )
    if any(str(item or "").strip() for item in times):
        return True
    interval = settings.get("interval", settings.get("intervalMinutes"))
    return interval not in (None, "", 0)

env = parse_env(env_path.read_text(encoding="utf-8"))
if not any(env.get(key, "").strip() for key in ("TIME_1", "TIME_2", "TIME_3", "INTERVAL")):
    sys.exit(0)

existing = None
if mesh_path.is_file():
    try:
        existing = json.loads(mesh_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        sys.exit(0)
    if has_schedule(existing):
        sys.exit(0)

prev = existing if isinstance(existing, dict) else {}
interval_raw = env.get("INTERVAL", "").strip()
interval = int(interval_raw) if interval_raw.isdigit() and int(interval_raw) > 0 else None
length_raw = env.get("TIMELAPSE_LENGTH_SECONDS", "").strip()
if length_raw.isdigit() and int(length_raw) > 0:
    length = int(length_raw)
elif isinstance(prev.get("timelapseLength"), int) and prev["timelapseLength"] > 0:
    length = prev["timelapseLength"]
else:
    length = 10
quality = env.get("TIMELAPSE_QUALITY", "").strip().lower()
if quality not in ("low", "medium", "high"):
    previous = prev.get("timelapseQuality")
    quality = previous if previous in ("low", "medium", "high") else "medium"
timezone = env.get("TZ", "").strip()
if not timezone and isinstance(prev.get("timezone"), str):
    timezone = prev["timezone"].strip()
seeded = {
    "lastChanged": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "paused": prev.get("paused") is True,
    "timezone": timezone or "UTC",
    "time_1": env.get("TIME_1", "").strip(),
    "time_2": env.get("TIME_2", "").strip(),
    "time_3": env.get("TIME_3", "").strip(),
    "interval": interval,
    "timelapseLength": length,
    "timelapseQuality": quality,
}
mesh_path.write_text(json.dumps(seeded, indent=2) + "\n", encoding="utf-8")
try:
    mesh_path.chmod(0o600)
except OSError:
    pass
print("timelapse kept the previous capture schedule")
PY
}

while true; do
  seed_mesh || true
  load_env
  if ready; then
    python -u main.py &
    pid=$!
    env_stamp=$(stamp "$ENV_FILE")
    token_stamp=$(stamp "$TOKEN_FILE")
    while kill -0 "$pid" 2>/dev/null; do
      sleep 2
      if [ "$(stamp "$ENV_FILE")" != "$env_stamp" ] || [ "$(stamp "$TOKEN_FILE")" != "$token_stamp" ]; then
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        break
      fi
    done
    wait "$pid" 2>/dev/null || true
    pid=""
  else
    echo "timelapse waiting for a camera url, a schedule, and the mesh token"
  fi
  sleep 2
done
