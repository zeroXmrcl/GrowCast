#!/bin/sh
set -e

# Bind mounts keep host ownership. Chown writable app mounts plus the Timelapse
# media bind, then drop privileges. Do not chown /app/extensions (GGS secrets).
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/public/setup /app/public/yourPictures /app/extensions/GrowCast-Timelapse /run/growcast
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
