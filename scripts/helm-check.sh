#!/usr/bin/env bash
# Static checks for the Helm chart (run locally and in CI):
#   1. helm lint --strict with the staging and prod values
#   2. helm template | kubeconform -strict for staging, prod and an "everything enabled" render
#      (CRDs such as Traefik Middleware and ServiceMonitor are validated via the CRDs catalog)
#   3. Guard rails: rendering must fail without image.tag, with image.tag=latest or without a host
#   4. Worker assertions: hardened worker Deployment, Service, ServiceMonitor and the
#      NetworkPolicy flows (worker -> postgres, monitoring -> worker:9000), worker.enabled=false
#   4b. Monitoring: ServiceMonitors, PrometheusRule (BackendDown/absent, HighErrorRate, WorkerDown),
#      dashboard ConfigMap only in staging, dashboard JSON sanity (promtool is optional)
#   5. TLS: Ingress issuer internal-ca, no ACME solver policy; lint + kubeconform of the local
#      cluster-issuers chart (infra/terraform/charts/cluster-issuers) and its domain guard
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
  host="${env}.taskapp.internal"
  echo "==> ${env}: helm lint"
  helm lint --strict "${CHART}" -f "${CHART}/values-${env}.yaml" \
    --set image.tag="${TAG}" --set ingress.host="${host}"

  echo "==> ${env}: kubeconform (as deployed, plus monitoring + network policies, plus no worker)"
  for extra in "" \
    "--set serviceMonitor.enabled=true --set networkPolicy.enabled=true --set basicAuth.enabled=true" \
    "--set worker.enabled=false --set serviceMonitor.enabled=true --set networkPolicy.enabled=true"; do
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

echo "==> worker assertions"
# Print the rendered document (between --- separators) with this kind and metadata.name.
# Comment lines are dropped so assertions only match real fields.
render_doc() {
  awk -v kind="$1" -v name="$2" '
    function flush() {
      if (doc ~ ("\nkind: " kind "\n") && doc ~ ("\n  name: " name "\n")) printf "%s", doc
      doc = "\n"
    }
    BEGIN { doc = "\n" }
    /^---/ { flush(); next }
    /^[[:space:]]*#/ { next }
    { doc = doc $0 "\n" }
    END { flush() }
  '
}
# expect_in <description> <document> <fixed string>...: every string must appear.
expect_in() {
  local what="$1" doc="$2" needle
  shift 2
  if [ -z "${doc//[[:space:]]/}" ]; then
    echo "FAIL: ${what}: document not rendered" >&2
    exit 1
  fi
  for needle in "$@"; do
    if ! grep -qF -- "${needle}" <<<"${doc}"; then
      echo "FAIL: ${what}: missing '${needle}'" >&2
      exit 1
    fi
  done
  echo "ok: ${what}"
}
# expect_not_in <description> <text> <fixed string>: the string must not appear.
expect_not_in() {
  if grep -qF -- "$3" <<<"$2"; then
    echo "FAIL: $1: unexpected '$3'" >&2
    exit 1
  fi
  echo "ok: $1"
}

full="$(helm template taskapp "${CHART}" -n prod -f "${CHART}/values-prod.yaml" \
  --set image.tag="${TAG}" --set ingress.host=app.example.test \
  --set serviceMonitor.enabled=true --set networkPolicy.enabled=true)"

worker_deploy="$(render_doc Deployment taskapp-worker <<<"${full}")"
expect_in "worker Deployment is hardened and runs app.worker from the backend image" \
  "${worker_deploy}" \
  "readOnlyRootFilesystem: true" "runAsNonRoot: true" "automountServiceAccountToken: false" \
  'command: ["python", "-m", "app.worker"]' "image: ghcr.io/nhatminh0113/taskapp-backend:${TAG}" \
  "terminationGracePeriodSeconds: 60" "path: /healthz" "path: /readyz" "name: LOG_FORMAT"
expect_not_in "worker Deployment never runs migrations" "${worker_deploy}" "RUN_MIGRATIONS"
expect_not_in "worker Deployment mounts no volumes" "${worker_deploy}" "volumeMounts"
expect_in "worker Service exposes port 9000" \
  "$(render_doc Service taskapp-worker <<<"${full}")" "port: 9000" "targetPort: metrics"
expect_in "worker ServiceMonitor scrapes /metrics on port metrics" \
  "$(render_doc ServiceMonitor taskapp-worker <<<"${full}")" "port: metrics" "path: /metrics"
expect_in "backend Deployment gets the logging env" \
  "$(render_doc Deployment taskapp-backend <<<"${full}")" "name: LOG_FORMAT" "name: LOG_LEVEL" \
  "name: RUN_MIGRATIONS"
