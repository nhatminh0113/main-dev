#!/bin/sh
# Apply database migrations, then start the given command (uvicorn by default).
# Set RUN_MIGRATIONS=false when migrations are run separately (e.g. a Kubernetes Job/hook).
set -eu

# One JSON line on stdout, like the app (LOG_FORMAT=text for plain text).
# Messages are fixed strings, so no JSON escaping is needed.
log() {
  if [ "${LOG_FORMAT:-json}" = "text" ]; then
    echo "$1"
  else
    printf '{"ts":"%s","level":"INFO","logger":"entrypoint","message":"%s"}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$1"
  fi
}

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  log "Running database migrations"
  alembic upgrade head
fi

exec "$@"
