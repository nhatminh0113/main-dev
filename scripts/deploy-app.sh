#!/usr/bin/env bash
# Create the app Secrets and deploy the Helm chart into one namespace (used by the CD jobs).
#
#   scripts/deploy-app.sh <namespace> <values-file> <host>
#   scripts/deploy-app.sh staging helm/taskapp/values-staging.yaml staging.taskapp.internal
#
# Required environment (never passed on the command line, never printed):
#   IMAGE_TAG            image tag for both components, sha-<7 hex>
#   DB_PASSWORD          PostgreSQL password, hex only (it is placed in DATABASE_URL), e.g. openssl rand -hex 32
#   BASIC_AUTH_USERNAME  Basic Auth user for the Ingress
#   BASIC_AUTH_PASSWORD  Basic Auth password (use a long random value)
# Optional: RELEASE (taskapp), CHART (./helm/taskapp), HELM_TIMEOUT (5m).
#
# Secrets taskapp-db (key password) and taskapp-basic-auth (key users, htpasswd bcrypt line)
# are written to a private temp dir, loaded with --from-file and applied; the dir is removed on exit.
# Helm 4: --rollback-on-failure replaces --atomic. Exit code 2 means bad input.
set -euo pipefail

usage() { printf 'Usage: %s <namespace> <values-file> <host>\n' "$0" >&2; exit 2; }
bad() { printf 'deploy-app: %s\n' "$*" >&2; exit 2; }

[[ $# -eq 3 ]] || usage
namespace="$1"
values_file="$2"
host="$3"

release="${RELEASE:-taskapp}"
chart="${CHART:-./helm/taskapp}"
helm_timeout="${HELM_TIMEOUT:-5m}"

# Input checks. Messages name the variable, never its value.
[[ "${namespace}" =~ ^(staging|prod)$ ]] || bad "namespace must be staging or prod"
[[ -n "${values_file}" && -f "${values_file}" ]] || bad "values file not found"
[[ "${host}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || bad "host is empty or not a valid DNS name"
[[ "${IMAGE_TAG:-}" =~ ^sha-[0-9a-f]{7}$ ]] || bad "IMAGE_TAG must match sha-<7 hex chars>"
[[ "${DB_PASSWORD:-}" =~ ^[0-9A-Fa-f]{32,}$ ]] \
  || bad "DB_PASSWORD must be at least 32 hex characters (openssl rand -hex 32)"
[[ "${BASIC_AUTH_USERNAME:-}" =~ ^[A-Za-z0-9._-]{1,64}$ ]] \
  || bad "BASIC_AUTH_USERNAME must be 1-64 characters from A-Z a-z 0-9 . _ -"
[[ -n "${BASIC_AUTH_PASSWORD:-}" && "${BASIC_AUTH_PASSWORD}" != *$'\n'* ]] \
  || bad "BASIC_AUTH_PASSWORD must be set and must not contain a newline"

for tool in kubectl helm htpasswd; do
  command -v "${tool}" >/dev/null 2>&1 || bad "${tool} not found in PATH"
done

umask 077
secret_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/deploy.XXXXXX")"
trap 'rm -rf "${secret_dir}"' EXIT

# printf is a shell builtin: the values do not appear in any process argument list.
printf '%s' "${DB_PASSWORD}" > "${secret_dir}/password"

# bcrypt hash, password read from stdin; -n prints to stdout; blank lines removed.
users="$(printf '%s\n' "${BASIC_AUTH_PASSWORD}" | htpasswd -niB "${BASIC_AUTH_USERNAME}" | sed '/^[[:space:]]*$/d')"
# shellcheck disable=SC2016 # '$2' and '$' are the literal bcrypt prefix
if [[ "${users}" == *$'\n'* || "${users}" != "${BASIC_AUTH_USERNAME}:"'$2'[aby]'$'* ]]; then
  bad "htpasswd did not return a single bcrypt line"
fi
printf '%s\n' "${users}" > "${secret_dir}/users"

apply_secret() {  # apply_secret <name> <key> <file>
  kubectl -n "${namespace}" create secret generic "$1" --from-file="$2=$3" \
    --dry-run=client -o yaml | kubectl -n "${namespace}" apply -f -
}
apply_secret taskapp-db password "${secret_dir}/password"
apply_secret taskapp-basic-auth users "${secret_dir}/users"

helm upgrade --install "${release}" "${chart}" \
  -n "${namespace}" \
  -f "${values_file}" \
  --set "image.tag=${IMAGE_TAG}" \
  --set "ingress.host=${host}" \
  --rollback-on-failure --wait --timeout "${helm_timeout}"

helm -n "${namespace}" status "${release}" | sed -n '1,6p'
kubectl -n "${namespace}" get pods -l "app.kubernetes.io/instance=${release}"
