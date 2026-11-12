variable "admin_email" {
  description = "The one Google account allowed into /admin; also the pre sign-up allowlist."
  type        = string
}

variable "budget_alert_email" {
  description = "Recipient of the monthly-1usd budget alerts, as already configured on the existing budget."
  type        = string
}

variable "cf_beacon_token" {
  description = "Cloudflare Web Analytics token baked into the image as PUBLIC_CF_BEACON; empty disables the beacon."
  type        = string
  default     = ""
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone id of the domain."
  type        = string
}

variable "domain" {
  description = "Public domain of the site."
  type        = string
  default     = "juanalmaraz.dev"
}

variable "github_repo" {
  description = "GitHub repository the release pipeline builds, as owner/name."
  type        = string
  default     = "almarazj/juanalmaraz.dev"
}

variable "google_client_id" {
  description = "OAuth client id of the Google client Cognito federates to."
  type        = string
}

variable "initial_image_tag" {
  description = "ECR tag the site function is created with on first apply; later deploys change the image outside Terraform."
  type        = string
}

variable "reserved_concurrency" {
  description = "Reserved concurrency of the site function; -1 leaves it unreserved (see README)."
  type        = number
  default     = -1
}
