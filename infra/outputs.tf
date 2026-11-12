output "bucket_name" {
  description = "Media bucket."
  value       = aws_s3_bucket.media.bucket
}

output "cognito_client_id" {
  description = "Cognito app client id."
  value       = aws_cognito_user_pool_client.admin.id
}

output "cognito_domain" {
  description = "Cognito prefix domain; Google's redirect URI is this plus /oauth2/idpresponse."
  value       = local.cognito_url
}

output "connection_arn" {
  description = "CodeConnections connection whose GitHub handshake the owner finishes."
  value       = aws_codeconnections_connection.github.arn
}

output "distribution_domain" {
  description = "CloudFront domain the apex record points at."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "distribution_id" {
  description = "CloudFront distribution id."
  value       = aws_cloudfront_distribution.site.id
}

output "ecr_repository_url" {
  description = "ECR repository the site image is pushed to."
  value       = aws_ecr_repository.site.repository_url
}

output "function_name" {
  description = "Site function name."
  value       = aws_lambda_function.site.function_name
}

output "function_url" {
  description = "Raw Function URL on the live alias; answers 403 to anything but CloudFront."
  value       = aws_lambda_function_url.site.function_url
}

output "pipeline_name" {
  description = "Release pipeline name."
  value       = aws_codepipeline.release.name
}

output "table_name" {
  description = "DynamoDB table name."
  value       = aws_dynamodb_table.site.name
}

output "user_pool_id" {
  description = "Cognito user pool id."
  value       = aws_cognito_user_pool.admin.id
}