expect_in "NetworkPolicy allow-app-to-postgres admits backend and worker on 5432" \
  "$(render_doc NetworkPolicy taskapp-allow-app-to-postgres <<<"${full}")" \
  "values: [backend, worker]" "port: 5432"
expect_in "NetworkPolicy allow-monitoring admits backend:8000 and worker:9000" \
  "$(render_doc NetworkPolicy taskapp-allow-monitoring <<<"${full}")" \
  "values: [backend, worker]" "port: 8000" "port: 9000"
expect_not_in "NetworkPolicy allow-ingress-controller does not admit the worker" \
  "$(render_doc NetworkPolicy taskapp-allow-ingress-controller <<<"${full}")" "worker"
expect_not_in "old policy allow-backend-to-postgres is gone (renamed)" "${full}" \
  "name: taskapp-allow-backend-to-postgres"
expect_not_in "no ACME HTTP-01 solver NetworkPolicy (internal CA)" "${full}" "allow-acme-solver"

for env in staging prod; do
  expect_in "${env} Ingress uses ClusterIssuer internal-ca" \
    "$(helm template taskapp "${CHART}" -n "${env}" -f "${CHART}/values-${env}.yaml" \
      --set image.tag="${TAG}" --set ingress.host="${env}.taskapp.internal" \
      | render_doc Ingress taskapp)" \
    'cert-manager.io/cluster-issuer: "internal-ca"'
  # Basic Auth is off in both environments (the chart keeps the feature, see the variant above).
  plain="$(helm template taskapp "${CHART}" -n "${env}" -f "${CHART}/values-${env}.yaml" \
    --set image.tag="${TAG}" --set ingress.host="${env}.taskapp.internal")"
  expect_not_in "${env} renders no Basic Auth Middleware" "${plain}" "kind: Middleware"
  expect_not_in "${env} Ingress has no middleware annotation" "${plain}" "router.middlewares"
done

no_worker="$(helm template taskapp "${CHART}" -n prod -f "${CHART}/values-prod.yaml" \
  --set image.tag="${TAG}" --set ingress.host=app.example.test \
  --set serviceMonitor.enabled=true --set worker.enabled=false)"
expect_not_in "worker.enabled=false renders no worker objects" "${no_worker}" "name: taskapp-worker"
expect_in "worker.enabled=false keeps the backend ServiceMonitor" \
  "$(render_doc ServiceMonitor taskapp-backend <<<"${no_worker}")" "port: http"

echo "==> monitoring assertions (PrometheusRule, Grafana dashboard)"
for env in staging prod; do
  rendered="$(helm template taskapp "${CHART}" -n "${env}" -f "${CHART}/values-${env}.yaml" \
    --set image.tag="${TAG}" --set ingress.host="${env}.taskapp.internal")"
  expect_in "${env} backend ServiceMonitor is rendered" \
    "$(render_doc ServiceMonitor taskapp-backend <<<"${rendered}")" "port: http" "path: /metrics"
  expect_in "${env} worker ServiceMonitor is rendered" \
    "$(render_doc ServiceMonitor taskapp-worker <<<"${rendered}")" "port: metrics" "path: /metrics"
  rules="$(render_doc PrometheusRule taskapp <<<"${rendered}")"
  # shellcheck disable=SC2016  # the PromQL template text is matched literally
  expect_in "${env} PrometheusRule has BackendDown (with absent), HighErrorRate and WorkerDown" \
    "${rules}" \
    "alert: BackendDown" "alert: HighErrorRate" "alert: WorkerDown" \
    "absent(up{namespace=\"${env}\", job=\"taskapp-backend\"})" \
    "absent(up{namespace=\"${env}\", job=\"taskapp-worker\"})" \
    "for: 2m" 'status="5xx"' "namespace: \"${env}\"" 'job: "taskapp-backend"' \
    '{{ $value | humanizePercentage }}'
  other="staging"; [ "${env}" = "staging" ] && other="prod"
  expect_not_in "${env} PrometheusRule never mentions the ${other} namespace" "${rules}" "namespace=\"${other}\""
  # Optional: promtool validates the rule expressions when promtool and PyYAML are installed.
  if command -v promtool >/dev/null 2>&1 && python3 -c 'import yaml' 2>/dev/null; then
    tmp_rules="$(mktemp --suffix=.yml)"
    python3 -c 'import sys, yaml; d = yaml.safe_load(sys.stdin); yaml.safe_dump({"groups": d["spec"]["groups"]}, open(sys.argv[1], "w"))' \
      "${tmp_rules}" <<<"${rules}"
    promtool check rules "${tmp_rules}"
    rm -f "${tmp_rules}"
  else
    echo "skip: promtool or PyYAML not installed, rule expressions are not parsed (optional)"
  fi
