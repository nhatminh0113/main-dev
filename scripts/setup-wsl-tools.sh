#!/usr/bin/env bash
# Install pinned DevOps CLI tools inside WSL2 (Ubuntu 24.04).
#
# - System packages (pipx, unzip) are installed with apt (requires sudo).
# - Binaries go to ~/.local/bin, no sudo needed. Each download is verified
#   against the official SHA-256 checksum file.
# - Idempotent: a tool that is already at the pinned version is skipped.
#
# Usage: bash scripts/setup-wsl-tools.sh
#        SKIP_APT=1 bash scripts/setup-wsl-tools.sh   # skip the sudo/apt step
set -euo pipefail

# ---------- Pinned versions (keep in sync with docs/MASTER_PLAN.md section 8) ----------
TERRAFORM_VERSION="1.16.6"
KUBECTL_VERSION="v1.36.5"       # matches k3s stable channel minor (v1.36)
HELM_VERSION="v4.3.1"
TFLINT_VERSION="v0.64.0"
KUBECONFORM_VERSION="v0.8.0"
NODE_VERSION="v24.22.0"         # Node.js LTS
ANSIBLE_VERSION="14.5.0"        # community package, ships ansible-core 2.21
ANSIBLE_LINT_VERSION="26.10.1"
TRIVY_VERSION="0.76.0"          # same version as the CI scan
ACTIONLINT_VERSION="1.7.12"     # GitHub Actions workflow linter

BIN_DIR="${HOME}/.local/bin"
OPT_DIR="${HOME}/.local/opt"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[32m%s\033[0m\n' "$*"; }

case "$(uname -m)" in
  x86_64)  ARCH="amd64"; NODE_ARCH="x64" ;;
  aarch64) ARCH="arm64"; NODE_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "Warning: this does not look like WSL. Continuing anyway." >&2
fi

mkdir -p "${BIN_DIR}" "${OPT_DIR}"
export PATH="${BIN_DIR}:${PATH}"

# download <url> <output>
download() { curl -fsSL --retry 3 -o "$2" "$1"; }

# verify <file> <checksum-file>: checksum file uses "<sha256>  <filename>" lines
verify() {
  local file="$1" sums="$2" name
  name="$(basename "${file}")"
  (cd "$(dirname "${file}")" && grep -E "[[:space:]]\*?${name}\$" "${sums}" | sha256sum -c --status) \
    || { echo "Checksum verification FAILED for ${name}" >&2; exit 1; }
  ok "checksum OK: ${name}"
}

# installed_version_matches <cmd> <expected-substring> <version-args...>
installed_version_matches() {
  local cmd="$1" expected="$2"; shift 2
  local out
  [[ -x "${BIN_DIR}/${cmd}" ]] || return 1
  # Capture first: `cmd | grep -q` can fail under pipefail (SIGPIPE)
  out="$("${BIN_DIR}/${cmd}" "$@" 2>&1)" || return 1
  [[ "${out}" == *"${expected}"* ]]
}

extract_zip() { python3 -m zipfile -e "$1" "$2"; }

# ---------- 1. apt packages ----------
log "apt packages: pipx unzip curl ca-certificates git openssh-client"
NEED_APT=()
for pkg in pipx unzip curl ca-certificates git openssh-client python3-venv; do
  dpkg -s "${pkg}" >/dev/null 2>&1 || NEED_APT+=("${pkg}")
done
if [[ "${SKIP_APT:-0}" == "1" ]]; then
  ok "SKIP_APT=1, skipping (missing: ${NEED_APT[*]:-none})"
