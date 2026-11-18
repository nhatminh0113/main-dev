#!/usr/bin/env bash
# SSH tunnel to the k3s API server on the VM. Port 6443 stays closed in UFW, so
# kubectl, helm and Terraform on the dev machine reach the API through this tunnel.
#
#   VPS_HOST=<vm-ip> scripts/tunnel.sh start    # open in the background
#   VPS_HOST=<vm-ip> scripts/tunnel.sh status   # exit 0 when the tunnel is up
#   VPS_HOST=<vm-ip> scripts/tunnel.sh stop
#   scripts/tunnel.sh start 192.168.56.10       # the host can also be an argument
#   KUBECONFIG=~/.kube/config-vps kubectl get nodes
#
# Settings: VPS_HOST (required, never committed), VPS_USER (default deploy),
#           TUNNEL_LOCAL_PORT (default 6443, must match the kubeconfig server URL),
#           TUNNEL_SOCKET (control socket, default ~/.ssh/k3s-tunnel.sock).
# The tunnel runs as an SSH control master, so status/stop talk to that socket
# instead of searching the process list.
set -euo pipefail

usage() {
  printf 'Usage: [VPS_HOST=<host>] %s start|stop|status [host]\n' "$0" >&2
  exit 2
}

[[ $# -eq 1 || $# -eq 2 ]] || usage
VPS_HOST="${2:-${VPS_HOST:-}}"
[[ -n "${VPS_HOST}" ]] || { echo "Set VPS_HOST or pass the VM address as the second argument" >&2; exit 2; }
VPS_USER="${VPS_USER:-deploy}"
LOCAL_PORT="${TUNNEL_LOCAL_PORT:-6443}"
SOCKET="${TUNNEL_SOCKET:-${HOME}/.ssh/k3s-tunnel.sock}"
DEST="${VPS_USER}@${VPS_HOST}"

log() { printf '[tunnel] %s\n' "$*"; }

is_up() {
  ssh -S "${SOCKET}" -O check "${DEST}" >/dev/null 2>&1
}

case "$1" in
  start)
    if is_up; then
      log "already running (127.0.0.1:${LOCAL_PORT} -> ${DEST}:6443)"
      exit 0
    fi
    mkdir -p "$(dirname "${SOCKET}")"
    # A socket left behind by a killed tunnel would stop ssh from becoming master.
    rm -f "${SOCKET}"
    # -f only backgrounds after the forward is in place (ExitOnForwardFailure),
    # so a busy local port makes this command fail instead of hanging silently.
    ssh -f -N -M -S "${SOCKET}" \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:6443" \
      "${DEST}"
    is_up || { log "tunnel did not come up" >&2; exit 1; }
    log "running (127.0.0.1:${LOCAL_PORT} -> ${DEST}:6443)"
    ;;
  stop)
    if is_up; then
      ssh -S "${SOCKET}" -O exit "${DEST}" >/dev/null 2>&1
      log "stopped"
    else
      log "not running"
    fi
    ;;
  status)
    if is_up; then
      log "running (127.0.0.1:${LOCAL_PORT} -> ${DEST}:6443)"
    else
      log "not running"
      exit 1
    fi
    ;;
  *)
    usage
    ;;
esac
