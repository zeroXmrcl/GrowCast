#!/bin/sh
set -e

# Bind mounts keep host ownership. Chown them, then drop to the runtime user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/extensions /app/public/setup /app/public/yourPictures
  chown -R growcast:growcast \
    /app/data \
    /app/extensions \
    /app/public/setup \
    /app/public/yourPictures
  exec su-exec growcast:growcast "$@"
fi

exec "$@"
