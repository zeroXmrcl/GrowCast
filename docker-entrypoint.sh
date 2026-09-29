#!/bin/sh
set -e

# Bind mounts keep host ownership. Chown writable app mounts plus the Timelapse
# media bind, then drop privileges. Do not chown /app/extensions (GGS secrets).
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/public/setup /app/public/yourPictures /app/extensions/GrowCast-Timelapse /run/growcast
  if [ -n "$GROWCAST_MESH_TOKEN" ]; then
    printf "%s\n" "$GROWCAST_MESH_TOKEN" > /app/data/mesh.token
  elif [ ! -s /app/data/mesh.token ]; then
    node -e "const fs=require('fs'); const c=require('crypto'); fs.writeFileSync('/app/data/mesh.token', c.randomBytes(32).toString('base64url')+'\n')"
  fi
  if [ -f /run/growcast/ggs.env ]; then
    chown growcast:growcast /run/growcast/ggs.env
  fi
  chown -R growcast:growcast \
    /app/data \
    /app/public/setup \
    /app/public/yourPictures \
    /app/extensions/GrowCast-Timelapse
  exec su-exec growcast:growcast "$@"
fi

exec "$@"
