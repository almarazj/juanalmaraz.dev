# AWS migration design

Date: 2026-11-12.
Branch: `feature/aws-migration`.
Supersedes the GCP parts of `docs/plan.md` (Global Constraints, Data Model, Tasks 13 and 14) and the Google-dependent pieces of Tasks 3, 8, 9, 10 and 11.

## Intent

The owner is moving juanalmaraz.dev from Google Cloud to AWS to gain hands-on AWS experience.
The site is itself a backend showcase, so the AWS version has to be idiomatic AWS, not a GCP design wearing AWS names.
Everything visitors see today stays the same, except the feed's cache column, which becomes a cold/warm column.

## Goals

- Run the whole product on AWS: compute, content store, media, admin auth, status, CI/CD and infra as code.
- Stay effectively free: the AWS always-free tier, plus the account credits (about 100 USD until 2027-05-12) for the few cents ECR and S3 cost.
- Keep the public interfaces of `src/lib/**` where possible, so pages and components barely change.
- Deploy only when a release tag `v*` is pushed, never on a branch push.
- Keep local development and CI fully offline-capable, with no cloud account needed to run tests.

## Non-goals

- No visual redesign.
  The only UI change is HIT/MISS becoming cold/warm in the terminal feed.
- No multi-Region setup, no staging environment, no blue/green deploys.
- No data migration from Firestore: the site has not launched, so content is entered fresh in `/admin` (Task 15).

## Anti-goals

- Any resource with a standing hourly or monthly charge beyond cents (Kinesis, NAT Gateway, App Runner, Fargate, Secrets Manager, CloudWatch Synthetics canaries, Route 53 hosted zones).
- Long-lived AWS access keys anywhere: the owner uses `aws login`, and CI must not hold static keys.
- A feed or status that lies: every value shown must be measured, not inferred.

## Constraints

- AWS account: a "new AWS experience" project, account `672027759414`, FREE plan, assigned Region `us-east-2`.
  Regional resources MUST be in `us-east-2`.
  The project SCPs also allow `acm:*` and `cloudfront:*` in `us-east-1`, which is where CloudFront's certificate goes; see `docs/aws-agent-rules.md`.
- Lambda@Edge, global tables, cross-Region replication and exportable ACM certificates are not available on this account type.
- The project SCPs deny `iam:*Provider*`, so an IAM OIDC identity provider for GitHub Actions cannot be created on this plan; deploys run in CodePipeline instead (see "CI/CD").
- Local CLI profile: `juanalmaraz`.
  The other local profiles (`default`, `zag`, `mec`) are unrelated accounts and must never be used for this project.
- Budget guardrail: the existing AWS Budget `monthly-1usd` (1 USD per month, credits excluded, alerts at 50% actual, 100% actual and 100% forecasted).
  It was created with the CLI and must be imported into Terraform, not recreated.
- Secrets live in SSM Parameter Store `SecureString` (standard tier).
  Secrets Manager was explicitly rejected for cost.
- ECR is approved despite its small cost.
  Any other billable resource needs the owner's explicit approval.
- DNS stays at Cloudflare, managed by Terraform.
- The repo's existing rules still apply: English only, no em dashes, design tokens from `docs/design.md`, the git flow in `AGENTS.md`.

## Decisions made by the owner

1. Compute is Lambda running the existing Astro Node server as a container image, the Cloud Run equivalent.
2. Images are stored in ECR.
3. Secrets are in SSM Parameter Store, not Secrets Manager.
4. CI/CD deploys only when a `v*` tag is pushed; CI checks still run on every push and pull request.
5. The live feed shows the latest requests from all visitors, as today.
6. Feed entries are captured by the app itself (its middleware), not from CDN logs.
   No CloudFront real-time logs, Kinesis or log pipelines.
