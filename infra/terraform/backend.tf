# State lives in the cluster itself: Secret "tfstate-default-platform" in kube-system
# (plus a Lease used as the state lock). Only cluster admins can read it.
# Backend blocks cannot use variables: config_path must match var.kubeconfig_path.
# The Kubernetes API is reached through the SSH tunnel (scripts/tunnel.sh).
terraform {
  backend "kubernetes" {
    secret_suffix = "platform"
    namespace     = "kube-system"
    config_path   = "~/.kube/config-vps"
  }
}
