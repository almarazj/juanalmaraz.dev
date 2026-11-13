provider "aws" {
  region              = "us-east-2"
  allowed_account_ids = ["672027759414"]

  default_tags {
    tags = local.tags
  }
}

# CloudFront only accepts certificates from us-east-1; nothing else uses this alias.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = ["672027759414"]

  default_tags {
    tags = local.tags
  }
}

# Reads CLOUDFLARE_API_TOKEN from the environment.
provider "cloudflare" {}
