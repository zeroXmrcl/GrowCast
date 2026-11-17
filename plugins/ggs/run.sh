#!/bin/sh
# Wait for Spider Farmer credentials, then run the GGS backend.
set -eu
cd /app

ENV_FILE=""
if [ -f /data/ggs.env ]; then
  ENV_FILE=/data/ggs.env
elif [ -f /host-data/ggs.env ]; then
  ENV_FILE=/host-data/ggs.env
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
    if [ -f /data/ggs.env ]; then
      ENV_FILE=/data/ggs.env
    elif [ -f /host-data/ggs.env ]; then
      ENV_FILE=/host-data/ggs.env
    fi
  fi
  SF_MQTT_NAME=$(value_of "$ENV_FILE" SF_MQTT_NAME || true)
  SF_MQTT_PWD=$(value_of "$ENV_FILE" SF_MQTT_PWD || true)
  SF_SERIAL=$(value_of "$ENV_FILE" SF_SERIAL || true)
  TOKEN="${GROWCAST_PLUGIN_TOKEN:-${GROWCAST_MESH_TOKEN:-}}"
  if [ -n "${SF_MQTT_NAME:-}" ] && [ -n "${SF_MQTT_PWD:-}" ] && [ -n "${SF_SERIAL:-}" ] && [ -n "$TOKEN" ]; then
    export SF_MQTT_NAME SF_MQTT_PWD SF_SERIAL GROWCAST_PLUGIN_TOKEN="$TOKEN"
    SF_USER_ID=$(value_of "$ENV_FILE" SF_USER_ID || true)
    SF_PREFIX=$(value_of "$ENV_FILE" SF_PREFIX || true)
    SF_LC_SERIALS=$(value_of "$ENV_FILE" SF_LC_SERIALS || true)
    export SF_USER_ID SF_PREFIX SF_LC_SERIALS
    python -u main.py
  else
    echo "ggs waiting for spider farmer config and plugin token"
  fi
  sleep 5
done
