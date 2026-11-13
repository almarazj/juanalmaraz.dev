locals {
  site_origin  = "site-function"
  media_origin = "media-bucket"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Function URLs reject requests whose Host is not their own.
data "aws_cloudfront_origin_request_policy" "all_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# Honors the app's Cache-Control (s-maxage, stale-while-revalidate); keyed on the path only.
resource "aws_cloudfront_cache_policy" "site" {
  name        = "juanalmaraz-site"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "juanalmaraz-site-function"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "juanalmaraz-media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "internal_404" {
  name    = "juanalmaraz-internal-404"
  runtime = "cloudfront-js-2.0"
  comment = "Internal routes are only reachable by direct Lambda invocation"
  publish = true
  code    = "function handler(event) { return { statusCode: 404, statusDescription: 'Not Found' }; }"
}

resource "aws_cloudfront_distribution" "site" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_100"
  aliases         = [var.domain]
  comment         = var.domain

  origin {
    origin_id                = local.site_origin
    domain_name              = regex("^https://([^/]+)/?$", aws_lambda_function_url.site.function_url)[0]
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    origin_id                = local.media_origin
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id         = local.site_origin
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.site.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id
  }

  ordered_cache_behavior {
    path_pattern             = "/admin/*"
    target_origin_id         = local.site_origin
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id
  }

  ordered_cache_behavior {
    path_pattern           = "/internal/*"
    target_origin_id       = local.site_origin
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.disabled.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.internal_404.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = ["/images/*", "/files/*"]

    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = local.media_origin
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
