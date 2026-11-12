# Infrastructure

Terraform for the AWS project `672027759414` (Region `us-east-2`; only the CloudFront certificate is in `us-east-1`) and the Cloudflare DNS of `juanalmaraz.dev`.
CI only runs `fmt`, `validate`, `test` (mocked providers) and `tflint`; the owner runs `plan` and `apply` by hand.

## Prerequisites

- Terraform 1.17 and the AWS CLI v2, or the same pinned Docker images CI uses.
- Every command below runs from the repo root with these set:

```sh
export AWS_PROFILE=juanalmaraz AWS_REGION=us-east-2
export CLOUDFLARE_API_TOKEN=...   # token with Zone:DNS:Edit on juanalmaraz.dev
```

- Confirm the project Region is `us-east-2` in AWS Settings > View all projects > Overview > Additional Info > Region.
- `aws sts get-caller-identity` must print account `672027759414`; the providers refuse any other account.

## 1. Bootstrap the state bucket (once)

```sh
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
```

This creates `juanalmaraz-tfstate-672027759414`: private, versioned and encrypted, because the state holds the Google client secret and the Cognito client secret.
Its own state stays local in `infra/bootstrap` (git-ignored); the bucket has `prevent_destroy`.

## 2. Decide the function's reserved concurrency

```sh
aws lambda get-account-settings --query AccountLimit.ConcurrentExecutions
```

Lambda keeps at least 10 executions unreserved, so reserving 2 needs a limit of 12 or more.
If the limit is 12 or more, set `reserved_concurrency = 2` in `infra/terraform.tfvars`.
If it is 10 (common on new accounts), leave it unset: the account limit is then the cap, and a reservation would be rejected.

## 3. Google OAuth client and SSM secrets

1. In Google Cloud Console > APIs & Services > Credentials, create an OAuth client of type "Web application".
   - Authorized JavaScript origin: `https://juanalmaraz.auth.us-east-2.amazoncognito.com`
   - Authorized redirect URI: `https://juanalmaraz.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`
2. Put its secret and a fresh session signing key in SSM (standard tier, `SecureString`):

```sh
aws ssm put-parameter --name /juanalmaraz/google-client-secret --type SecureString --value '<google client secret>'
aws ssm put-parameter --name /juanalmaraz/session-key --type SecureString --value "$(openssl rand -base64 48)"
```

`/juanalmaraz/cognito-client-secret` is written by Terraform.

## 4. Variables

```sh
cp infra/terraform.tfvars.example infra/terraform.tfvars
```

Fill it in; it is git-ignored because the repo is public and it holds personal emails.
`budget_alert_email` must be the address the existing `monthly-1usd` budget already notifies.
`initial_image_tag` is the tag pushed in step 6, for example `v0.1.0`.

## 5. Init and plan

```sh
terraform -chdir=infra init
terraform -chdir=infra plan
```

Expect only creates plus `aws_budgets_budget.monthly` "will be imported" with no changes.
If the budget shows an in-place update, its live settings differ from `budget.tf`; fix `budget.tf` to match before applying.

## 6. First apply, in two phases

The function cannot be created before its image exists, so the ECR repository goes first.

```sh
terraform -chdir=infra apply -target=aws_ecr_repository.site -target=aws_ecr_lifecycle_policy.site

TAG=v0.1.0   # same as initial_image_tag
REPO=$(terraform -chdir=infra output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
docker buildx build --platform linux/arm64 --provenance=false \
  --build-arg PUBLIC_VERSION="${TAG#v}" \
  --build-arg PUBLIC_COMMIT="$(git rev-parse --short=7 HEAD)" \
  --build-arg PUBLIC_BRANCH="$(git branch --show-current)" \
  --build-arg PUBLIC_CF_BEACON='<beacon token or empty>' \
  -t "$REPO:$TAG" --push .

terraform -chdir=infra apply
```

`--provenance=false` keeps the pushed manifest a plain image, which Lambda requires.
The ACM certificate validates through the Cloudflare record Terraform creates; the apply waits for it (a few minutes) before creating the distribution.

## 7. Finish the GitHub connection

The connection is created `PENDING`.
In the console, open Developer Tools > Settings > Connections, select `juanalmaraz-github` (ARN in `terraform -chdir=infra output -raw connection_arn`), choose "Update pending connection" and install or pick the AWS Connector GitHub App with access to `almarazj/juanalmaraz.dev` only.
The status must read `Available`.

## 8. Prove the tag trigger

The release must only ever start on a pushed `v*` tag.
Prove it on the real pipeline with a throwaway tag; the run cannot deploy, because the release check rejects a tag that does not match `package.json` (and before Task 14 lands there is no `buildspec.yml`, so the build fails immediately).

```sh
git push origin develop            # a branch push
aws codepipeline list-pipeline-executions --pipeline-name juanalmaraz-release --max-items 5
# expect: no execution

git tag v0.0.0-spike && git push origin v0.0.0-spike
aws codepipeline list-pipeline-executions --pipeline-name juanalmaraz-release --max-items 5
# expect: exactly one new execution, its trigger is the tag; it fails in the Release stage

git push --delete origin v0.0.0-spike && git tag -d v0.0.0-spike
```

If the tag starts nothing, or the branch push starts an execution, stop and bring the observed behavior back to the owner; never fall back to branch triggers.

## 9. Seed content before announcing

Pages answer 500 until `site/main` and `about/main` exist.
Sign in at `https://juanalmaraz.dev/admin` and save the site and about content (or run the migration scripts against the deployed table) before sharing the URL.

## 10. Verify

```sh
curl -sI https://juanalmaraz.dev/api/health          # 200 and cache-control: no-store
curl -sI "$(terraform -chdir=infra output -raw function_url)"   # 403
curl -sI https://juanalmaraz.dev/internal/ready      # 404
curl -sI "https://$(terraform -chdir=infra output -raw bucket_name).s3.us-east-2.amazonaws.com/images/x.webp"   # 403
```

- The owner's Google account signs in to `/admin`; any other Google account is refused at sign-up by the pre sign-up trigger.
- After 15 minutes `curl -s https://juanalmaraz.dev/api/status` shows a non-null `uptime30d`.

## Operating notes

- Releases change the function's image and move the `live` alias; Terraform ignores both.
  Changing the function's environment in Terraform only reaches visitors with the next release, because `live` keeps pointing at the published version.
- `EXPECTED_VERSION_OVERRIDE` defaults to `none` (CodePipeline rejects an empty default), which the build reads as "use the tag's version".
  Rollback rehearsal: `aws codepipeline start-pipeline-execution --name juanalmaraz-release --variables name=EXPECTED_VERSION_OVERRIDE,value=0.0.0`.
- The uptime probe runs inside AWS (EventBridge Scheduler every 5 minutes, through CloudFront to `/api/health`).
  It catches function, DynamoDB, CloudFront and deploy failures, but not problems only visible from outside AWS, such as Cloudflare DNS; an external check would be stronger.
- The probe keeps one execution environment warm, so `cold` in the feed shows up mostly after releases.
- Point-in-time recovery on the table is off because it is billed; the table has deletion protection instead.
