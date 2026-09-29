#!/bin/sh
# Wait for the wizard to write /data/ggs.env, then run the climate sidecar.
# Restart that process when the env file or mesh token changes.
set -eu

ENV_FILE=/data/ggs.env
TOKEN_FILE=/data/mesh.token
cd /app

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
  SF_MQTT_NAME=$(value_of "$ENV_FILE" SF_MQTT_NAME || true)
  SF_MQTT_PWD=$(value_of "$ENV_FILE" SF_MQTT_PWD || true)
  SF_USER_ID=$(value_of "$ENV_FILE" SF_USER_ID || true)
  SF_SERIAL=$(value_of "$ENV_FILE" SF_SERIAL || true)
  SF_PREFIX=$(value_of "$ENV_FILE" SF_PREFIX || true)
  SF_LC_SERIALS=$(value_of "$ENV_FILE" SF_LC_SERIALS || true)
  SF_EMAIL=$(value_of "$ENV_FILE" SF_EMAIL || true)
  export SF_MQTT_NAME SF_MQTT_PWD SF_USER_ID SF_SERIAL SF_PREFIX SF_LC_SERIALS SF_EMAIL
  if [ -f "$TOKEN_FILE" ]; then
    token=$(tr -d "\r\n" < "$TOKEN_FILE" || true)
    if [ -n "$token" ]; then
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

pid=""
trap 'if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; exit 0' TERM INT

while true; do
  load_env
  if [ -n "${SF_MQTT_NAME:-}" ] && [ -n "${SF_MQTT_PWD:-}" ] && [ -n "${SF_SERIAL:-}" ] && [ -n "${GROWCAST_MESH_TOKEN:-}" ]; then
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
    echo "ggs waiting for spider farmer config and mesh token"
  fi
  sleep 2
done
