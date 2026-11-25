#!/bin/sh
# Wait for an RTSP URL, then run the timelapse worker.
set -eu
cd /app/GrowCast-Timelapse

ENV_FILE=""
if [ -f /data/timelapse.env ]; then
  ENV_FILE=/data/timelapse.env
elif [ -f /host-data/timelapse.env ]; then
  ENV_FILE=/host-data/timelapse.env
fi

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
      printf '%s' "${line#*=}" | tr -d '\r'
      return 0
    fi
  done < "$file"
}

while true; do
  if [ -z "$ENV_FILE" ]; then
    if [ -f /data/timelapse.env ]; then
      ENV_FILE=/data/timelapse.env
    elif [ -f /host-data/timelapse.env ]; then
      ENV_FILE=/host-data/timelapse.env
    fi
  fi
  RTSP_STREAM=$(value_of "$ENV_FILE" RTSP_STREAM || true)
  TOKEN="${GROWCAST_PLUGIN_TOKEN:-${GROWCAST_MESH_TOKEN:-${API_TOKEN:-}}}"
  if [ -n "${RTSP_STREAM:-}" ] && [ -n "$TOKEN" ]; then
    export RTSP_STREAM
    export API_TOKEN="$TOKEN"
    export GROWCAST_MESH_TOKEN="$TOKEN"
    export GROWCAST_PLUGIN_TOKEN="$TOKEN"
    export SNAPSHOT_DIR_OUT=/data/snapshots
    export TIMELAPSE_DIR_OUT=/data/timelapse
    mkdir -p "$SNAPSHOT_DIR_OUT" "$TIMELAPSE_DIR_OUT"
    if [ -n "${GROWCAST_URL:-}" ]; then
      export API_URL="$GROWCAST_URL"
    fi
    TZ=$(value_of "$ENV_FILE" TZ || true)
    INTERVAL=$(value_of "$ENV_FILE" INTERVAL || true)
    TIME_1=$(value_of "$ENV_FILE" TIME_1 || true)
    TIME_2=$(value_of "$ENV_FILE" TIME_2 || true)
    TIME_3=$(value_of "$ENV_FILE" TIME_3 || true)
    TIMELAPSE_LENGTH_SECONDS=$(value_of "$ENV_FILE" TIMELAPSE_LENGTH_SECONDS || true)
    TIMELAPSE_QUALITY=$(value_of "$ENV_FILE" TIMELAPSE_QUALITY || true)
    export TZ INTERVAL TIME_1 TIME_2 TIME_3 TIMELAPSE_LENGTH_SECONDS TIMELAPSE_QUALITY
    python main.py
  else
    echo "timelapse waiting for camera URL and plugin token"
  fi
  sleep 5
done
