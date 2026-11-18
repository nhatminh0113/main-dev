#!/usr/bin/env bash
# Unit test for files/job-started.sh (the runner pre-job hook).
# Usage (from infra/ansible): bash roles/github_runner/tests/test_job_started_hook.sh
# Exit 0 when every case behaves as expected.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hook_src="${here}/../files/job-started.sh"
[[ -f "$hook_src" ]] || { echo "Not found: ${hook_src}" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$hook_src" "${work}/job-started.sh"
hook="${work}/job-started.sh"
conf="${work}/job-started.conf"

repo="nhatminh0113/main-dev"
pass=0
fail=0

write_conf() { printf '# managed by Ansible\nrepository=%s\n' "$1" >"$conf"; }

# run_case <name> <expected exit> [VAR=value ...]  (environment is cleared first)
run_case() {
  local name="$1" expected="$2" rc=0 out err
  shift 2
  out="${work}/stdout"
  err="${work}/stderr"
  env -i PATH=/usr/bin:/bin "$@" bash "$hook" >"$out" 2>"$err" || rc=$?
  local ok=1
  [[ "$rc" -eq "$expected" ]] || ok=0
  if [[ "$expected" -ne 0 ]]; then
    [[ ! -s "$out" ]] || ok=0
    [[ "$(head -c 9 "$err")" == "::error::" ]] || ok=0
  fi
  if [[ "$ok" -eq 1 ]]; then
    pass=$((pass + 1))
    echo "ok   ${name}"
  else
    fail=$((fail + 1))
    echo "FAIL ${name} (exit ${rc}, expected ${expected})"
  fi
}

write_conf "$repo"
run_case "push to develop" 0 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop
run_case "push to main" 0 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main
run_case "pull_request" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/heads/develop
run_case "pull_request_target" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=pull_request_target GITHUB_REF=refs/heads/develop
run_case "workflow_dispatch" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF=refs/heads/develop
run_case "schedule" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=schedule GITHUB_REF=refs/heads/main
run_case "feature branch" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/feature/x
run_case "develop-x branch" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop-x
run_case "tag" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/tags/v1
run_case "pull ref" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/pull/1/merge
run_case "other repository" 1 GITHUB_REPOSITORY=someone/main-dev GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop
run_case "repository case variant" 1 GITHUB_REPOSITORY=NhatMinh0113/main-dev GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop
run_case "all variables unset" 1
run_case "empty variables" 1 GITHUB_REPOSITORY= GITHUB_EVENT_NAME= GITHUB_REF=

write_conf "someone/else"
run_case "conf names another repository" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop

rm -f "$conf"
run_case "conf missing" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop

printf 'repository=%s' "$repo" >"$conf"
run_case "conf without trailing newline" 0 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop

: >"$conf"
run_case "conf empty" 1 "GITHUB_REPOSITORY=${repo}" GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop

printf 'repository=\n' >"$conf"
run_case "conf with empty repository and empty env" 1 GITHUB_REPOSITORY= GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/develop

echo "passed: ${pass}, failed: ${fail}"
[[ "$fail" -eq 0 ]]
