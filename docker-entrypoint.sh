#!/bin/sh
# linuxserver.io-style: run as PUID:PGID so files in /config are owned by the host user.
set -e

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  mkdir -p /config/logs
  # Only fix ownership when it is wrong (cheap on big volumes after the first start).
  if [ "$(stat -c %u:%g /config)" != "$PUID:$PGID" ]; then
    chown -R "$PUID:$PGID" /config
  fi
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
