# juanalmaraz.dev

Personal site of a backend developer: portfolio, case studies and blog, in English only.
The site is itself a backend showcase, so infra and code quality are part of the product.

## Docs

- `docs/design.md`: read before touching any UI; tokens, typography and each component's chosen behavior.
- `docs/aws-agent-rules.md`: AWS Agent Toolkit rules for the new AWS experience (project Region `us-east-2`, CLI profile `juanalmaraz`); on conflict, this file wins.
  @docs/aws-agent-rules.md

## Stack

- Astro in SSR mode (`@astrojs/node`), one service serving the public site and `/admin`.
- Hosting: Cloud Run (`us-central1`, `min-instances=0`, `max-instances=2`) behind Firebase Hosting as CDN.
- Content: Firestore (posts, projects, experience) stored as Markdown, sanitized on render.
- Images: processed on upload with `sharp` into WebP variants, stored in a public Cloud Storage bucket.
- Admin auth: Firebase Auth (Google), single allowlisted account.
- Infra: Terraform for all of GCP and Cloudflare DNS; deploys from GitHub Actions via Workload Identity Federation, no service account keys.
- Tests: Vitest for logic, Playwright for E2E, Firebase Emulator Suite for local dev and CI.

## Constraints

- Everything stays within the GCP free tier; a 1 USD budget alert is the guardrail.
  Any change that adds a billable resource or raises quotas needs explicit approval first.
- Public pages are cacheable at the CDN; reads from Firestore happen on cache miss only.
- Interactive pieces (for example Three.js) are Astro islands loaded with `client:visible`, so the rest of the site ships zero JS.

## Working in this repo

- Work directly in the main checkout, on the current branch.
- Leave every change uncommitted at the end of a task, for the owner to review.

## Git flow

- `main` holds released code; `develop` is the integration branch.
- Features branch off `develop` as `feature/<slug>` and merge back into `develop`.
- Hotfixes branch off `main` as `hotfix/<slug>` and merge into both `main` and `develop`.
- Merging `develop` into `main` is a release: bump the semver version in `package.json` and tag `vX.Y.Z`.
