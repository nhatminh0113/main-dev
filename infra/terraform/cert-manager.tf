# HTTPS: cert-manager + an internal CA. The VM has no public IP and no real domain, so
# Let's Encrypt cannot be used: a self-signed root CA (charts/cluster-issuers) signs the
# Ingress certificates through ClusterIssuer "internal-ca". The root certificate is
# installed on the dev laptop (Windows) and on the VM (Ansible role ca_trust).
# Docs: https://cert-manager.io/docs/installation/helm/
#       https://cert-manager.io/docs/configuration/ca/
#       https://cert-manager.io/docs/configuration/selfsigned/

locals {
  # Must match infra/ansible/roles/ca_trust/defaults/main.yml.
  root_ca_name         = "taskapp-root-ca"
  cluster_issuer_names = ["selfsigned", "internal-ca"]

  cluster_issuers_values = yamlencode({
    selfSignedIssuer = local.cluster_issuer_names[0]
    caIssuer         = local.cluster_issuer_names[1]
    rootCA = {
      name                = local.root_ca_name
      permittedDNSDomains = [var.base_domain]
    }
  })
}

resource "helm_release" "cert_manager" {
  name       = "cert-manager"
  namespace  = kubernetes_namespace_v1.this["cert-manager"].metadata[0].name
  repository = "oci://quay.io/jetstack/charts"
  chart      = "cert-manager"
  version    = var.cert_manager_chart_version

  # Webhook must be ready before the ClusterIssuers are applied.
  wait    = true
  timeout = 600

  values = [yamlencode({
    crds = {
      # Install the CRDs with the chart and keep them on uninstall (no accidental data loss).
      enabled = true
      keep    = true
    }
    # Modest requests for the 8 GB single-node VM.
    resources = {
      requests = { cpu = "10m", memory = "48Mi" }
      limits   = { memory = "128Mi" }
    }
    webhook = {
      resources = {
        requests = { cpu = "10m", memory = "24Mi" }
        limits   = { memory = "64Mi" }
      }
    }
    cainjector = {
      resources = {
        requests = { cpu = "10m", memory = "48Mi" }
        limits   = { memory = "128Mi" }
      }
    }
    startupapicheck = {
      resources = {
        requests = { cpu = "10m", memory = "32Mi" }
        limits   = { memory = "64Mi" }
      }
    }
  })]
}

# ClusterIssuers and the CA Certificate are CRD instances: kubernetes_manifest would need the
# CRDs to exist at plan time, so they are packaged as a local chart applied after cert-manager.
# Bump charts/cluster-issuers/Chart.yaml "version" whenever its templates change.
resource "helm_release" "cluster_issuers" {
  name      = "cluster-issuers"
  namespace = kubernetes_namespace_v1.this["cert-manager"].metadata[0].name
  chart     = "${path.module}/charts/cluster-issuers"
  values    = [local.cluster_issuers_values]

  depends_on = [helm_release.cert_manager]
}

# The Helm SDK 3.20 waiter does not wait for custom resources, so the CA Secret may not exist
# yet when helm_release returns. Needs kubectl on PATH and the SSH tunnel open. The triggers
# only change with the chart, so later plans stay at "No changes".
resource "terraform_data" "root_ca_ready" {
  triggers_replace = {
    chart_version = helm_release.cluster_issuers.version
    values        = sha256(local.cluster_issuers_values)
  }

  provisioner "local-exec" {
    command = "kubectl --kubeconfig '${pathexpand(var.kubeconfig_path)}' -n ${helm_release.cluster_issuers.namespace} wait --for=condition=Ready certificate/${local.root_ca_name} --timeout=180s"
  }
}

# The whole Secret (private key included) is stored in the in-cluster state Secret
# (kube-system, cluster admins only). Only tls.crt is output (outputs.tf).
data "kubernetes_secret_v1" "root_ca" {
  metadata {
    name      = local.root_ca_name
    namespace = helm_release.cluster_issuers.namespace
  }

  depends_on = [terraform_data.root_ca_ready]
}
