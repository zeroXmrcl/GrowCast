#!/bin/sh
# Wait for a camera URL, then run the timelapse worker.
# Restart that process when its env file or the mesh token changes.
set -eu

ENV_FILE=/data/timelapse.env
TOKEN_FILE=/data/mesh.token
cd /app/GrowCast-Timelapse

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
      printf "%s" "${line#*=}"
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

while true; do
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