done
staging_render="$(helm template taskapp "${CHART}" -n staging -f "${CHART}/values-staging.yaml" \
  --set image.tag="${TAG}" --set ingress.host=staging.taskapp.internal)"
prod_render="$(helm template taskapp "${CHART}" -n prod -f "${CHART}/values-prod.yaml" \
  --set image.tag="${TAG}" --set ingress.host=app.taskapp.internal)"
expect_in "staging renders the dashboard ConfigMap for the Grafana sidecar" \
  "$(render_doc ConfigMap taskapp-grafana-dashboard <<<"${staging_render}")" \
  'grafana_dashboard: "1"' "taskapp-overview.json: |-" '"uid": "taskapp-overview"'
expect_not_in "prod renders no dashboard ConfigMap (one uid, one release)" \
  "${prod_render}" "grafana_dashboard"
no_worker_rules="$(helm template taskapp "${CHART}" -n prod -f "${CHART}/values-prod.yaml" \
  --set image.tag="${TAG}" --set ingress.host=app.example.test --set worker.enabled=false)"
expect_not_in "worker.enabled=false drops the WorkerDown alert" "${no_worker_rules}" "alert: WorkerDown"
expect_in "worker.enabled=false keeps BackendDown" "${no_worker_rules}" "alert: BackendDown"
expect_not_in "prometheusRule.enabled=false renders no rules" \
  "$(helm template taskapp "${CHART}" -n prod -f "${CHART}/values-prod.yaml" \
    --set image.tag="${TAG}" --set ingress.host=app.example.test --set prometheusRule.enabled=false)" \
  "kind: PrometheusRule"

# The dashboard file (embedded by the ConfigMap) must be valid JSON with unique panel ids,
# no overlapping panels and every query bound to the ${datasource} variable.
python3 - "${CHART}/dashboards/taskapp-overview.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
ps = d["panels"]
ids = [p["id"] for p in ps]
assert len(ids) == len(set(ids)), "duplicate panel ids"
for i, a in enumerate(ps):
    ga = a["gridPos"]
    assert ga["x"] + ga["w"] <= 24, f"panel {a['title']} exceeds the grid"
    for b in ps[i + 1:]:
        gb = b["gridPos"]
        assert not (ga["x"] < gb["x"] + gb["w"] and gb["x"] < ga["x"] + ga["w"]
                    and ga["y"] < gb["y"] + gb["h"] and gb["y"] < ga["y"] + ga["h"]), \
            f"panels overlap: {a['title']} / {b['title']}"
for p in ps:
    if p["type"] == "row":
        continue
    for t in p["targets"]:
        assert t["datasource"]["uid"] == "${datasource}", f"{p['title']}: query not on ${{datasource}}"
        assert 'namespace="$namespace"' in t["expr"], f"{p['title']}: query not filtered by namespace"
print("ok: dashboard JSON valid, %d panels, unique ids, no overlaps, queries use ${datasource}" % len(ps))
PY

echo "==> cluster-issuers chart (infra/terraform, deployed by Terraform)"
ISSUERS_CHART="infra/terraform/charts/cluster-issuers"
ISSUERS_DOMAIN="--set-json=rootCA.permittedDNSDomains=[\"taskapp.internal\"]"
helm lint --strict "${ISSUERS_CHART}" "${ISSUERS_DOMAIN}"
issuers="$(helm template cluster-issuers "${ISSUERS_CHART}" -n cert-manager "${ISSUERS_DOMAIN}")"
kubeconform_check <<<"${issuers}"
expect_in "root CA Certificate is a name-constrained CA signed by selfsigned" \
  "$(render_doc Certificate taskapp-root-ca <<<"${issuers}")" \
  "isCA: true" "namespace: cert-manager" "- taskapp.internal" "name: selfsigned" "algorithm: ECDSA"
expect_in "ClusterIssuer internal-ca uses the root CA Secret" \
  "$(render_doc ClusterIssuer internal-ca <<<"${issuers}")" "secretName: taskapp-root-ca"
if helm template cluster-issuers "${ISSUERS_CHART}" -n cert-manager >/dev/null 2>&1; then
  echo "FAIL: cluster-issuers should refuse to render without rootCA.permittedDNSDomains" >&2
  exit 1
fi
echo "ok: cluster-issuers refuses to render without rootCA.permittedDNSDomains"

echo "==> rendered image references"
helm template taskapp "${CHART}" -f "${CHART}/values-prod.yaml" \
  --set image.tag="${TAG}" --set ingress.host=app.example.test | grep -E '^\s+image:' | sort -u

echo "All Helm checks passed."
