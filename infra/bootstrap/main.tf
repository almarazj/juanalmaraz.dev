# Applied once with local state to create the bucket that holds the main module's state.
terraform {
  required_version = ">= 1.17"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }
}

provider "aws" {
  region              = "us-east-2"
  allowed_account_ids = ["672027759414"]

  default_tags {
    tags = {
      Project   = "juanalmaraz-site"
      ManagedBy = "Terraform"
    }
  }
}

resource "aws_s3_bucket" "state" {
  bucket = "juanalmaraz-tfstate-672027759414"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
