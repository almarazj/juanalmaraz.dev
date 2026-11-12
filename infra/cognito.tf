locals {
  cognito_prefix = "juanalmaraz"
  cognito_url    = "https://${local.cognito_prefix}.auth.${local.region}.amazoncognito.com"
}

resource "aws_cognito_user_pool" "admin" {
  name                = "juanalmaraz-admin"
  user_pool_tier      = "LITE"
  deletion_protection = "ACTIVE"
  mfa_configuration   = "OFF"

  # No self sign-up: the only way in is federation through Google, gated by the pre sign-up trigger.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.presignup.arn
  }
}

resource "aws_cognito_user_pool_domain" "admin" {
  domain                = local.cognito_prefix
  user_pool_id          = aws_cognito_user_pool.admin.id
  managed_login_version = 1
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.admin.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = data.aws_ssm_parameter.google_client_secret.value
    authorize_scopes = "openid email"
  }

  # The callback rejects tokens without email_verified.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_client" "admin" {
  name                                 = "juanalmaraz-site"
  user_pool_id                         = aws_cognito_user_pool.admin.id
  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]
  callback_urls                        = ["${local.site_url}/admin/api/callback"]
  logout_urls                          = ["${local.site_url}/admin/login"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
}
