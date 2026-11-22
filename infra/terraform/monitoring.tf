# Task 12: kube-prometheus-stack (Prometheus, Alertmanager, Grafana, exporters) in the
# "monitoring" namespace (created in main.tf, Pod Security "privileged" for node-exporter).
# Only Grafana is exposed: HTTPS Ingress, Traefik Basic Auth in front, then Grafana's own login.
# Prometheus and Alertmanager are reached with kubectl port-forward.
# Docs: https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
#       https://doc.traefik.io/traefik/middlewares/http/basicauth/

locals {
  monitoring_ns   = kubernetes_namespace_v1.this["monitoring"].metadata[0].name
  grafana_host    = "grafana.${var.base_domain}"
  basic_auth_name = "grafana-basic-auth"
}

resource "kubernetes_secret_v1" "grafana_admin" {
  metadata {
    name      = "grafana-admin"
    namespace = local.monitoring_ns
  }

  data = {
    "admin-user"     = "admin"
    "admin-password" = var.grafana_admin_password
  }
}

# bcrypt() produces a new salt on every evaluation, so the hash is kept stable with
# ignore_changes and only regenerated (resource replaced) when user or password change.
resource "terraform_data" "dashboard_htpasswd" {
  input = "${var.dashboard_basic_auth_user}:${bcrypt(var.dashboard_basic_auth_password)}"

  triggers_replace = sha256("${var.dashboard_basic_auth_user}:${var.dashboard_basic_auth_password}")

  lifecycle {
    ignore_changes = [input]
  }
}

resource "kubernetes_secret_v1" "grafana_basic_auth" {
  metadata {
    name      = local.basic_auth_name
    namespace = local.monitoring_ns
  }

  data = {
    users = terraform_data.dashboard_htpasswd.output
  }
}

# The Middleware is a CRD instance (Traefik is part of k3s), so it ships as a local chart.
# Bump charts/dashboard-auth/Chart.yaml "version" whenever its templates change.
resource "helm_release" "dashboard_auth" {
  name      = "dashboard-auth"
  namespace = local.monitoring_ns
  chart     = "${path.module}/charts/dashboard-auth"

  values = [yamlencode({
    middlewareName = local.basic_auth_name
    secretName     = kubernetes_secret_v1.grafana_basic_auth.metadata[0].name
  })]
}

resource "helm_release" "kube_prometheus_stack" {
  name       = "kube-prometheus-stack"
  namespace  = local.monitoring_ns
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = var.kube_prometheus_stack_chart_version

  wait    = true
  timeout = 900

  values = [yamlencode({
    # k3s runs these inside one process and does not expose their metrics ports.
    kubeControllerManager = { enabled = false }
    kubeScheduler         = { enabled = false }
    kubeProxy             = { enabled = false }
    kubeEtcd              = { enabled = false }

    defaultRules = {
      rules = {
        etcd                   = false
        kubeControllerManager  = false
        kubeSchedulerAlerting  = false
        kubeSchedulerRecording = false
        kubeProxy              = false
      }
    }

    prometheus = {
      prometheusSpec = {
        retention      = "7d"
        retentionSize  = "4GB"
        scrapeInterval = "30s"
        resources = {
          requests = { cpu = "200m", memory = "512Mi" }
          limits   = { memory = "1Gi" }
        }
        # Pick up ServiceMonitors, PodMonitors, Probes and rules from every namespace.
        serviceMonitorSelectorNilUsesHelmValues = false
        podMonitorSelectorNilUsesHelmValues     = false
        probeSelectorNilUsesHelmValues          = false
        ruleSelectorNilUsesHelmValues           = false
        storageSpec = {
          volumeClaimTemplate = {
            spec = {
              storageClassName = "local-path"
              accessModes      = ["ReadWriteOnce"]
              resources        = { requests = { storage = "5Gi" } }
            }
          }
        }
      }
    }

    alertmanager = {
      alertmanagerSpec = {
        resources = {
          requests = { cpu = "10m", memory = "48Mi" }
          limits   = { memory = "128Mi" }
        }
      }
    }

    prometheusOperator = {
      resources = {
        requests = { cpu = "50m", memory = "64Mi" }
        limits   = { memory = "160Mi" }
      }
    }

    kube-state-metrics = {
      resources = {
        requests = { cpu = "10m", memory = "48Mi" }
        limits   = { memory = "128Mi" }
      }
    }

    prometheus-node-exporter = {
      resources = {
        requests = { cpu = "10m", memory = "24Mi" }
        limits   = { memory = "64Mi" }
      }
    }

    grafana = {
      # Dashboards come from code (ConfigMaps), the admin user is recreated from the Secret.
      persistence = { enabled = false }
      admin = {
        existingSecret = kubernetes_secret_v1.grafana_admin.metadata[0].name
        userKey        = "admin-user"
        passwordKey    = "admin-password"
      }
      resources = {
        requests = { cpu = "50m", memory = "128Mi" }
        limits   = { memory = "320Mi" }
      }
      "grafana.ini" = {
        server = { root_url = "https://${local.grafana_host}" }
      }
      ingress = {
        enabled          = true
        ingressClassName = "traefik"
        hosts            = [local.grafana_host]
        path             = "/"
        annotations = {
          "cert-manager.io/cluster-issuer"                   = "internal-ca"
          "traefik.ingress.kubernetes.io/router.middlewares" = "${local.monitoring_ns}-${local.basic_auth_name}@kubernetescrd"
        }
        tls = [{
          secretName = "grafana-tls"
          hosts      = [local.grafana_host]
        }]
      }
      sidecar = {
        resources = {
          requests = { cpu = "10m", memory = "48Mi" }
          limits   = { memory = "128Mi" }
        }
        dashboards = {
          enabled         = true
          label           = "grafana_dashboard"
          labelValue      = "1"
          searchNamespace = "ALL"
        }
        datasources = {
          enabled                  = true
          defaultDatasourceEnabled = true
        }
      }
    }
  })]

  depends_on = [
    helm_release.dashboard_auth,
    helm_release.cluster_issuers,
    kubernetes_secret_v1.grafana_admin,
  ]
}
