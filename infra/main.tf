locals {
  name       = "juanalmaraz-site"
  site_url   = "https://${var.domain}"
  account_id = data.aws_caller_identity.current.account_id
  region     = "us-east-2"

  tags = {
    Project   = "juanalmaraz-site"
    ManagedBy = "Terraform"
  }
}

data "aws_caller_identity" "current" {}
