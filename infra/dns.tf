locals {
  # The certificate covers only the apex, so it has exactly one validation record.
  cert_validation = one(aws_acm_certificate.site.domain_validation_options)
}

resource "cloudflare_dns_record" "validation" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(local.cert_validation.resource_record_name, ".")
  type    = local.cert_validation.resource_record_type
  content = trimsuffix(local.cert_validation.resource_record_value, ".")
  ttl     = 1
  proxied = false
}

# Cloudflare flattens the apex CNAME; DNS only, so CloudFront terminates TLS.
resource "cloudflare_dns_record" "site" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.site.domain_name
  ttl     = 1
  proxied = false
}
