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

variable "kube_prometheus_stack_chart_version" {
  description = "kube-prometheus-stack Helm chart version (https://prometheus-community.github.io/helm-charts)."
  type        = string
  default     = "93.3.1"
}

variable "grafana_admin_password" {
  description = "Password of the Grafana admin user (stored in a Kubernetes Secret, not in Helm values)."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.grafana_admin_password) >= 12
    error_message = "grafana_admin_password must be at least 12 characters."
  }
}

variable "dashboard_basic_auth_user" {
  description = "User name of the Traefik Basic Auth gate in front of Grafana."
  type        = string
  default     = "admin"

  validation {
    condition     = can(regex("^[a-zA-Z0-9._-]+$", var.dashboard_basic_auth_user))
    error_message = "dashboard_basic_auth_user may only contain letters, digits, dot, underscore and hyphen."
  }
}

variable "dashboard_basic_auth_password" {
  description = "Password of the Traefik Basic Auth gate in front of Grafana (hashed with bcrypt before it is stored)."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.dashboard_basic_auth_password) >= 12
    error_message = "dashboard_basic_auth_password must be at least 12 characters."
  }
}

variable "deployer_api_server" {
  description = "API server URL written into the deployer kubeconfig. The self-hosted runner runs on the VM itself, so the loopback address (covered by the k3s certificate) is correct."
  type        = string
  default     = "https://127.0.0.1:6443"
}
