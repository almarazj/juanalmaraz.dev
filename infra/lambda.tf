resource "aws_cloudwatch_log_group" "site" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "site" {
  function_name = local.name
  role          = aws_iam_role.site.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.site.repository_url}:${var.initial_image_tag}"
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 30
  publish       = true
  # Reserving 2 needs an account concurrency limit of at least 12 (Lambda keeps 10 unreserved);
  # new accounts often start at 10, so the owner sets this after checking get-account-settings.
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      ADMIN_EMAIL          = var.admin_email
      SITE_URL             = local.site_url
      TABLE_NAME           = aws_dynamodb_table.site.name
      MEDIA_BUCKET         = aws_s3_bucket.media.bucket
      COGNITO_DOMAIN       = local.cognito_url
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.admin.id
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.admin.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.site, aws_iam_role_policy.site]

  lifecycle {
    # Releases push new images through the pipeline.
    ignore_changes = [image_uri]
  }
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.site.function_name
  function_version = aws_lambda_function.site.version

  lifecycle {
    # Releases and rollbacks move the alias through the pipeline.
    ignore_changes = [function_version]
  }
}

resource "aws_lambda_function_url" "site" {
  function_name      = aws_lambda_function.site.function_name
  qualifier          = aws_lambda_alias.live.name
  authorization_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.site.function_name
  qualifier              = aws_lambda_alias.live.name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

# The CloudFront OAC docs require lambda:InvokeFunction alongside InvokeFunctionUrl.
resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id             = "AllowCloudFrontInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.site.function_name
  qualifier                = aws_lambda_alias.live.name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.site.arn
  invoked_via_function_url = true
}

data "archive_file" "probe" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/probe"
  output_path = "${path.module}/build/probe.zip"
}

resource "aws_cloudwatch_log_group" "probe" {
  name              = "/aws/lambda/juanalmaraz-probe"
  retention_in_days = 14
}

resource "aws_lambda_function" "probe" {
  function_name    = "juanalmaraz-probe"
  role             = aws_iam_role.probe.arn
  filename         = data.archive_file.probe.output_path
  source_code_hash = data.archive_file.probe.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  memory_size      = 128
  timeout          = 10

  environment {
    variables = {
      SITE_URL   = local.site_url
      TABLE_NAME = aws_dynamodb_table.site.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.probe, aws_iam_role_policy.probe]
}

data "archive_file" "presignup" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/presignup"
  output_path = "${path.module}/build/presignup.zip"
}

resource "aws_cloudwatch_log_group" "presignup" {
  name              = "/aws/lambda/juanalmaraz-presignup"
  retention_in_days = 14
}

resource "aws_lambda_function" "presignup" {
  function_name    = "juanalmaraz-presignup"
  role             = aws_iam_role.presignup.arn
  filename         = data.archive_file.presignup.output_path
  source_code_hash = data.archive_file.presignup.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  memory_size      = 128
  timeout          = 5

  environment {
    variables = {
      ADMIN_EMAIL = var.admin_email
    }
  }

  depends_on = [aws_cloudwatch_log_group.presignup, aws_iam_role_policy.presignup]
}

resource "aws_lambda_permission" "cognito_presignup" {
  statement_id  = "AllowCognitoPreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presignup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.admin.arn
}
