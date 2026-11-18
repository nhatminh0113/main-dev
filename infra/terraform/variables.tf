variable "base_domain" {
  description = "Local domain resolved through the hosts files, e.g. taskapp.internal. Apps use staging./app./grafana.<base_domain>; the root CA is name-constrained to it."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.base_domain))
    error_message = "base_domain must be a lowercase DNS name such as taskapp.internal (no scheme, no trailing dot)."
  }
}

variable "kubeconfig_path" {
  description = "Admin kubeconfig used by the providers and kubectl (server https://127.0.0.1:6443 through the SSH tunnel). Must match backend.tf."
  type        = string
  default     = "~/.kube/config-vps"
}

variable "cert_manager_chart_version" {
  description = "cert-manager Helm chart version (oci://quay.io/jetstack/charts/cert-manager)."
  type        = string
  default     = "v1.21.3"
}

variable "deployer_api_server" {
  description = "API server URL written into the deployer kubeconfig. The self-hosted runner runs on the VM itself, so the loopback address (covered by the k3s certificate) is correct."
  type        = string
  default     = "https://127.0.0.1:6443"
}
