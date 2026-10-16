#!/usr/bin/env bash
# End-to-end smoke test against a running deployment.
#
#   scripts/smoke-test.sh http://localhost:8080
#   SMOKE_AUTH=user:pass scripts/smoke-test.sh https://staging.<ip>.sslip.io   # behind Basic Auth
#
# Checks: frontend is served, /api/healthz and /api/readyz are OK, then creates a task,
# reads it back and deletes it. Exits non-zero on the first failure.
set -euo pipefail

BASE_URL="${1:?Usage: $0 <base_url>}"
BASE_URL="${BASE_URL%/}"
RETRIES="${SMOKE_RETRIES:-10}"
DELAY="${SMOKE_DELAY:-3}"

CURL=(curl --silent --show-error --fail --max-time 10)
if [[ -n "${SMOKE_AUTH:-}" ]]; then
  CURL+=(--user "${SMOKE_AUTH}")
fi

log() { printf '[smoke] %s\n' "$*"; }
fail() { printf '[smoke] FAIL: %s\n' "$*" >&2; exit 1; }

# 1. Wait for the API to come up (fresh deployments may still be starting).
attempt=1
until "${CURL[@]}" -o /dev/null "${BASE_URL}/api/healthz" 2>/dev/null; do
  if (( attempt >= RETRIES )); then
    fail "${BASE_URL}/api/healthz not healthy after ${RETRIES} attempts"
  fi
  log "waiting for API (attempt ${attempt}/${RETRIES})..."
  attempt=$((attempt + 1))
  sleep "${DELAY}"
done
log "healthz OK"

"${CURL[@]}" "${BASE_URL}/api/readyz" | grep -q '"ready"' || fail "readyz: database not ready"
log "readyz OK"

# 2. Frontend shell is served (and SPA routes fall back to index.html).
"${CURL[@]}" "${BASE_URL}/" | grep -q '<div id="root">' || fail "frontend index.html not served"
"${CURL[@]}" "${BASE_URL}/week" | grep -q '<div id="root">' || fail "SPA fallback not working"
log "frontend OK"

# 3. Create -> read -> delete a task.
TITLE="smoke-test $(date +%s)-$RANDOM"
created="$("${CURL[@]}" -X POST "${BASE_URL}/api/tasks" \
  -H 'Content-Type: application/json' -d "{\"title\":\"${TITLE}\"}")" || fail "create task"
id="$(printf '%s' "${created}" | grep -o '"id":[0-9]*' | head -n1 | cut -d: -f2)"
[[ -n "${id}" ]] || fail "no id in create response: ${created}"
log "created task ${id}"

"${CURL[@]}" "${BASE_URL}/api/tasks/${id}" | grep -qF "\"title\":\"${TITLE}\"" \
  || fail "task ${id} could not be read back"
log "read back task ${id}"

"${CURL[@]}" -X DELETE -o /dev/null "${BASE_URL}/api/tasks/${id}" || fail "delete task ${id}"
status="$(curl --silent --max-time 10 ${SMOKE_AUTH:+--user "${SMOKE_AUTH}"} -o /dev/null \
  -w '%{http_code}' "${BASE_URL}/api/tasks/${id}")"
[[ "${status}" == "404" ]] || fail "task ${id} still exists after delete (HTTP ${status})"
log "deleted task ${id}"

log "PASS ${BASE_URL}"
