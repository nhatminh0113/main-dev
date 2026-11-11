#!/usr/bin/env bash
# Pre-job hook of the self-hosted runner (ACTIONS_RUNNER_HOOK_JOB_STARTED).
#
# The runner executes this script before every job. A non-zero exit rejects the job.
# It is a server-side guard that does not depend on the content of any workflow: the
# VM only runs jobs for a push to develop or main of the one repository named in
# job-started.conf (next to this script). Owned by root, so the runner user cannot
# edit it. Installed and managed by the github_runner Ansible role.
set -euo pipefail

conf="${BASH_SOURCE[0]%/*}/job-started.conf"

reject() {
  printf '::error::runner hook: job rejected: %s\n' "$1" >&2
  exit 1
}

# The config is parsed line by line, never sourced.
allowed_repository=""
if [[ -r "$conf" ]]; then
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    if [[ "$key" == "repository" ]]; then
      allowed_repository="$value"
    fi
  done <"$conf"
fi
[[ -n "$allowed_repository" ]] || reject "no allowed repository configured"

repository="${GITHUB_REPOSITORY:-}"
event="${GITHUB_EVENT_NAME:-}"
ref="${GITHUB_REF:-}"

if [[ "$repository" != "$allowed_repository" ]]; then
  reject "repository $(printf '%q' "$repository") is not allowed"
fi
if [[ "$event" != "push" ]]; then
  reject "event $(printf '%q' "$event") is not allowed (push only)"
fi
case "$ref" in
  refs/heads/develop | refs/heads/main) ;;
  *) reject "ref $(printf '%q' "$ref") is not allowed (develop and main only)" ;;
esac

printf 'runner hook: accepted %q %q %q\n' "$repository" "$event" "$ref"
