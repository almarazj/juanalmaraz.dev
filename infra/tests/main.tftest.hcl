mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  # The provider validates ARNs, so every referenced one gets a well-formed mock.
  mock_resource "aws_cloudfront_function" {
    defaults = {
      arn = "arn:aws:cloudfront::123456789012:function/mock"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn         = "arn:aws:cloudfront::123456789012:distribution/MOCK"
      domain_name = "d111111abcdef8.cloudfront.net"
    }
  }

  mock_resource "aws_cognito_user_pool" {
    defaults = {
      arn = "arn:aws:cognito-idp:us-east-2:123456789012:userpool/us-east-2_mock"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock"
    }
  }

  mock_resource "aws_dynamodb_table" {
    defaults = {
      arn = "arn:aws:dynamodb:us-east-2:123456789012:table/mock"
    }
  }

  mock_resource "aws_codeconnections_connection" {
    defaults = {
      arn = "arn:aws:codeconnections:us-east-2:123456789012:connection/mock"
    }
  }

  mock_resource "aws_codebuild_project" {
    defaults = {
      arn = "arn:aws:codebuild:us-east-2:123456789012:project/mock"
    }
  }

  mock_resource "aws_ecr_repository" {
    defaults = {
      arn = "arn:aws:ecr:us-east-2:123456789012:repository/mock"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-2:123456789012:log-group:mock"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:us-east-2:123456789012:parameter/mock"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-2:123456789012:function:mock"
    }
  }

  mock_resource "aws_lambda_function_url" {
    defaults = {
      function_url = "https://abc123.lambda-url.us-east-2.on.aws/"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/mock"
      domain_validation_options = [{
        domain_name           = "juanalmaraz.dev"
        resource_record_name  = "_abc.juanalmaraz.dev."
        resource_record_type  = "CNAME"
        resource_record_value = "_def.acm-validations.aws."
      }]
    }
  }
}

# The budget already exists and is imported; mocks cannot import.
override_resource {
  target = aws_budgets_budget.monthly
}

mock_provider "cloudflare" {}

variables {
  admin_email        = "owner@example.com"
  budget_alert_email = "owner@example.com"
  google_client_id   = "mock.apps.googleusercontent.com"
  cloudflare_zone_id = "0123456789abcdef0123456789abcdef"
  initial_image_tag  = "v0.0.0"
}

run "pinned_values" {
  command = apply

  assert {
    condition     = aws_lambda_function.site.architectures == tolist(["arm64"])
    error_message = "The site function must run on arm64."
  }

  assert {
    condition     = aws_lambda_function.site.memory_size == 1024 && aws_lambda_function.site.timeout == 30
    error_message = "The site function must have 1024 MB and a 30 s timeout."
  }

  assert {
    condition     = aws_lambda_function_url.site.authorization_type == "AWS_IAM" && aws_lambda_function_url.site.qualifier == "live"
    error_message = "The Function URL must use AWS_IAM on the live alias."
  }

  assert {
    condition     = aws_dynamodb_table.site.billing_mode == "PROVISIONED" && aws_dynamodb_table.site.read_capacity <= 25 && aws_dynamodb_table.site.write_capacity <= 25
    error_message = "The table must be PROVISIONED with at most 25 RCU and 25 WCU."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.media.block_public_acls,
      aws_s3_bucket_public_access_block.media.block_public_policy,
      aws_s3_bucket_public_access_block.media.ignore_public_acls,
      aws_s3_bucket_public_access_block.media.restrict_public_buckets,
    ])
    error_message = "The media bucket must block all public access."
  }

  assert {
    condition = (
      length(aws_codepipeline.release.trigger) == 1 &&
      aws_codepipeline.release.trigger[0].git_configuration[0].push[0].tags[0].includes == tolist(["v*"]) &&
      length(aws_codepipeline.release.trigger[0].git_configuration[0].push[0].branches) == 0
    )
    error_message = "The pipeline must trigger only on tags v* with no branch filter."
  }

  assert {
    condition     = jsondecode(aws_ecr_lifecycle_policy.site.policy).rules[0].selection.countNumber == 5
    error_message = "The ECR lifecycle policy must keep the last 5 images."
  }

  assert {
    condition = alltrue([
      for g in [aws_cloudwatch_log_group.site, aws_cloudwatch_log_group.probe, aws_cloudwatch_log_group.presignup, aws_cloudwatch_log_group.build] :
      g.retention_in_days == 14
    ])
    error_message = "Every log group must keep logs for 14 days."
  }

  assert {
    condition     = aws_scheduler_schedule.probe.schedule_expression == "rate(5 minutes)"
    error_message = "The probe must run every 5 minutes."
  }

  assert {
    condition     = tonumber(aws_budgets_budget.monthly.limit_amount) == 1 && aws_budgets_budget.monthly.limit_unit == "USD"
    error_message = "The budget limit must be 1 USD."
  }
}
