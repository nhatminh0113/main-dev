#!/usr/bin/env bash
# Generate mixed HTTP traffic against a deployment so dashboards and alerts have data.
#
#   scripts/load-test.sh http://localhost:8080
#   scripts/load-test.sh --cacert ca.crt --duration 60 --concurrency 8 https://staging.<base_domain>
#   DURATION=300 CONCURRENCY=6 CURL_CA_BUNDLE=ca.crt scripts/load-test.sh https://app.<base_domain>
#
# Each worker loops until the deadline and picks a request at random:
#   ~50% GET /api/tasks, ~20% create + patch + delete its own task, ~10% GET of a missing
#   task (404), ~10% GET /api/healthz, ~10% GET / (frontend).
# Tasks created by this script are deleted right away, and again on exit if the run is
# interrupted. No authentication. Prints a count per HTTP status code at the end.
#
# Options (flags override environment variables):
#   --duration SECONDS     DURATION     run time, default 120
#   --concurrency N        CONCURRENCY  parallel workers, default 4
#   --cacert FILE          CURL_CA_BUNDLE  CA certificate to trust (internal-ca)
#   --dry-run              print the settings and exit without sending requests
#
# Exit codes: 0 ok, 1 no request succeeded (API unreachable), 2 usage error.
set -euo pipefail

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; }
die_usage() { printf '[load] %s\n' "$*" >&2; printf 'Usage: %s [options] <base_url>\n' "$0" >&2; exit 2; }
log() { printf '[load] %s\n' "$*"; }

DURATION="${DURATION:-120}"
CONCURRENCY="${CONCURRENCY:-4}"
CACERT="${CURL_CA_BUNDLE:-}"
DRY_RUN=false
BASE_URL=""

while (( $# > 0 )); do
  case "$1" in
    --duration)    [[ $# -ge 2 ]] || die_usage "--duration needs a value"; DURATION="$2"; shift 2 ;;
    --concurrency) [[ $# -ge 2 ]] || die_usage "--concurrency needs a value"; CONCURRENCY="$2"; shift 2 ;;
    --cacert)      [[ $# -ge 2 ]] || die_usage "--cacert needs a value"; CACERT="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=true; shift ;;
    -h|--help)     usage; exit 0 ;;
    -*)            die_usage "unknown option: $1" ;;
    *)             [[ -z "${BASE_URL}" ]] || die_usage "unexpected argument: $1"; BASE_URL="$1"; shift ;;
  esac
done

[[ -n "${BASE_URL}" ]] || die_usage "missing <base_url>"
BASE_URL="${BASE_URL%/}"
[[ "${BASE_URL}" =~ ^https?://[^/]+ ]] || die_usage "base_url must start with http:// or https://"
[[ "${DURATION}" =~ ^[1-9][0-9]*$ ]] || die_usage "DURATION must be a positive integer (seconds)"
[[ "${CONCURRENCY}" =~ ^[1-9][0-9]*$ ]] || die_usage "CONCURRENCY must be a positive integer"
(( CONCURRENCY <= 64 )) || die_usage "CONCURRENCY must be at most 64"
if [[ -n "${CACERT}" && ! -r "${CACERT}" ]]; then
  die_usage "CA file not readable: ${CACERT}"
fi

CURL=(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}')
if [[ -n "${CACERT}" ]]; then
  CURL+=(--cacert "${CACERT}")
fi

log "target=${BASE_URL} duration=${DURATION}s concurrency=${CONCURRENCY} cacert=${CACERT:-<system>}"
if [[ "${DRY_RUN}" == true ]]; then
  log "dry run, no requests sent"
  exit 0
fi

WORKDIR="$(mktemp -d)"
cleanup() {
  local f id
  # Stop workers still running (interrupted run), then delete tasks they left behind.
  jobs -p | xargs -r kill 2>/dev/null || true
  wait 2>/dev/null || true
  for f in "${WORKDIR}"/cur.*; do
    [[ -s "${f}" ]] || continue
    id="$(<"${f}")"
    "${CURL[@]}" -X DELETE "${BASE_URL}/api/tasks/${id}" >/dev/null 2>&1 || true
  done
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# req <method> <path> [curl args...]: prints the HTTP status code (000 when the request failed).
req() {
  local method="$1" path="$2" code
  shift 2
  code="$("${CURL[@]}" -X "${method}" "$@" "${BASE_URL}${path}" 2>/dev/null)" || true
  printf '%s' "${code:-000}"
}

worker() {  # worker <n> <deadline_epoch>
  local n="$1" deadline="$2" codes="${WORKDIR}/codes.$1" cur="${WORKDIR}/cur.$1"
  local pick id out code
  : >"${codes}"
  while (( SECONDS < deadline )); do
    pick=$((RANDOM % 10))
    if (( pick < 5 )); then
      req GET /api/tasks >>"${codes}"; echo >>"${codes}"
    elif (( pick < 7 )); then
      out="$(curl --silent --max-time 10 ${CACERT:+--cacert "${CACERT}"} -w '\n%{http_code}' \
        -X POST -H 'Content-Type: application/json' \
        -d "{\"title\":\"load-test ${n}-${RANDOM}\"}" "${BASE_URL}/api/tasks" 2>/dev/null)" || out=$'\n000'
      code="${out##*$'\n'}"
      echo "${code:-000}" >>"${codes}"
      id="$(printf '%s' "${out}" | grep -o '"id": *[0-9]*' | head -n1 | tr -dc '0-9' || true)"
      if [[ -n "${id}" ]]; then
        echo "${id}" >"${cur}"
        {
          req PATCH "/api/tasks/${id}" -H 'Content-Type: application/json' -d '{"done":true}'
          echo
          req DELETE "/api/tasks/${id}"
          echo
        } >>"${codes}"
        : >"${cur}"
      fi
    elif (( pick < 8 )); then
      req GET /api/tasks/999999999 >>"${codes}"; echo >>"${codes}"
    elif (( pick < 9 )); then
      req GET /api/healthz >>"${codes}"; echo >>"${codes}"
    else
      req GET / >>"${codes}"; echo >>"${codes}"
    fi
  done
}

START="${SECONDS}"
DEADLINE=$((SECONDS + DURATION))
for ((i = 1; i <= CONCURRENCY; i++)); do
  worker "${i}" "${DEADLINE}" &
done
wait
ELAPSED=$((SECONDS - START))

cat "${WORKDIR}"/codes.* | grep -v '^$' | sort | uniq -c | sort -k2 >"${WORKDIR}/summary" || true
total="$(awk '{s += $1} END {print s + 0}' "${WORKDIR}/summary")"
ok="$(awk '$2 ~ /^[23]/ {s += $1} END {print s + 0}' "${WORKDIR}/summary")"

log "finished in ${ELAPSED}s: ${total} requests"
log "status code counts:"
awk '{printf "[load]   %s  %s\n", $2, $1}' "${WORKDIR}/summary"

if (( ok == 0 )); then
  printf '[load] FAIL: no request succeeded, is %s reachable?\n' "${BASE_URL}" >&2
  exit 1
fi
