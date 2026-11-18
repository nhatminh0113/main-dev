#!/usr/bin/env bash
# Run an Ansible tool on a copy of infra/ansible inside the WSL filesystem.
#
# Ansible ignores ansible.cfg in a world-writable directory, and every directory
# under /mnt/<drive> is world-writable. This script syncs infra/ansible/ to
# ~/work/taskapp/infra/ansible/ (directories 755, files 644) and runs the tool there.
# The gitignored inventory/hosts.yml and inventory/host_vars/ are copied too, and kept
# in the copy when the source does not have them.
#
# Usage: bash scripts/ansible-wsl.sh <tool> [args...]
#   tool: playbook | ansible | inventory | lint | galaxy (or the full command name)
# Examples:
#   bash "/mnt/d/ĐỒ ÁN II/kiro 1/scripts/ansible-wsl.sh" playbook playbooks/site.yml -u nhat -K
#   bash scripts/ansible-wsl.sh ansible k3s -m ansible.builtin.ping
#   bash scripts/ansible-wsl.sh lint
# Override the destination with ANSIBLE_WORKDIR=/path.
set -euo pipefail

usage() {
  echo "Usage: $0 <playbook|ansible|inventory|lint|galaxy> [args...]" >&2
  exit 2
}

[[ $# -ge 1 ]] || usage
case "$1" in
  playbook | ansible-playbook) tool=ansible-playbook ;;
  ansible) tool=ansible ;;
  inventory | ansible-inventory) tool=ansible-inventory ;;
  lint | ansible-lint) tool=ansible-lint ;;
  galaxy | ansible-galaxy) tool=ansible-galaxy ;;
  *) usage ;;
esac
shift

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${repo_root}/infra/ansible/"
dest="${ANSIBLE_WORKDIR:-${HOME}/work/taskapp/infra/ansible}"

[[ -f "${src}ansible.cfg" ]] || { echo "Not found: ${src}ansible.cfg" >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is required: sudo apt-get install rsync" >&2; exit 1; }

export PATH="${HOME}/.local/bin:${PATH}"
command -v "${tool}" >/dev/null || { echo "${tool} not found: run scripts/setup-wsl-tools.sh" >&2; exit 1; }

umask 022
mkdir -p "${dest}"
# P = protect from --delete: the local inventory and ansible-lint's cache directory.
rsync -rlt --delete --chmod=D755,F644 \
  --filter='P /inventory/hosts.yml' \
  --filter='P /inventory/host_vars/' \
  --exclude='/.ansible/' \
  "${src}" "${dest}/"

cd "${dest}"
export ANSIBLE_CONFIG="${dest}/ansible.cfg"
if [[ "${tool}" == "ansible-lint" ]]; then
  # pipx puts ansible-lint in its own venv, which cannot see the collections bundled
  # with the ansible package. Install the pinned ones where it looks (no-op when present).
  # SCAN_SYS_PATH=False: ignore the bundled copies, or galaxy reports "Nothing to do".
  ANSIBLE_COLLECTIONS_SCAN_SYS_PATH=False \
    ansible-galaxy collection install -r requirements.yml -p "${HOME}/.ansible/collections" >/dev/null
fi
exec "${tool}" "$@"