7. The feed is stored in DynamoDB so all visitors see the same feed.
8. The feed's cache column becomes cold/warm: whether the request started a new Lambda execution environment.
9. Admin sign-in stays "Sign in with Google", now through Amazon Cognito with Google as a federated identity provider, still allowlisted to one email.
10. Deploys run inside AWS on CodePipeline V2 and CodeBuild, sourced from GitHub through a CodeConnections connection, because the project SCPs block the IAM OIDC provider GitHub Actions would need.
    Long-lived access keys and activating advanced account features were both rejected.

## Architecture

```
Browser
  |
Cloudflare DNS (DNS only, not proxied)
  |
CloudFront (global; ACM cert in us-east-1)
  |-- default behavior ---------> Lambda Function URL (us-east-2, auth AWS_IAM, OAC)
  |                                 container image from ECR: Astro Node server + Lambda Web Adapter
  |                                 reads/writes DynamoDB table, reads SSM, writes S3 media
  |-- /images/*, /files/* ------> S3 media bucket (us-east-2, private, OAC)
  |
Cognito user pool (us-east-2) with Google IdP and managed login, used only by /admin
EventBridge Scheduler (us-east-2) -> probe Lambda -> GET /api/health through CloudFront
```

| Today (GCP / Firebase) | AWS |
|---|---|
| Cloud Run | Lambda (container image, arm64) + Function URL |
| Artifact Registry | ECR, lifecycle policy keeping the last 5 images |
| Firebase Hosting (CDN) | CloudFront |
| Firestore | DynamoDB, one table |
| Cloud Storage bucket | S3 bucket behind CloudFront |
| Firebase Auth (Google) | Cognito user pool + Google IdP |
| Cloud Logging -> Pub/Sub -> `/internal/ingest` | App middleware writes feed items to DynamoDB |
| Cloud Monitoring uptime check | EventBridge Scheduler -> probe -> daily counters in DynamoDB |
| GCP budget | AWS Budgets `monthly-1usd` (exists) |
| Workload Identity Federation + GitHub Actions deploy | CodeConnections + CodePipeline V2 + CodeBuild (GitHub Actions keeps CI only) |
| Firebase Emulator Suite | DynamoDB Local + a local S3-compatible server in Docker |

## Component design

### Compute

- One Lambda function, `juanalmaraz-site`, packaged as a container image built from the existing Astro build (`@astrojs/node` standalone).
- AWS Lambda Web Adapter (LWA) is copied into the image as an extension, so the Node server runs unchanged and receives normal HTTP requests.
- Non-HTTP events (only the Cognito pre sign-up trigger, if it lives in this function) reach the server through LWA's pass-through path, mapped to an `/internal/*` route that is never reachable from CloudFront.
- Architecture `arm64`, memory 1024 MB, timeout 30 s (image processing is the slowest path), CloudWatch log retention 14 days.
  These are my calls; the builder may tune memory after measuring cold starts.
- Concurrency cap: the GCP plan had `max-instances=2`.
  Reserved concurrency of 2 is the equivalent, but new accounts often have an account concurrency limit of 10, and AWS refuses reservations that leave less than its minimum unreserved pool.
  The builder must check `aws lambda get-account-settings` and either set reserved concurrency 2 or document why the account limit is the cap.
- Lambda limits to respect: 6 MB request and response payload (buffered mode).
  Every response in this app is far below that; the two places that could exceed it (image upload, resume) are designed around it below.
- Build info (`PUBLIC_VERSION`, `PUBLIC_COMMIT`, `PUBLIC_BRANCH`) is injected at image build time, as today.
- Note from the project SCPs: as the account nears a spend limit, AWS denies `lambda:InvokeFunctionUrl`, which would take the site down; the budget alerts exist to catch this early.

### CDN (CloudFront)

- One distribution for `juanalmaraz.dev`, with an ACM certificate in `us-east-1` validated through Cloudflare DNS records.
- Default behavior: origin is the Lambda Function URL with Origin Access Control and Function URL auth type `AWS_IAM`, so the function is not publicly invocable.
  The origin request policy forwards all viewer headers except `Host`, all cookies and all query strings; the cache policy honors the origin's `Cache-Control` (min TTL 0), keyed on path only for public routes.
