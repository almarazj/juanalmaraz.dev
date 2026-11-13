# The Google client secret and the session key are put in SSM by hand (see README).
data "aws_ssm_parameter" "google_client_secret" {
  name = "/juanalmaraz/google-client-secret"
}

resource "aws_ssm_parameter" "cognito_client_secret" {
  name  = "/juanalmaraz/cognito-client-secret"
  type  = "SecureString"
  tier  = "Standard"
  value = aws_cognito_user_pool_client.admin.client_secret
}

locals {
  session_key_arn = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/juanalmaraz/session-key"
}
