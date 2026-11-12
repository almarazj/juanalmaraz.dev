data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Site function

resource "aws_iam_role" "site" {
  name               = "juanalmaraz-site"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.site.arn}:*"]
  }

  statement {
    sid = "Table"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [aws_dynamodb_table.site.arn]
  }

  # Without ListBucket a missing object reads as 403 instead of 404, and HeadBucket backs the status check.
  statement {
    sid       = "MediaList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
  }

  statement {
    sid       = "MediaRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/incoming/*", "${aws_s3_bucket.media.arn}/files/*"]
  }

  # incoming/ is written by the browser with a POST presigned by this role.
  statement {
    sid     = "MediaWrite"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.media.arn}/incoming/*",
      "${aws_s3_bucket.media.arn}/images/*",
      "${aws_s3_bucket.media.arn}/files/*",
    ]
  }

  statement {
    sid       = "MediaDiscardOriginals"
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.media.arn}/incoming/*"]
  }

  statement {
    sid       = "Secrets"
    actions   = ["ssm:GetParameter"]
    resources = [local.session_key_arn, aws_ssm_parameter.cognito_client_secret.arn]
  }
}

resource "aws_iam_role_policy" "site" {
  name   = "site"
  role   = aws_iam_role.site.id
  policy = data.aws_iam_policy_document.site.json
}

# Uptime probe

resource "aws_iam_role" "probe" {
  name               = "juanalmaraz-probe"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "probe" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.probe.arn}:*"]
  }

  statement {
    sid       = "UptimeItemsOnly"
    actions   = ["dynamodb:UpdateItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.site.arn]

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["uptime"]
    }
  }
}

resource "aws_iam_role_policy" "probe" {
  name   = "probe"
  role   = aws_iam_role.probe.id
  policy = data.aws_iam_policy_document.probe.json
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "juanalmaraz-probe-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.probe.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "invoke-probe"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

# Pre sign-up trigger: logs only.

resource "aws_iam_role" "presignup" {
  name               = "juanalmaraz-presignup"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "presignup" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.presignup.arn}:*"]
  }
}

resource "aws_iam_role_policy" "presignup" {
  name   = "presignup"
  role   = aws_iam_role.presignup.id
  policy = data.aws_iam_policy_document.presignup.json
}

# Release build

data "aws_iam_policy_document" "codebuild_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  name               = "juanalmaraz-release-build"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume.json
}

data "aws_iam_policy_document" "codebuild" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.build.arn}:*"]
  }

  statement {
    sid       = "SourceArtifact"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }

  # The full-clone source fetches the repository through the connection.
  statement {
    sid       = "Connection"
    actions   = ["codeconnections:UseConnection", "codestar-connections:UseConnection"]
    resources = [aws_codeconnections_connection.github.arn]
  }

  # GetAuthorizationToken has no resource-level scoping.
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.site.arn]
  }

  statement {
    sid = "Deploy"
    actions = [
      "lambda:GetAlias",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:PublishVersion",
      "lambda:UpdateAlias",
      "lambda:UpdateFunctionCode",
    ]
    resources = [aws_lambda_function.site.arn, "${aws_lambda_function.site.arn}:*"]
  }

  statement {
    sid       = "Invalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  name   = "release-build"
  role   = aws_iam_role.codebuild.id
  policy = data.aws_iam_policy_document.codebuild.json
}

# Release pipeline

data "aws_iam_policy_document" "codepipeline_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codepipeline.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "codepipeline" {
  name               = "juanalmaraz-release-pipeline"
  assume_role_policy = data.aws_iam_policy_document.codepipeline_assume.json
}

data "aws_iam_policy_document" "codepipeline" {
  statement {
    sid       = "Connection"
    actions   = ["codeconnections:UseConnection", "codestar-connections:UseConnection"]
    resources = [aws_codeconnections_connection.github.arn]
  }

  statement {
    sid       = "Build"
    actions   = ["codebuild:StartBuild", "codebuild:BatchGetBuilds"]
    resources = [aws_codebuild_project.release.arn]
  }

  statement {
    sid       = "ArtifactObjects"
    actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }

  statement {
    sid       = "ArtifactBucket"
    actions   = ["s3:GetBucketLocation", "s3:GetBucketVersioning"]
    resources = [aws_s3_bucket.artifacts.arn]
  }
}

resource "aws_iam_role_policy" "codepipeline" {
  name   = "release-pipeline"
  role   = aws_iam_role.codepipeline.id
  policy = data.aws_iam_policy_document.codepipeline.json
}