- `/admin/*` behavior: caching disabled, all cookies and query strings forwarded.
- `/internal/*` behavior: a CloudFront Function returns 404, so internal routes are only reachable through direct Lambda invocation.
- `/images/*` and `/files/*` behaviors: S3 origin with OAC, long TTL, compression on.
- Known OAC gotcha: for `POST`/`PUT` through OAC to a Function URL, the viewer must send `x-amz-content-sha256` with the SHA-256 of the body.
  Only the admin UI sends bodies, so its fetch helper computes that header with `crypto.subtle`.
  This is my call over the alternative (Function URL auth `NONE` plus a secret origin header), because it keeps the function closed by IAM.
- The existing cache headers from `docs/plan.md` Global Constraints stay exactly as they are; CloudFront supports `s-maxage` and `stale-while-revalidate`.
- After each deploy, the pipeline invalidates `/*` (one path, inside the 1,000 free paths per month).

### Content store (DynamoDB)

- One table, `juanalmaraz-site`, in `us-east-2`, provisioned capacity inside the always-free 25 RCU / 25 WCU, TTL attribute `expiresAt`.
  Provisioned (not on-demand) is my call: a bot flood gets throttled instead of billed.
- Key design (my call; the builder may refine it, keeping the `repo.ts` interface):

| Item | `pk` | `sk` | Notes |
|---|---|---|---|
| Collection doc | `posts`, `projects`, `experience`, `education`, `certificates` | the doc id (slug) | same fields as today's Firestore docs |
| Singleton | `about`, `site` | `main` | |
| Revision | `rev#<collection>#<id>` | ISO `savedAt` + random suffix | full snapshot plus `savedAt`, `savedBy` |
| Feed entry | `feed` | `<t padded>#<random>` | one `FeedEntry`, `expiresAt` = t + 1 day |
| Uptime day | `uptime` | `YYYY-MM-DD` | counters `ok`, `total`, `expiresAt` = day + 35 days |

- No GSIs.
  Collections are small, so `listPublished` queries the partition, filters `status = published` and sorts by `publishedAt` in code.
- DynamoDB's item limit is 400 KB (Firestore's was 1 MB).
  Admin saves reject documents over 350 KB with a clear error; this mainly bounds `bodyMd` and `diagramSvg`.
- `src/lib/firebase.ts` is replaced by `src/lib/aws.ts` exposing lazy SDK v3 client singletons (DynamoDB Document client, S3, SSM), endpoint-overridable by env for local dev, mirroring how `firebase.ts` handled emulators.

### Live request feed

- `src/middleware.ts` wraps every request: it records the method, path, status, duration in ms and whether this is the first request of the execution environment (`cold`), then passes that to the feed.
- `cold` is a module-level flag that starts `true` and flips to `false` after the first request handled by the process.
  LWA runs one Node process per execution environment, so this is accurate.
  Probe requests to `/api/health` also warm the environment, so a visitor right after a probe sees `warm`, which is true.
- `sanitize` keeps its contract and its tests' intent (allowlist, `404 · unknown path` bucket, length limit, no IP, user agent, query string or referrer), but its input changes from a Cloud Logging entry to `{ method, path, status, ms, cold, t }`.
  Routes the page itself polls (`/api/requests`, `/api/status`), `/admin`, `/internal`, `/_astro/` and `/images/` stay dropped.
- `FeedEntry.c` becomes `"cold" | "warm"`.
  `stats.hitRatio` becomes `stats.coldRatio`.
  The terminal renders `cold` with the accent the design used for `HIT`; `docs/design.md` is updated to say so.
- Storage: one `PutItem` per feed-eligible request, written before the response returns (in-Region, a few ms), because Lambda may freeze the process right after responding.
  A failed or throttled write is logged and swallowed; it never fails the visitor's request.
