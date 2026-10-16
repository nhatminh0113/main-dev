#!/usr/bin/env bash
# Static checks for the Helm chart (run locally and in CI):
#   1. helm lint --strict with the staging and prod values
#   2. helm template | kubeconform -strict for staging, prod and an "everything enabled" render
#      (CRDs such as Traefik Middleware and ServiceMonitor are validated via the CRDs catalog)
#   3. Guard rails: rendering must fail without image.tag, with image.tag=latest or without a host
#
# Usage: scripts/helm-check.sh            (needs helm and kubeconform on PATH)
set -euo pipefail

CHART="helm/taskapp"
K8S_VERSION="${K8S_VERSION:-1.36.5}"   # matches the k3s version planned for the VPS
TAG="sha-0000000"
# Pinned commit of https://github.com/datreeio/CRDs-catalog (JSON schemas for common CRDs)
CRDS_CATALOG="https://raw.githubusercontent.com/datreeio/CRDs-catalog/63669a570e231d4f1f8396d229a1de512bcf0a34"

cd "$(dirname "$0")/.."

kubeconform_check() {
  kubeconform -strict -summary -kubernetes-version "${K8S_VERSION}" \
    -schema-location default \
    -schema-location "${CRDS_CATALOG}/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json"
}

for env in staging prod; do
  host="${env}.203.0.113.10.sslip.io"
  echo "==> ${env}: helm lint"
  helm lint --strict "${CHART}" -f "${CHART}/values-${env}.yaml" \
    --set image.tag="${TAG}" --set ingress.host="${host}"

  echo "==> ${env}: kubeconform (as deployed, plus monitoring + network policies)"
  for extra in "" "--set serviceMonitor.enabled=true --set networkPolicy.enabled=true"; do
    # shellcheck disable=SC2086  # $extra is intentionally word-split
    helm template taskapp "${CHART}" -n "${env}" -f "${CHART}/values-${env}.yaml" \
      --set image.tag="${TAG}" --set ingress.host="${host}" ${extra} | kubeconform_check
  done
done

echo "==> guard rails"
expect_fail() {
  local why="$1"; shift
  if helm template taskapp "${CHART}" "$@" >/dev/null 2>&1; then
    echo "FAIL: render should have failed: ${why}" >&2
    exit 1
  fi
  echo "ok: refuses to render ${why}"
}
expect_fail "without image.tag" --set ingress.host=example.test
expect_fail "with image.tag=latest" --set image.tag=latest --set ingress.host=example.test
expect_fail "without ingress.host" --set image.tag="${TAG}"

echo "==> rendered image references"
helm template taskapp "${CHART}" -f "${CHART}/values-prod.yaml" \
  --set image.tag="${TAG}" --set ingress.host=app.example.test | grep -E '^\s+image:' | sort -u

echo "All Helm checks passed."
