# Terraform and provider versions are pinned exactly; .terraform.lock.hcl pins the checksums.
# Helm provider 3.x embeds the Helm SDK 3.20 and uses the Plugin Framework syntax:
# `kubernetes = { ... }` in the provider block (this configuration passes `values`).
terraform {
  required_version = "~> 1.16.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "3.5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "3.3.0"
    }
  }
}
