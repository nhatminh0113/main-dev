# Identity of the self-hosted GitHub runner (Task 10/11).
# The ServiceAccount lives in its own namespace "ci" and gets namespaced Roles in staging and
# prod only: no ClusterRole, no wildcard, no rights in ci, kube-system, cert-manager or
# monitoring (so it cannot read its own token or the Terraform state Secret).

locals {
  deploy_namespaces = toset(["staging", "prod"])

  manage = ["get", "list", "watch", "create", "update", "patch", "delete"]
  read   = ["get", "list", "watch"]

  # Every kind the taskapp chart renders (helm/taskapp/templates), plus what Helm 4 and the
  # pipeline need. Helm stores release history as Secrets in the release namespace and its
  # --wait (kstatus watcher) lists and watches each kind it manages.
  deployer_rules = [
    {
      # secrets: Helm release records, taskapp-db and taskapp-basic-auth (created by the pipeline)
      # configmaps: Grafana dashboard ConfigMap (Task 12)
      # persistentvolumeclaims: PostgreSQL volumeClaimTemplates
      api_groups = [""]
      resources  = ["secrets", "configmaps", "services", "persistentvolumeclaims"]
      verbs      = local.manage
    },
    {
      # Troubleshooting and rollout status only: the runner never creates or execs into pods.
      api_groups = [""]
      resources  = ["pods", "pods/log", "events"]
      verbs      = local.read
    },
    {
      api_groups = ["events.k8s.io"]
      resources  = ["events"]
      verbs      = local.read
    },
    {
      api_groups = ["apps"]
      resources  = ["deployments", "statefulsets"]
      verbs      = local.manage
    },
    {
      # Read-only: `kubectl rollout status` and the legacy Helm waiter inspect ReplicaSets.
      api_groups = ["apps"]
      resources  = ["replicasets"]
      verbs      = local.read
    },
    {
      api_groups = ["networking.k8s.io"]
      resources  = ["ingresses", "networkpolicies"]
      verbs      = local.manage
    },
    {
      # ServiceMonitor (chart, Task 12) and PrometheusRule (alerts, Task 12)
      api_groups = ["monitoring.coreos.com"]
      resources  = ["servicemonitors", "prometheusrules"]
      verbs      = local.manage
    },
    {
      # Basic Auth Middleware (decision log 2026-10-17)
      api_groups = ["traefik.io"]
      resources  = ["middlewares"]
      verbs      = local.manage
    },
  ]
}

resource "kubernetes_service_account_v1" "deployer" {
  metadata {
    name      = "deployer"
    namespace = kubernetes_namespace_v1.this["ci"].metadata[0].name
    labels    = local.managed_labels
  }

  # Nothing runs as this ServiceAccount inside the cluster; the token is used from outside.
  automount_service_account_token = false
}

# Long-lived token for the runner kubeconfig (Kubernetes no longer creates one automatically).
# Rotate: terraform apply -replace=kubernetes_secret_v1.deployer_token, then redeploy the
# kubeconfig to the runner (Task 10).
resource "kubernetes_secret_v1" "deployer_token" {
  metadata {
    name      = "deployer-token"
    namespace = kubernetes_service_account_v1.deployer.metadata[0].namespace
    labels    = local.managed_labels
    annotations = {
      "kubernetes.io/service-account.name" = kubernetes_service_account_v1.deployer.metadata[0].name
    }
  }

  type                           = "kubernetes.io/service-account-token"
  wait_for_service_account_token = true
}

resource "kubernetes_role_v1" "deployer" {
  for_each = local.deploy_namespaces

  metadata {
    name      = "deployer"
    namespace = kubernetes_namespace_v1.this[each.key].metadata[0].name
    labels    = local.managed_labels
  }

  dynamic "rule" {
    for_each = local.deployer_rules
    content {
      api_groups = rule.value.api_groups
      resources  = rule.value.resources
      verbs      = rule.value.verbs
    }
  }
}

resource "kubernetes_role_binding_v1" "deployer" {
  for_each = local.deploy_namespaces

  metadata {
    name      = "deployer"
    namespace = kubernetes_role_v1.deployer[each.key].metadata[0].namespace
    labels    = local.managed_labels
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.deployer[each.key].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account_v1.deployer.metadata[0].name
    namespace = kubernetes_service_account_v1.deployer.metadata[0].namespace
  }
}
