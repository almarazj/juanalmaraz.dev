# Created PENDING; the owner finishes the GitHub App handshake in the console (see README).
resource "aws_codeconnections_connection" "github" {
  name          = "juanalmaraz-github"
  provider_type = "GitHub"
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "juanalmaraz-pipeline-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_cloudwatch_log_group" "build" {
  name              = "/aws/codebuild/juanalmaraz-release"
  retention_in_days = 14
}

resource "aws_codebuild_project" "release" {
  name          = "juanalmaraz-release"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 60

  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec.yml"
  }

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    type            = "ARM_CONTAINER"
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/amazonlinux-aarch64-standard:3.0"
    privileged_mode = true

    environment_variable {
      name  = "ECR_REPOSITORY_URL"
      value = aws_ecr_repository.site.repository_url
    }
    environment_variable {
      name  = "FUNCTION_NAME"
      value = aws_lambda_function.site.function_name
    }
    environment_variable {
      name  = "DISTRIBUTION_ID"
      value = aws_cloudfront_distribution.site.id
    }
    environment_variable {
      name  = "FUNCTION_URL"
      value = aws_lambda_function_url.site.function_url
    }
    environment_variable {
      name  = "PUBLIC_CF_BEACON"
      value = var.cf_beacon_token
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.build.name
    }
  }
}

resource "aws_codepipeline" "release" {
  name          = "juanalmaraz-release"
  pipeline_type = "V2"
  role_arn      = aws_iam_role.codepipeline.arn

  artifact_store {
    type     = "S3"
    location = aws_s3_bucket.artifacts.bucket
  }

  # CodePipeline rejects an empty default, so "none" stands for "no override".
  variable {
    name          = "EXPECTED_VERSION_OVERRIDE"
    default_value = "none"
    description   = "Version the deployed checks expect instead of the tag's; none means use the tag"
  }

  # Replaces the default push-to-branch trigger: only pushed v* tags start a release.
  trigger {
    provider_type = "CodeStarSourceConnection"

    git_configuration {
      source_action_name = "Source"

      push {
        tags {
          includes = ["v*"]
        }
      }
    }
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      namespace        = "SourceVariables"
      output_artifacts = ["source"]

      configuration = {
        ConnectionArn        = aws_codeconnections_connection.github.arn
        FullRepositoryId     = var.github_repo
        BranchName           = "main"
        OutputArtifactFormat = "CODEBUILD_CLONE_REF"
      }
    }
  }

  stage {
    name = "Release"

    action {
      name            = "Release"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source"]

      configuration = {
        ProjectName = aws_codebuild_project.release.name
        EnvironmentVariables = jsonencode([
          { name = "RELEASE_TAG", value = "#{SourceVariables.TagName}", type = "PLAINTEXT" },
          { name = "EXPECTED_VERSION_OVERRIDE", value = "#{variables.EXPECTED_VERSION_OVERRIDE}", type = "PLAINTEXT" },
        ])
      }
    }
  }
}
