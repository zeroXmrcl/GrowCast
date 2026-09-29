#!/bin/sh
set -e

# Bind mounts keep host ownership. Chown the data and media folders the app
# writes, then drop privileges. Do not chown plugin source (git pull would fail).
if [ "$(id -u)" = "0" ]; then
  mkdir -p \
    /app/data/restream \
    /app/public/setup \
    /app/public/yourPictures \
    /app/extensions/GrowCast-Timelapse/snapshots \
    /app/extensions/GrowCast-Timelapse/timelapse
  umask 077
  if [ -n "$GROWCAST_MESH_TOKEN" ]; then
    printf '%s\n' "$GROWCAST_MESH_TOKEN" > /app/data/mesh.token
  elif [ ! -s /app/data/mesh.token ]; then
    node -e "const fs=require('fs'); const c=require('crypto'); fs.writeFileSync('/app/data/mesh.token', c.randomBytes(32).toString('base64url')+'\n', {mode:0o600})"
  fi
  chmod 600 /app/data/mesh.token 2>/dev/null || true
  if [ -f /run/growcast/ggs.env ]; then
    chown growcast:growcast /run/growcast/ggs.env || true
  fi
  chown -R growcast:growcast \
    /app/data \
    /app/public/setup \
    /app/public/yourPictures \
    /app/extensions/GrowCast-Timelapse/snapshots \
    /app/extensions/GrowCast-Timelapse/timelapse \
    || echo "growcast: could not change ownership of data folders; continuing"
  exec su-exec growcast:growcast "$@"
fi

exec "$@"
