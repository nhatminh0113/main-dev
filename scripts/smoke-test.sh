#!/usr/bin/env bash
# End-to-end smoke test against a running deployment.
#
#   scripts/smoke-test.sh http://localhost:8080
#   SMOKE_AUTH=user:pass scripts/smoke-test.sh https://staging.<base_domain>   # behind Basic Auth
#
# Checks: frontend is served, /api/healthz and /api/readyz are OK, X-Request-ID is echoed,
# a task can be created, read back and deleted, and the feature flags can be read. When the
# export_csv flag is on, it also runs a CSV export through the background worker (create job,
# poll, download, check the file). It never changes a flag. Exits non-zero on the first failure.
#
# Tuning: SMOKE_RETRIES / SMOKE_DELAY (API start-up wait),
#         SMOKE_EXPORT_RETRIES / SMOKE_EXPORT_DELAY (export job polling).
set -euo pipefail

BASE_URL="${1:?Usage: $0 <base_url>}"
BASE_URL="${BASE_URL%/}"
RETRIES="${SMOKE_RETRIES:-10}"
DELAY="${SMOKE_DELAY:-3}"
EXPORT_RETRIES="${SMOKE_EXPORT_RETRIES:-30}"
EXPORT_DELAY="${SMOKE_EXPORT_DELAY:-1}"

CURL=(curl --silent --show-error --fail --max-time 10)
if [[ -n "${SMOKE_AUTH:-}" ]]; then
  CURL+=(--user "${SMOKE_AUTH}")
fi

log() { printf '[smoke] %s\n' "$*"; }
fail() { printf '[smoke] FAIL: %s\n' "$*" >&2; exit 1; }

# Tasks created by this run; deleted on exit if a check failed half-way.
CREATED_IDS=()
cleanup() {
  local id
  for id in "${CREATED_IDS[@]}"; do
    curl --silent --max-time 10 ${SMOKE_AUTH:+--user "${SMOKE_AUTH}"} -o /dev/null \
      -X DELETE "${BASE_URL}/api/tasks/${id}" || true
  done
}
trap cleanup EXIT
forget_id() {
  local keep=() id
  for id in "${CREATED_IDS[@]}"; do
    [[ "${id}" == "$1" ]] || keep+=("${id}")
  done
  CREATED_IDS=("${keep[@]}")
}

create_task() {  # create_task <title> -> prints the new id
  local created id
  created="$("${CURL[@]}" -X POST "${BASE_URL}/api/tasks" \
    -H 'Content-Type: application/json' -d "{\"title\":\"$1\"}")" || fail "create task"
  id="$(printf '%s' "${created}" | grep -o '"id":[0-9]*' | head -n1 | cut -d: -f2)"
  [[ -n "${id}" ]] || fail "no id in create response: ${created}"
  printf '%s' "${id}"
}

delete_task() {  # delete_task <id>: delete, then make sure it is gone
  local status
  "${CURL[@]}" -X DELETE -o /dev/null "${BASE_URL}/api/tasks/$1" || fail "delete task $1"
  forget_id "$1"
  status="$(curl --silent --max-time 10 ${SMOKE_AUTH:+--user "${SMOKE_AUTH}"} -o /dev/null \
    -w '%{http_code}' "${BASE_URL}/api/tasks/$1")"
  [[ "${status}" == "404" ]] || fail "task $1 still exists after delete (HTTP ${status})"
}

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

# Readiness (database reachable) can lag behind liveness right after a rollout, so retry it too.
attempt=1
until "${CURL[@]}" "${BASE_URL}/api/readyz" 2>/dev/null | grep -q '"ready"'; do
  if (( attempt >= RETRIES )); then
    fail "readyz: database not ready after ${RETRIES} attempts"
  fi
  log "waiting for database (attempt ${attempt}/${RETRIES})..."
  attempt=$((attempt + 1))
  sleep "${DELAY}"
done
log "readyz OK"

# 1b. The API echoes a valid X-Request-ID (used to correlate JSON log lines).
rid="smoke-$(date +%s)-${RANDOM}"
headers="$("${CURL[@]}" -D - -o /dev/null -H "X-Request-ID: ${rid}" "${BASE_URL}/api/healthz")" \
  || fail "healthz with X-Request-ID"