- `/api/requests` queries `pk = feed`, newest first, limit 30, and computes `stats` from those entries.
  Its `s-maxage=5` keeps reads low.
- This deletes `src/lib/feed/buffer.ts`, `src/pages/internal/ingest.ts`, the Pub/Sub OIDC verification and `google-auth-library`.
  The old Review Focus item about a cold buffer overwriting the feed disappears, because entries are independent items.
- Known limit, accepted by the owner: requests served from CloudFront's cache never reach the app, so they are not in the feed.

### Media (S3)

- One private bucket in `us-east-2`, Block Public Access on, readable only by CloudFront via OAC.
  Prefixes: `images/` (WebP variants), `files/` (resume, certificates), `uploads/` (temporary originals, lifecycle rule deleting after 1 day).
- `ImageRef` and the URL scheme (`${base}-${w}.webp` under `/images/`) stay as they are, so `src/lib/images/url.ts` only changes its base.
- Upload flow (my call, because of the 6 MB Lambda limit and the existing 15 MB cap):
  1. The admin UI asks `/admin/api/upload` for an S3 presigned POST to `uploads/<random>`, with a `content-length-range` condition up to 15 MB.
  2. The browser uploads the original directly to S3.
  3. The admin UI calls `/admin/api/upload` again with the key; the function downloads it, runs the unchanged `processImage` pipeline (sharp, WebP 480/960/1600, no upscaling), writes the variants to `images/`, and deletes the original.
- The bucket's CORS allows `POST` from `https://juanalmaraz.dev` only, for the presigned upload.
- The resume keeps its `/resume.pdf` route streaming from S3 with `Content-Disposition: inline; filename="juan-almaraz-resume.pdf"`.
  The admin rejects resume uploads over 5 MB, so the response stays under the 6 MB limit.

### Admin auth (Cognito + Google)

- A Cognito user pool in `us-east-2` with Google as the only identity provider, managed login on a Cognito prefix domain, and no username and password sign-up.
- The owner creates a Google OAuth client in Google Cloud Console (a manual step, documented in `infra/README.md`), with the Cognito domain's `/oauth2/idpresponse` as its redirect URI.
  Its client secret goes into SSM, from where Terraform reads it.
- App client: authorization code flow with PKCE and a client secret (stored in SSM), callback `https://juanalmaraz.dev/admin/api/callback`, sign-out URL `/admin/login`.
- `/admin/api/callback` exchanges the code, verifies the ID token with `aws-jwt-verify` (issuer, audience, `token_use = id`), then applies the existing `isAdmin` check (`email_verified` and the `ADMIN_EMAIL` allowlist).
- On success it issues the app's own session cookie, an HMAC-signed token with a 5-day expiry, `HttpOnly; Secure; SameSite=Lax; Path=/admin`.
  The signing key lives in SSM.
  This keeps `requireAdmin` and the middleware unchanged except for the verifier, and keeps sessions independent of Cognito's 1-hour ID tokens.
- The cookie name may stay `__session` or be renamed; it was only required by Firebase Hosting.
- Defense in depth (my call): a Cognito pre sign-up trigger rejects any Google account whose email is not `ADMIN_EMAIL`, so strangers do not even get a user in the pool.
  The app-side allowlist stays authoritative.
- Logout clears the cookie and redirects to Cognito's logout endpoint.

### Secrets and configuration

- SSM `SecureString` parameters under `/juanalmaraz/`: session signing key, Cognito app client secret, Google OAuth client secret.
- The function reads them once per cold start with `GetParameters` (decrypted) and caches them in memory.
- Non-secret config (`ADMIN_EMAIL`, table and bucket names, Cognito ids, site URL) are plain Lambda environment variables set by Terraform.

### Status and uptime

