#!/bin/sh
# Apply database migrations, then start the given command (uvicorn by default).
# Set RUN_MIGRATIONS=false when migrations are run separately (e.g. a Kubernetes Job/hook).
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  alembic upgrade head
fi

exec "$@"