elif ((${#NEED_APT[@]})); then
  sudo apt-get update
  sudo apt-get install -y "${NEED_APT[@]}"
else
  ok "already installed"
fi

# ---------- 2. Terraform ----------
log "Terraform ${TERRAFORM_VERSION}"
if installed_version_matches terraform "v${TERRAFORM_VERSION}" version; then
  ok "already installed"
else
  f="terraform_${TERRAFORM_VERSION}_linux_${ARCH}.zip"
  base="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}"
  download "${base}/${f}" "${TMP_DIR}/${f}"
  download "${base}/terraform_${TERRAFORM_VERSION}_SHA256SUMS" "${TMP_DIR}/tf.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/tf.sums"
  extract_zip "${TMP_DIR}/${f}" "${TMP_DIR}/tf"
  install -m 0755 "${TMP_DIR}/tf/terraform" "${BIN_DIR}/terraform"
fi

# ---------- 3. kubectl ----------
log "kubectl ${KUBECTL_VERSION}"
if installed_version_matches kubectl "${KUBECTL_VERSION}" version --client; then
  ok "already installed"
else
  base="https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}"
  download "${base}/kubectl" "${TMP_DIR}/kubectl"
  echo "$(curl -fsSL "${base}/kubectl.sha256")  kubectl" > "${TMP_DIR}/kubectl.sums"
  verify "${TMP_DIR}/kubectl" "${TMP_DIR}/kubectl.sums"
  install -m 0755 "${TMP_DIR}/kubectl" "${BIN_DIR}/kubectl"
fi

# ---------- 4. Helm ----------
log "Helm ${HELM_VERSION}"
if installed_version_matches helm "${HELM_VERSION}" version --short; then
  ok "already installed"
else
  f="helm-${HELM_VERSION}-linux-${ARCH}.tar.gz"
  download "https://get.helm.sh/${f}" "${TMP_DIR}/${f}"
  download "https://get.helm.sh/${f}.sha256sum" "${TMP_DIR}/helm.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/helm.sums"
  tar -xzf "${TMP_DIR}/${f}" -C "${TMP_DIR}"
  install -m 0755 "${TMP_DIR}/linux-${ARCH}/helm" "${BIN_DIR}/helm"
fi

# ---------- 5. tflint ----------
log "tflint ${TFLINT_VERSION}"
if installed_version_matches tflint "${TFLINT_VERSION#v}" --version; then
  ok "already installed"
else
  f="tflint_linux_${ARCH}.zip"
  base="https://github.com/terraform-linters/tflint/releases/download/${TFLINT_VERSION}"
  download "${base}/${f}" "${TMP_DIR}/${f}"
  download "${base}/checksums.txt" "${TMP_DIR}/tflint.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/tflint.sums"
  extract_zip "${TMP_DIR}/${f}" "${TMP_DIR}/tflint"
  install -m 0755 "${TMP_DIR}/tflint/tflint" "${BIN_DIR}/tflint"
fi

# ---------- 6. kubeconform ----------
log "kubeconform ${KUBECONFORM_VERSION}"
if installed_version_matches kubeconform "${KUBECONFORM_VERSION#v}" -v; then
  ok "already installed"
else
  f="kubeconform-linux-${ARCH}.tar.gz"
  base="https://github.com/yannh/kubeconform/releases/download/${KUBECONFORM_VERSION}"
  download "${base}/${f}" "${TMP_DIR}/${f}"
  download "${base}/CHECKSUMS" "${TMP_DIR}/kubeconform.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/kubeconform.sums"
  mkdir -p "${TMP_DIR}/kc"
  tar -xzf "${TMP_DIR}/${f}" -C "${TMP_DIR}/kc"
  install -m 0755 "${TMP_DIR}/kc/kubeconform" "${BIN_DIR}/kubeconform"
fi

# ---------- 6b. Trivy (vulnerability scanner) ----------
log "Trivy ${TRIVY_VERSION}"
if installed_version_matches trivy "Version: ${TRIVY_VERSION}" --version; then
  ok "already installed"
else
  t_arch=$([[ "${ARCH}" == "amd64" ]] && echo "64bit" || echo "ARM64")
  f="trivy_${TRIVY_VERSION}_Linux-${t_arch}.tar.gz"
  base="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"
  download "${base}/${f}" "${TMP_DIR}/${f}"
  download "${base}/trivy_${TRIVY_VERSION}_checksums.txt" "${TMP_DIR}/trivy.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/trivy.sums"
  mkdir -p "${TMP_DIR}/trivy"
  tar -xzf "${TMP_DIR}/${f}" -C "${TMP_DIR}/trivy"
  install -m 0755 "${TMP_DIR}/trivy/trivy" "${BIN_DIR}/trivy"
fi

# ---------- 6c. actionlint ----------
log "actionlint ${ACTIONLINT_VERSION}"
if installed_version_matches actionlint "${ACTIONLINT_VERSION}" -version; then
  ok "already installed"
else
  f="actionlint_${ACTIONLINT_VERSION}_linux_${ARCH}.tar.gz"
  base="https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}"
  download "${base}/${f}" "${TMP_DIR}/${f}"
  download "${base}/actionlint_${ACTIONLINT_VERSION}_checksums.txt" "${TMP_DIR}/actionlint.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/actionlint.sums"
  mkdir -p "${TMP_DIR}/actionlint"
  tar -xzf "${TMP_DIR}/${f}" -C "${TMP_DIR}/actionlint"
  install -m 0755 "${TMP_DIR}/actionlint/actionlint" "${BIN_DIR}/actionlint"
fi

# ---------- 7. Node.js LTS ----------
log "Node.js ${NODE_VERSION}"
NODE_DIR="${OPT_DIR}/node-${NODE_VERSION}-linux-${NODE_ARCH}"
if [[ -x "${NODE_DIR}/bin/node" ]]; then
  ok "already installed"
else
  f="node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  base="https://nodejs.org/dist/${NODE_VERSION}"
  download "${base}/${f}" "${TMP_DIR}/${f}"
  download "${base}/SHASUMS256.txt" "${TMP_DIR}/node.sums"
  verify "${TMP_DIR}/${f}" "${TMP_DIR}/node.sums"
  tar -xJf "${TMP_DIR}/${f}" -C "${OPT_DIR}"
fi
for b in node npm npx corepack; do
  ln -sfn "${NODE_DIR}/bin/${b}" "${BIN_DIR}/${b}"
done

# ---------- 8. Ansible + ansible-lint (pipx) ----------
log "Ansible ${ANSIBLE_VERSION} + ansible-lint ${ANSIBLE_LINT_VERSION} (pipx)"
pipx_has() { pipx list --short 2>/dev/null | grep -q "^$1 $2\$"; }
if ! command -v pipx >/dev/null; then
  echo "    pipx not found: run this script again without SKIP_APT to install it" >&2
else
  if pipx_has ansible "${ANSIBLE_VERSION}"; then
    ok "ansible already installed"
  else
    pipx install --force --include-deps "ansible==${ANSIBLE_VERSION}"
  fi
  if pipx_has ansible-lint "${ANSIBLE_LINT_VERSION}"; then
    ok "ansible-lint already installed"
  else
    pipx install --force "ansible-lint==${ANSIBLE_LINT_VERSION}"
  fi
  pipx ensurepath >/dev/null
fi

# ---------- 9. Make sure ~/.local/bin comes first in PATH ----------
# Windows interop puts /mnt/c/... (e.g. Windows npm) on PATH; Linux binaries must win.
MARKER="# added by setup-wsl-tools.sh"
if ! grep -qF "${MARKER}" "${HOME}/.bashrc" 2>/dev/null; then
  printf '\n%s\nexport PATH="$HOME/.local/bin:$PATH"\n' "${MARKER}" >> "${HOME}/.bashrc"
  ok "added ~/.local/bin to PATH in ~/.bashrc"
fi

# ---------- Summary ----------
log "Installed versions"
echo "terraform  : $(terraform version | head -1)"
echo "kubectl    : $(kubectl version --client 2>/dev/null | head -1)"
echo "helm       : $(helm version --short)"
echo "tflint     : $(tflint --version | head -1)"
echo "kubeconform: $(kubeconform -v)"
echo "trivy      : $(trivy --version | head -1)"
echo "actionlint : $(actionlint -version | head -1)"
echo "node       : $(node --version)  (npm $(npm --version))"
echo "ansible    : $(ansible --version | head -1)"
echo "ansible-lint: $(ansible-lint --version 2>/dev/null | head -1)"
if command -v docker >/dev/null && [[ "$(command -v docker)" != /mnt/* ]]; then
  echo "docker     : $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'daemon not reachable')"
else
  echo "docker     : NOT available in WSL -> enable Docker Desktop WSL integration (see docs/setup-wsl.md)"
fi
echo
echo "Done. Open a new terminal (or run: source ~/.bashrc) so PATH changes take effect."