- `src/lib/status/check.ts` keeps its logic; `src/lib/status/deps.ts` swaps its probes:
  - `pingDb`: a `GetItem` on `site/main`.
  - `bucketExists`: `HeadBucket` on the media bucket.
  - `getFeed`: unchanged contract, backed by the new feed query.
  - `uptime`: `sum(ok)` over the last 30 `uptime` day items divided by the number of probe slots that should have run in that window (counted from the first probe ever recorded), or `null` before the first probe.
- Uptime probe (my calls, because CloudWatch Synthetics would cost about 10 USD per month, and because a probe living inside the site cannot report the site's own outages):
  - A separate, tiny function `juanalmaraz-probe` (Node 24 zip package, no LWA, no VPC), invoked by an EventBridge Scheduler schedule at a fixed interval (see "Probe interval" below).
  - It requests `https://juanalmaraz.dev/api/health` through CloudFront.
    `/api/health` is a new route with `Cache-Control: no-store` that does a `GetItem` on `site/main` and returns 200, so every probe exercises CloudFront, the function and DynamoDB, never the CDN cache.
  - On a 200 within 5 seconds, it atomically adds 1 to `ok` on today's `uptime` item; on failure it writes nothing.
  - Because the denominator is the expected slot count, not a counter, any outage counts as downtime, including the site function failing, a bad deploy, or the spend-limit deny on `lambda:InvokeFunctionUrl`.
    A broken probe also counts as downtime, which errs on the honest side.
  - `/api/health` is dropped from the feed by `sanitize`, like `/api/status`.
- Probe interval (owner's decision): every 5 minutes, about 8,640 probe invocations per month, inside the free tier.
  The owner prioritized uptime precision over the cold/warm signal: the probe keeps one execution environment warm, so `cold` will show up in the feed mainly after deploys or when traffic needs a second environment.
- The probe measures availability from inside AWS, which is weaker than an external check; the builder notes this in `infra/README.md`.
- The client-side red dot when `/api/status` is unreachable (Review Focus 5) is unchanged.
- Status tooltip rows (my call; today they name GCP services and show a CDN hit ratio the app can no longer measure):
  - "Website (CloudFront)": reachability only, decided client-side as today, no percentage.
  - "App (Lambda)": up or down, plus the cold-start ratio from the feed stats (`coldRatio`).
  - "Database (DynamoDB)" and "Media (S3)": up or down from `pingDb` and `bucketExists`.
  - The same labels replace the hard-coded "App (Cloud Run)" fallback in `StatusDot.astro`, and `docs/design.md` and the Task 9 tests are updated to match.

### Local development and tests

- `docker compose` provides DynamoDB Local (official image) and a local S3-compatible server.
  The S3 server must be freely usable without an account or auth token, and runnable as a GitHub Actions service container; the builder picks it.
- `src/lib/aws.ts` points the SDK at those endpoints when `AWS_ENDPOINT_URL_DYNAMODB` / `AWS_ENDPOINT_URL_S3` are set, with dummy credentials.
- Cognito is not emulated.
  Unit tests cover the callback with a mocked token endpoint and a local JWKS; Playwright admin tests mint a session cookie with the test signing key, which is valid because the session is the app's own token.
- `pnpm test`, `pnpm e2e` and `pnpm check` keep their names; `scripts/seed.ts` seeds DynamoDB Local and the local S3.
- `firebase.json`, `firestore.rules`, `storage.rules`, `tests/unit/firebase.test.ts` and `tests/unit/ingest.test.ts` are deleted; `firebase`, `firebase-admin`, `firebase-tools` and `google-auth-library` are removed.

### CI/CD

- CI stays on GitHub Actions: `ci.yml` keeps running on every push and pull request, with the Docker services above instead of the Firebase emulators.
  It needs no AWS access.
- Deploy runs in AWS, so no AWS credential ever leaves the account:
  - A CodeConnections GitHub connection to `almarazj/juanalmaraz.dev`.
    Terraform creates it in `PENDING` state; the owner completes the GitHub App handshake once in the console (documented in `infra/README.md`).
  - A CodePipeline V2 pipeline in `us-east-2` whose trigger fires only on pushed tags matching `v*`; branch pushes never start it.
    The source action uses the full-clone output (`CODEBUILD_CLONE_REF`) so the build can inspect git history.
  - One CodeBuild project (arm64 Linux, privileged mode for Docker) running `buildspec.yml` from the repo.
- `buildspec.yml` fails fast unless:
  - the tag equals `v` + the `package.json` version, and
  - the tagged commit is reachable from `origin/main`.
- Then it runs `pnpm check` (Docker services for DynamoDB Local and S3 run inside the privileged build), builds the arm64 image natively, tags it with the version and the commit SHA, pushes to ECR, runs `aws lambda update-function-code`, waits for the update, publishes a new Lambda version, moves the `live` alias to it, invalidates CloudFront `/*`, and runs `tests/e2e/deployed.spec.ts` against `https://juanalmaraz.dev`.
- Rollback (my call, because a failed post-deploy check must not leave a broken version live): the Function URL is attached to the `live` alias, not `$LATEST`.
  If `deployed.spec.ts` fails, the build moves `live` back to the previous version, invalidates CloudFront again and fails the pipeline.
- Tag trigger spike (my call): the first infra task proves a CodePipeline V2 tag trigger through CodeConnections on this account with a throwaway pipeline and tag, before Task 14 depends on it.
  If tag triggers do not work, the builder stops and brings the alternatives back to the owner; "never deploy on a branch push" stays non-negotiable.
  Playwright's browsers need a supported Linux, so the builder may run the Playwright steps inside the official Playwright container image.
- The CodeBuild service role is least privilege: read the connection, push to the one ECR repository, update the one function, invalidate the one distribution, write its own log group.
  The pipeline role can only use the connection, start that build and use its artifact bucket.
- The pipeline's artifact bucket is a private S3 bucket with a lifecycle rule expiring artifacts after 7 days.
- Terraform is not applied from CI.
  CI runs `terraform fmt -check`, `terraform validate` and `tflint` on changes under `infra/`; the owner runs `plan` and `apply` locally with the `juanalmaraz` profile.
- `deployed.spec.ts` keeps its checks, except the cache-hit header assertion becomes CloudFront's `x-cache: Hit from cloudfront` on a second request.

### Infrastructure (Terraform)

- Root module in `infra/`, providers `aws` (default `us-east-2`, plus an alias for `us-east-1` used only for the ACM certificate) and `cloudflare`.
- Remote state in an S3 bucket in `us-east-2` with S3 native locking (`use_lockfile`), created once by a small bootstrap step documented in `infra/README.md`.
  State contains the Google client secret read from SSM, so the state bucket is private, encrypted and versioned.
- Resources: ECR repository and lifecycle policy; Lambda function, Function URL, log group with 14-day retention; DynamoDB table; S3 media bucket with lifecycle rule and CORS; CloudFront distribution, OACs, cache and origin request policies, the `/internal/*` CloudFront Function; ACM certificate and its Cloudflare validation records; Cloudflare DNS records for `juanalmaraz.dev` pointing at CloudFront (DNS only); Cognito user pool, Google IdP, domain, app client, pre sign-up trigger permission; EventBridge Scheduler schedule and its role; SSM parameter references; IAM roles (function execution role with least-privilege access to the table, the bucket prefixes and its SSM path; scheduler role; CodeBuild and CodePipeline roles); CodeConnections connection, CodePipeline V2 pipeline with its tag trigger, CodeBuild project, pipeline artifact bucket; the imported budget `monthly-1usd`.
- The function's image URI and the `live` alias's version are set on first apply and then ignored by Terraform (`lifecycle { ignore_changes = [...] }`), because deploys update them.
- The probe function, its execution role (invoke nothing, write only `uptime` items) and its schedule are part of the same module.
- Outputs: distribution domain, function URL, table name, bucket name, user pool id and domain, ECR repository URL, connection ARN (to finish the handshake) and pipeline name.

### SEO (Task 12)

- Unchanged in scope and tests: RSS, sitemap, `og.png`, `robots.txt` disallowing `/admin`, canonical URLs on `https://juanalmaraz.dev`, OG and Twitter meta, the Cloudflare Web Analytics beacon.
- It does not depend on the cloud provider and can be built before or in parallel with the migration.

## Cost estimate

| Service | Expected monthly cost |
|---|---|
| Lambda, CloudFront, DynamoDB (provisioned 25/25), Cognito, EventBridge Scheduler, SSM standard, ACM, Budgets, CloudWatch Logs (under 5 GB) | 0 USD, always free |
| ECR (about 1 GB with 5 images kept) | about 0.10 USD |
| S3 (media under 1 GB, state bucket, pipeline artifacts) | about 0.03 USD |
| CodeBuild and CodePipeline V2 (a few releases per month) | 0 USD if inside their free minutes, otherwise cents per release |
| Total | about 0.15 USD, covered by credits until 2027-05-12 |

These figures were not checked against the live pricing pages; see open items.

## Verified against the project SCPs

- Supported on the FREE plan and allowed by the SCPs: Lambda, ECR, DynamoDB, S3, CloudFront, Cognito, ACM, EventBridge Scheduler, Systems Manager, CloudWatch Logs, Budgets, IAM, STS, CodeBuild, CodePipeline and CodeConnections.
- Activating advanced account features would lift the SCPs but is irreversible and requires the paid plan (https://docs.aws.amazon.com/accounts/latest/reference/activate-advanced-features.html).
- ACM and CloudFront calls in `us-east-1` are explicitly exempted from the Region restriction.
- Blocked: the IAM OIDC identity provider (`iam:*Provider*`), Lambda@Edge, global tables and cross-Region replication, exportable ACM certificates.
- Sources: https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html and https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html.

## Changes to the existing plan

- `docs/plan.md` Global Constraints: replace the GCP lines (region, quotas, feed write cadence, admin access) with the AWS equivalents above; the feed stores `cold`/`warm` instead of `HIT`/`MISS`.
- Data Model section: replace the Firestore table with the DynamoDB key design.
- Skills per task: replace the Firebase and Google Cloud skills with `aws-serverless`, `aws-database`, `aws-auth`, `aws-iam`, `aws-containers`, `aws-storage`, `aws-networking` and `aws-sdk-js-v3-usage` where relevant.
- New rework tasks for the already-built Tasks 3, 8, 9, 10 and 11, each keeping its tests' intent and switching their backing services, inserted before Task 13.
- Task 13 (Terraform) and Task 14 (deploy) rewritten for AWS as above.
- Review Focus: item 2 replaced by "a throttled feed write never fails the visitor's request"; item 3 now covers a non-allowlisted Google account signing in through Cognito.

## Open items to verify before building

- That CodePipeline V2 git tag triggers work through CodeConnections on this account (no SCP denies them, but it was not tested).
- The account's Lambda concurrency limit and whether reserved concurrency 2 is accepted.
- Current always-free figures for Lambda, DynamoDB, CloudFront, Cognito, EventBridge Scheduler, CodeBuild and CodePipeline V2, and any S3 or ECR allowance on this plan.
- Domain availability and price of `juanalmaraz.dev` at Cloudflare Registrar (carried over from `docs/plan.md`).
  The domain and its Cloudflare zone must exist before the ACM, DNS, CORS and Cognito callback work in Task 13.

## Left to the builder

- Exact Lambda memory after measuring cold start and image processing time.
- The local S3-compatible server, within the constraints above.
- The session token format (for example a compact HMAC-signed payload or a JWT with `jose`), as long as it is verified with a constant-time comparison and carries an expiry.
- Whether the pre sign-up trigger runs in the main function through LWA's pass-through path or as a tiny separate function.
- Module layout inside `infra/`.