[[ "${headers,,}" == *$'\n'"x-request-id: ${rid}"$'\r'* ]] || fail "X-Request-ID not echoed"
log "X-Request-ID echoed"

# 2. Frontend shell is served (and SPA routes fall back to index.html).
"${CURL[@]}" "${BASE_URL}/" | grep -q '<div id="root">' || fail "frontend index.html not served"
"${CURL[@]}" "${BASE_URL}/week" | grep -q '<div id="root">' || fail "SPA fallback not working"
log "frontend OK"

# 3. Create -> read -> delete a task.
TITLE="smoke-test $(date +%s)-$RANDOM"
id="$(create_task "${TITLE}")"
CREATED_IDS+=("${id}")
log "created task ${id}"

"${CURL[@]}" "${BASE_URL}/api/tasks/${id}" | grep -qF "\"title\":\"${TITLE}\"" \
  || fail "task ${id} could not be read back"
log "read back task ${id}"

delete_task "${id}"
log "deleted task ${id}"

# 4. Feature flags. Contract: the API returns compact JSON with "key" right before "enabled"
#    (FeatureFlagRead field order), so a plain substring check is enough here.
features="$("${CURL[@]}" "${BASE_URL}/api/features")" || fail "GET /api/features"
if [[ "${features}" == *'"key":"export_csv","enabled":true'* ]]; then
  export_on=true
elif [[ "${features}" == *'"key":"export_csv","enabled":false'* ]]; then
  export_on=false
else
  fail "export_csv flag missing: ${features}"
fi
log "feature flags OK (export_csv=${export_on})"

# 5. CSV export round trip through the worker (only when the flag is on).
if [[ "${export_on}" == false ]]; then
  log "export_csv disabled, skipping export round-trip"
else
  EXPORT_TITLE="smoke-export $(date +%s)-$RANDOM"
  task_id="$(create_task "${EXPORT_TITLE}")"
  CREATED_IDS+=("${task_id}")

  # No --fail here: the status code is checked explicitly.
  out="$(curl --silent --show-error --max-time 10 ${SMOKE_AUTH:+--user "${SMOKE_AUTH}"} \
    -X POST --write-out '\n%{http_code}' "${BASE_URL}/api/exports")" || fail "POST /api/exports"
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  [[ "${code}" == "202" ]] || fail "POST /api/exports returned HTTP ${code}: ${body}"
  export_id="$(printf '%s' "${body}" | grep -o '"id":[0-9]*' | head -n1 | cut -d: -f2)"
  [[ -n "${export_id}" ]] || fail "no id in export response: ${body}"
  log "export ${export_id} queued"

  attempt=1
  while :; do
    job="$("${CURL[@]}" "${BASE_URL}/api/exports/${export_id}")" || fail "GET export ${export_id}"
    case "${job}" in
      *'"status":"done"'*) break ;;
      *'"status":"failed"'*) fail "export ${export_id} failed: ${job}" ;;
    esac
    if (( attempt >= EXPORT_RETRIES )); then
      fail "export ${export_id} not done after ${EXPORT_RETRIES} polls (is the worker running?)"
    fi
    attempt=$((attempt + 1))
    sleep "${EXPORT_DELAY}"
  done
  log "export ${export_id} done"

  download="$("${CURL[@]}" -D - "${BASE_URL}/api/exports/${export_id}/download")" \
    || fail "download export ${export_id}"
  # Pattern matching instead of `| grep -q`: no SIGPIPE under pipefail on a large CSV.
  download_headers="${download%%$'\r\n\r\n'*}"
  [[ "${download_headers,,}" == *$'\n'"content-type: text/csv"* ]] \
    || fail "export ${export_id}: not a text/csv response"
  [[ "${download}" == *"${EXPORT_TITLE}"* ]] || fail "export ${export_id}: task missing from CSV"
  log "export round-trip OK"

  delete_task "${task_id}"
fi

log "PASS ${BASE_URL}"
