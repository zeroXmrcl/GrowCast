#!/bin/sh
set -e

# Bind mounts keep host ownership. Chown only writable app mounts, then drop privileges.
# Do not chown /app/extensions — sidecar secrets must not be owned by the web user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/public/setup /app/public/yourPictures
  chown -R growcast:growcast \
    /app/data \
    /app/public/setup \
    /app/public/yourPictures
  exec su-exec growcast:growcast "$@"
fi

exec "$@"
