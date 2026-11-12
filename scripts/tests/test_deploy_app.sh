#!/usr/bin/env bash
# Tests for scripts/deploy-app.sh with stub kubectl and helm (no cluster needed).
#   bash scripts/tests/test_deploy_app.sh
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo}"

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
mkdir -p "${work}/bin" "${work}/runner-temp"

# --- stubs -------------------------------------------------------------------------------------
cat > "${work}/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >> "${STUB_LOG}"
if [[ " $* " == *" create secret generic "* ]]; then
  for arg in "$@"; do
    case "${arg}" in
      --from-file=*)
        spec="${arg#--from-file=}"; key="${spec%%=*}"; path="${spec#*=}"
        echo "secret-file key=${key} bytes=$(wc -c < "${path}") sha256=$(sha256sum < "${path}" | cut -d' ' -f1)" >> "${STUB_LOG}"
        ;;
    esac
  done
  printf 'apiVersion: v1\nkind: Secret\n'
elif [[ " $* " == *" apply -f - "* ]]; then
  echo "apply bytes=$(wc -c)" >> "${STUB_LOG}"
fi
exit 0
STUB
cat > "${work}/bin/helm" <<'STUB'
#!/usr/bin/env bash
echo "helm $*" >> "${STUB_LOG}"
exit "${STUB_HELM_EXIT:-0}"
STUB
chmod +x "${work}/bin/"*

# --- harness -----------------------------------------------------------------------------------
pass=0
fail=0
out=""
rc=0
log="${work}/stub.log"
db_pw="0123456789abcdef0123456789abcdef0123456789abcdef"

ok() { printf 'ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf 'FAIL %s\n' "$1"; fail=$((fail + 1)); }
check() {  # check <description> <command...>
  local desc="$1"; shift
  if "$@"; then ok "${desc}"; else bad "${desc}"; fi
}

# run <VAR=value>... -- <args...>: valid defaults, overridden by the VAR=value pairs.
run() {
  local -a envs=(
    "PATH=${work}/bin:${PATH}" "RUNNER_TEMP=${work}/runner-temp" "STUB_LOG=${log}"
    "IMAGE_TAG=sha-abc1234" "DB_PASSWORD=${db_pw}"
  )
  while [[ $# -gt 0 && "$1" != "--" ]]; do envs+=("$1"); shift; done
  shift
  : > "${log}"
  rc=0
  out="$(env "${envs[@]}" bash scripts/deploy-app.sh "$@" 2>&1)" || rc=$?
}
args_ok=(staging helm/taskapp/values-staging.yaml staging.taskapp.internal)

log_has() { grep -qF -- "$1" "${log}"; }
log_lacks() { ! grep -qF -- "$1" "${log}"; }
out_lacks() { [[ "${out}" != *"$1"* ]]; }
no_temp_left() { [[ -z "$(ls -A "${work}/runner-temp")" ]]; }
no_helm() { ! grep -q '^helm ' "${log}"; }
no_kubectl() { ! grep -q '^kubectl ' "${log}"; }

# --- 1. valid staging run ----------------------------------------------------------------------
run -- "${args_ok[@]}"
check "valid run exits 0" test "${rc}" -eq 0
expected="helm upgrade --install taskapp ./helm/taskapp -n staging -f helm/taskapp/values-staging.yaml --set image.tag=sha-abc1234 --set ingress.host=staging.taskapp.internal --rollback-on-failure --wait --timeout 5m"
check "helm argv is exact" log_has "${expected}"
check "helm argv is the only helm upgrade line" test "$(grep -c '^helm upgrade' "${log}")" -eq 1
want_sha="$(printf '%s' "${db_pw}" | sha256sum | cut -d' ' -f1)"
check "password file has no trailing newline" log_has "secret-file key=password bytes=${#db_pw} sha256=${want_sha}"
check "only the DB secret is applied" test "$(grep -c '^apply bytes=' "${log}")" -eq 1
check "secret named taskapp-db" log_has "create secret generic taskapp-db "
check "no Basic Auth secret or htpasswd call" log_lacks "basic-auth"
check "DB password not in stub log" log_lacks "${db_pw}"
check "DB password not in output" out_lacks "${db_pw}"
check "no deploy dir left behind" no_temp_left

# --- 2-7. rejected input -----------------------------------------------------------------------
run IMAGE_TAG=latest -- "${args_ok[@]}"
check "IMAGE_TAG=latest fails" test "${rc}" -ne 0
check "IMAGE_TAG=latest: helm not called" no_helm

run DB_PASSWORD='not-hex!' -- "${args_ok[@]}"
check "non-hex DB_PASSWORD fails" test "${rc}" -ne 0
check "non-hex DB_PASSWORD: value not echoed" out_lacks 'not-hex!'
check "non-hex DB_PASSWORD: kubectl not called" no_kubectl

run -- kube-system helm/taskapp/values-staging.yaml staging.taskapp.internal
check "namespace kube-system fails" test "${rc}" -ne 0
check "namespace kube-system: nothing called" no_kubectl

run -- staging helm/taskapp/values-staging.yaml ""
check "empty host fails" test "${rc}" -ne 0
check "empty host: helm not called" no_helm

run -- staging
check "wrong argument count fails" test "${rc}" -ne 0

# --- 8. helm failure ---------------------------------------------------------------------------
run STUB_HELM_EXIT=1 -- "${args_ok[@]}"
check "helm failure propagates" test "${rc}" -ne 0
check "helm failure: deploy dir removed" no_temp_left

printf '\n%d passed, %d failed\n' "${pass}" "${fail}"
[[ "${fail}" -eq 0 ]]
