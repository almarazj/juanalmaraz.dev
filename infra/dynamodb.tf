resource "aws_dynamodb_table" "site" {
  name           = local.name
  billing_mode   = "PROVISIONED"
  read_capacity  = 25
  write_capacity = 25
  hash_key       = "pk"
  range_key      = "sk"
  # Point-in-time recovery is billed per GB, so it stays off.
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
