output "namespaces" {
  description = "Namespaces managed by this configuration."
  value       = sort(keys(kubernetes_namespace_v1.this))
}

output "cluster_issuers" {
  description = "ClusterIssuer names for the cert-manager.io/cluster-issuer Ingress annotation."
  value       = local.cluster_issuer_names
}

# Public root CA certificate (no private key) to install on Windows and the VM:
#   terraform output -raw root_ca_certificate > "/mnt/d/ĐỒ ÁN II/kiro-tmp/taskapp-ca.crt"
output "root_ca_certificate" {
  description = "PEM of the internal root CA (public certificate only) to install on Windows and the VM."
  value       = nonsensitive(data.kubernetes_secret_v1.root_ca.data["tls.crt"])

  precondition {
    condition = (
      strcontains(nonsensitive(data.kubernetes_secret_v1.root_ca.data["tls.crt"]), "BEGIN CERTIFICATE")
      && !strcontains(nonsensitive(data.kubernetes_secret_v1.root_ca.data["tls.crt"]), "PRIVATE KEY")
    )
    error_message = "tls.crt of the root CA Secret must be a certificate and must not contain a private key."
  }
}

# Kubeconfig of the deployer ServiceAccount for the self-hosted runner (Task 10):
#   terraform output -raw deployer_kubeconfig
# The server is the loopback address because the runner runs on the VM itself.
output "deployer_kubeconfig" {
  description = "Kubeconfig for ServiceAccount ci/deployer (rights in staging and prod only)."
  sensitive   = true
  value = yamlencode({
    apiVersion = "v1"
    kind       = "Config"
    clusters = [{
      name = "k3s"
      cluster = {
        server                     = var.deployer_api_server
        certificate-authority-data = base64encode(kubernetes_secret_v1.deployer_token.data["ca.crt"])
      }
    }]
    users = [{
      name = "deployer"
      user = {
        token = kubernetes_secret_v1.deployer_token.data["token"]
      }
    }]
    contexts = [{
      name = "deployer@k3s"
      context = {
        cluster   = "k3s"
        user      = "deployer"
        namespace = "staging"
      }
    }]
    current-context = "deployer@k3s"
  })
}
