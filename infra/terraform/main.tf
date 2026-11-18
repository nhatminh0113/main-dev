# Platform layer of the k3s cluster (Task 9):
#   main.tf          namespaces with Pod Security Standards labels
#   rbac.tf          ServiceAccount "deployer" used by the self-hosted runner (Task 10/11)
#   cert-manager.tf  cert-manager + internal root CA, ClusterIssuers selfsigned and internal-ca
#   monitoring.tf    kube-prometheus-stack (Task 12, not yet)

locals {
  managed_labels = {
    "app.kubernetes.io/managed-by" = "terraform"
  }

  # Pod Security Standards policy version, pinned to the k3s minor version (v1.36.x).
  pss_version = "v1.36"

  # enforce: pods violating this level are rejected.
  # audit/warn: violations are only logged / returned as warnings.
  namespaces = {
    # Application environments. The taskapp chart already satisfies "restricted";
    # enforcing "baseline" (as planned) leaves room, "restricted" warnings flag regressions.
    staging = { enforce = "baseline", audit = "restricted", warn = "restricted" }
    prod    = { enforce = "baseline", audit = "restricted", warn = "restricted" }
    # kube-prometheus-stack (Task 12) runs node-exporter with hostNetwork, hostPID and
    # hostPath mounts, which "baseline" forbids.
    monitoring = { enforce = "privileged", audit = "baseline", warn = "baseline" }
    # cert-manager pods are non-root with a read-only root filesystem; the CA issuer
    # creates no solver pods.
    cert-manager = { enforce = "baseline", audit = "restricted", warn = "restricted" }
    # Holds only the deployer ServiceAccount and its token: no workloads at all.
    ci = { enforce = "restricted", audit = "restricted", warn = "restricted" }
  }
}

resource "kubernetes_namespace_v1" "this" {
  for_each = local.namespaces

  metadata {
    name = each.key
    labels = merge(local.managed_labels, {
      "pod-security.kubernetes.io/enforce"         = each.value.enforce
      "pod-security.kubernetes.io/enforce-version" = local.pss_version
      "pod-security.kubernetes.io/audit"           = each.value.audit
      "pod-security.kubernetes.io/audit-version"   = local.pss_version
      "pod-security.kubernetes.io/warn"            = each.value.warn
      "pod-security.kubernetes.io/warn-version"    = local.pss_version
    })
  }
}
