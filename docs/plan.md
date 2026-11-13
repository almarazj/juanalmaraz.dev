# juanalmaraz.dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Repo rule from `AGENTS.md`: work in the main checkout, no worktrees, and leave every task's changes uncommitted for the owner to review; "Review" steps below replace the usual commit step.

**Goal:** Replace the old static portfolio with a reading-first backend portfolio at `juanalmaraz.dev` that runs a real public API, a live request log and a live status, edited from a small admin, running on AWS at effectively zero cost.

**Architecture:** One Astro SSR app (Node adapter) runs as a Lambda container image (Lambda Web Adapter) behind CloudFront, serving the public site, `/api/*` and `/admin`.
Content, revisions, the request feed and uptime counters live in one DynamoDB table; images and the resume live in a private S3 bucket served through CloudFront.
The app's own middleware records each request it serves into the feed; a separate probe Lambda checks `/api/health` every 5 minutes; admin sign-in is Google through Cognito.
Tasks 1 to 11 were built on Firebase/GCP; Tasks R1 to R7 move them to AWS before the infrastructure (Task 13) and the release pipeline (Task 14).

**Tech Stack:** Node 24 LTS, pnpm, TypeScript (strict), Astro 5 SSR with `@astrojs/node`, AWS SDK for JavaScript v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/client-ssm`), `aws-jwt-verify`, AWS Lambda Web Adapter, unified (remark/rehype) with `rehype-sanitize` and Shiki, sharp, zod, Vitest, Playwright, Docker Compose (DynamoDB Local and a local S3-compatible server), Terraform (`aws` and `cloudflare` providers), CodePipeline V2 + CodeBuild + CodeConnections for deploys, GitHub Actions for CI.

**Spec:** [`docs/superpowers/specs/2026-11-12-aws-migration-design.md`](superpowers/specs/2026-11-12-aws-migration-design.md) (AWS architecture and every decision behind it) plus [`docs/design.md`](design.md) (visual spec, tokens, component behavior, lab links).
Executors read the spec before any task from R1 on.

## Global Constraints

- AWS account `672027759414` ("new AWS experience" project, FREE plan); every Regional resource in `us-east-2`; only the CloudFront ACM certificate lives in `us-east-1`; local CLI profile `juanalmaraz`, never `default`, `zag` or `mec`.
- Cost: AWS always-free tier plus account credits; budget `monthly-1usd` (1 USD, credits excluded) already exists and is imported, not recreated; ECR is approved; any other billable resource needs the owner's explicit approval; no Secrets Manager, Kinesis, NAT Gateway, App Runner, Fargate, CloudWatch Synthetics or Route 53 hosted zone.
- Secrets in SSM Parameter Store `SecureString` (standard tier) under `/juanalmaraz/`; no long-lived AWS access keys anywhere.
- Lambda: container image, `arm64`, 1024 MB, timeout 30 s, log retention 14 days, reserved concurrency 2 if the account accepts it; responses and requests stay under the 6 MB payload limit.
- DynamoDB: one table `juanalmaraz-site`, provisioned capacity within 25 RCU / 25 WCU, TTL attribute `expiresAt`, no GSIs; documents over 350 KB are rejected on save.
- English only; `<html lang="en">`; light mode default, dark only via toggle stored in `localStorage["mode"]`.
- Content is Markdown, rendered server side and sanitized; no raw HTML from the database reaches the page unsanitized.
- Public cache headers: pages `public, max-age=0, s-maxage=300, stale-while-revalidate=86400`; `/api/requests` `s-maxage=5`; `/api/status` `s-maxage=30`; other `/api/*` `s-maxage=60`; `/api/health`, `/admin/*` and `/internal/*` `no-store`.
- The request feed stores only method, path, status, `cold` or `warm`, latency ms and timestamp; never IP, user agent, query string or referrer.
- Unknown paths with status 404 appear as the literal path `404 · unknown path`; any other path outside the allowlist, and anything under `/admin` or `/internal`, is dropped.
- Feed writes: one `PutItem` per feed-eligible request, awaited before the response returns, failures logged and swallowed; feed items expire after 1 day; `/api/requests` shows the latest 30.
- Admin access: Google sign-in through Cognito, one allowlisted email from env `ADMIN_EMAIL`, verified server side on every admin request; the app's own session cookie lasts 5 days.
- Image variants on upload: WebP at widths 480, 960, 1600; originals are not kept; image uploads up to 15 MB, resume uploads up to 5 MB.
- Versioning: semver in `package.json`; a release is the tag `vX.Y.Z` on `main`; deploys run only on pushed `v*` tags whose version matches `package.json` and whose commit is on `main`, never on branch pushes; the footer stamp reads `PUBLIC_VERSION`, `PUBLIC_COMMIT` (7 chars) and `PUBLIC_BRANCH` injected at build.
- Local development and CI need no cloud account: `pnpm test`, `pnpm e2e` and `pnpm check` run against Docker services only.
- Accessibility: every hover behavior has a keyboard and touch equivalent; visible focus ring; `prefers-reduced-motion` disables animation.
- No em dashes in copy or docs.

## Review Focus

1. Feed sanitizer receives a crafted path (`/<script>`, very long paths, `%2e%2e`): it must drop or bucket it, never echo it. Test lives in Task R3.
2. A feed write fails or is throttled: the visitor's request still returns its normal response and status. Test lives in Task R3.
3. A non-allowlisted Google account completes Cognito sign-in, or a session cookie is forged, tampered with, expired or revoked: every admin page and admin API returns 403, including direct POSTs. Test lives in Task R5.
4. The site function is down while the probe keeps running, or the probe itself stops: uptime drops, it never stays at 100%. Test lives in Task R6.
5. `/api/status` is unreachable (Lambda down) while CloudFront still serves the page: the footer dot turns red from the client side. Test lives in Task 9, labels updated in Task R6.

## Skills per task

Load these skills (installed globally) before working on the listed tasks; they carry the framework conventions this plan assumes.
For any AWS work, also follow `docs/aws-agent-rules.md` (search the AWS MCP `agent_skills` topic first).

| Skill | Tasks |
|---|---|
| `typescript-best-practices` | all code tasks |
| `astro` | 1, 2, 4, 5, 6, 7, 8, 11, 12, R3, R5, R6 |
| `vitest` | every task with `tests/unit` |
| `playwright-best-practices` | every task with `tests/e2e` |
| `accessibility` | 2, 4, 5, 6, 7, 9, 11, R6 |
| `aws-sdk-js-v3-usage` | R1, R2, R3, R4, R5, R6 |
| `aws-database` | R2, R3, R6 |
| `aws-storage` | R4 |
| `aws-auth` | R5 |
| `aws-serverless`, `aws-containers` | R6, R7, 13, 14 |
| `aws-iam`, `aws-networking` | 13, 14 |
| `aws-deployment` | 14 |
| `terraform-style-guide`, `terraform-test` | 13 |
| `aws-well-architected-review`, `aws-billing-and-cost-management` | 13, 14 |

---

## File Structure

```
juanalmaraz.dev/
  AGENTS.md, CLAUDE.md -> AGENTS.md
  docs/plan.md, docs/design.md, docs/aws-agent-rules.md, docs/superpowers/specs/
  package.json, pnpm-lock.yaml, .nvmrc, tsconfig.json, astro.config.mjs
  docker-compose.yml               DynamoDB Local + local S3 for dev, tests and CI (R1)
  Dockerfile                       Lambda image: Astro server + Lambda Web Adapter (R7)
  buildspec.yml                    CodeBuild release build (Task 14)
  src/
    styles/, layouts/, components/ as built in Tasks 2 to 11
    components/admin/              Editor, ImageUpload, RevisionList
    lib/aws.ts                     SDK client singletons, config, SSM secrets (R1)
    lib/content/schemas.ts         zod schemas and inferred types
    lib/content/repo.ts            DynamoDB reads and writes, revisions (R2)
    lib/feed/sanitize.ts           request facts to FeedEntry or null (R3)
    lib/feed/store.ts              feed items: put, latest, stats (R3)
    lib/feed/stats.ts              rpm, p50, coldRatio
    lib/markdown/render.ts         Markdown to sanitized HTML, headings, reading time
    lib/images/process.ts          sharp variants and S3 upload (R4)
    lib/images/url.ts              public image URLs
    lib/auth/admin.ts              session verification and allowlist (R5)
    lib/auth/session.ts            app session token sign and verify (R5)
    lib/auth/cognito.ts            authorize URL, code exchange, ID token verification (R5)
    lib/admin/fetch.ts             admin fetch helper adding x-amz-content-sha256 (R5)
    lib/status/check.ts, deps.ts   service checks for /api/status (R6)
    lib/status/uptime.ts           expected-slot uptime math (R6)
    lib/http/cache.ts, json.ts     Cache-Control and JSON helpers
    middleware.ts                  admin guard and feed capture (R3)
    pages/index.astro, writing/, rss.xml.ts, sitemap.xml.ts, resume.pdf.ts
    pages/api/me.ts, experience.ts, stack.ts, now.ts, requests.ts, status.ts, health.ts
    pages/admin/index.astro, admin/login.astro, admin/[collection]/[id].astro
    pages/admin/api/save.ts, preview.ts, restore.ts, upload.ts, signin.ts, callback.ts, logout.ts
    pages/internal/ready.ts        Lambda Web Adapter readiness check (R7)
  lambdas/probe/index.mjs          uptime probe Lambda (zip, no framework) (R6)
  lambdas/presignup/index.mjs      Cognito pre sign-up allowlist (R5)
  scripts/local-aws.ts             creates the local table and bucket (R1)
  scripts/seed.ts                  seeds local DynamoDB and S3 with sample content
  scripts/migrate-images.ts        pushes the old site's audio project images through process.ts
  scripts/smoke-image.sh           builds and smoke-tests the Lambda image locally (R7)
  scripts/release-check.sh         tag, version and main-branch guard for releases (Task 14)
  tests/unit/*.test.ts             Vitest
  tests/e2e/*.spec.ts              Playwright against local services
  infra/                           Terraform root module (Task 13)
  .github/workflows/ci.yml         lint and tests on every push and pull request
```

Removed by Tasks R1 to R6: `src/lib/firebase.ts`, `src/lib/feed/buffer.ts`, `src/pages/internal/ingest.ts`, `src/pages/admin/api/session.ts`, `firebase.json`, `firestore.rules`, `storage.rules`, `tests/unit/firebase.test.ts`, `tests/unit/ingest.test.ts`, `tests/unit/buffer.test.ts`, and the packages `firebase`, `firebase-admin`, `firebase-tools`, `google-auth-library`.

## Data Model (DynamoDB)

Table `juanalmaraz-site`, partition key `pk` (string), sort key `sk` (string), TTL attribute `expiresAt` (epoch seconds).

| Item | `pk` | `sk` | Attributes |
|---|---|---|---|
| Post | `posts` | slug | `title`, `summary`, `bodyMd`, `tags: string[]`, `status: "draft" \| "published"`, `publishedAt`, `updatedAt`, `series?: { id, title, part }` |
| Project | `projects` | slug | `title`, `group: "backend" \| "engineering"`, `year`, `summary`, `problem?`, `decision?`, `result?`, `stack: string[]`, `links: {label,url}[]`, `image?: ImageRef`, `diagramSvg?`, `confidential: boolean`, `order`, `status` |
| Experience | `experience` | id | `role`, `org`, `monogram`, `start: "YYYY-MM"`, `end: "YYYY-MM" \| null`, `place`, `summary`, `stack: string[]`, `order` |
| Education | `education` | id | `title`, `school`, `start`, `end`, `summary` |
| Certificate | `certificates` | id | `name`, `issuer`, `year`, `level?`, `file?: ImageRef`, `verifyUrl?`, `order` |
| About | `about` | `main` | `bio`, `photos: {image: ImageRef, caption}[]`, `questions: {q, a, detail, icon, link?}[]` |
| Site | `site` | `main` | `lede`, `roleLine`, `resumePath`, `now: object` |
| Revision | `rev#<collection>#<id>` | `<savedAt ISO>#<6 random chars>` | full snapshot of the document plus `savedAt` (epoch ms), `savedBy` |
| Session floor | `auth` | `main` | `sessionsValidAfter` (epoch ms) |
| Feed entry | `feed` | `<t as 13-digit zero-padded ms>#<6 random chars>` | one `FeedEntry`, `expiresAt` = t + 1 day |
| Uptime day | `uptime` | `YYYY-MM-DD` (UTC) | `ok` (number of successful probes), `expiresAt` = day + 35 days |
| First probe | `uptime` | `first` | `firstProbeAt` (epoch ms), written once with `attribute_not_exists` |

`ImageRef = { base: string, widths: [480, 960, 1600], alt: string }`, URLs built as `/images/${base}-${w}.webp`.
`FeedEntry = { m: "GET" | "POST" | "HEAD"; p: string; s: number; c: "cold" | "warm"; ms: number; t: number }`.

---

Tasks 1 to 11 are done (built on Firebase and GCP, commit `281e232`); Tasks R1 to R7 rework their backing services for AWS.

### Task 1: Repository bootstrap and CI skeleton

**Files:**
- Create: `package.json`, `.nvmrc` (`24`), `tsconfig.json` (extends `astro/tsconfigs/strict`), `astro.config.mjs` (output `server`, adapter `@astrojs/node` mode `standalone`), `firebase.json` (emulators: auth 9099, firestore 8080, storage 9199, ui off), `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `src/pages/index.astro` (placeholder "ok")
- Test: `tests/unit/smoke.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm build`, `pnpm test` (vitest), `pnpm e2e` (playwright with `firebase emulators:exec`), `pnpm lint` (`astro check` + eslint), `pnpm check` (lint + test + e2e).

- [x] **Step 1: Write `tests/e2e/smoke.spec.ts`**: `GET /` returns 200 and `html[lang="en"]` exists.
- [x] **Step 2: Run `pnpm e2e`**; expected FAIL (no app).
- [x] **Step 3: Scaffold Astro with the config above**; set `"packageManager": "pnpm@<current>"` and `"engines": { "node": ">=24" }`.
- [x] **Step 4: Run `pnpm check`**; expected all green.
- [x] **Step 5: CI**: `ci.yml` runs `pnpm install --frozen-lockfile`, `pnpm check` on every push and PR, with Java installed for the emulators.
- [x] **Step 6: Review**: leave uncommitted; owner commits on `feature/bootstrap`.

### Task 2: Design tokens, base layout, theme toggle

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/layouts/Base.astro`, `src/components/site/ThemeToggle.astro`
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Produces: `Base.astro` props `{ title: string; description: string; ogImage?: string }`; tokens exactly as in `docs/design.md` (names `--bg`, `--fg`, `--muted`, `--faint`, `--line`, `--soft`, `--accent`, `--ok`, `--warn`, `--down`, `--c-experience`, `--c-projects`, `--c-engineering`, `--c-education`, `--c-writing`, `--c-about`, `--g-*`).

- [x] **Step 1: Test** `theme.spec.ts`: fresh context renders `html` without `data-mode` and `body` background `rgb(251, 251, 250)`; clicking the toggle sets `data-mode="dark"` and background `rgb(20, 21, 24)`; reload keeps dark; an OS-level `colorScheme: 'dark'` context still renders light.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement** tokens, base styles and an inline `<script>` in `<head>` that applies `localStorage.mode` before paint (no flash); wrap storage access in try/catch.
- [x] **Step 4: Run** `pnpm e2e -- theme`, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 3: Content schemas, repository and Markdown rendering

**Files:**
- Create: `src/lib/firebase.ts`, `src/lib/content/schemas.ts`, `src/lib/content/repo.ts`, `src/lib/markdown/render.ts`, `scripts/seed.ts`
- Test: `tests/unit/schemas.test.ts`, `tests/unit/render.test.ts`, `tests/unit/repo.test.ts` (runs against the Firestore emulator)

**Interfaces:**
- Produces:
  - `schemas.ts`: zod `PostSchema`, `ProjectSchema`, `ExperienceSchema`, `EducationSchema`, `CertificateSchema`, `AboutSchema`, `SiteSchema`, `FeedEntrySchema`, and their `z.infer` types `Post`, `Project`, `Experience`, `Education`, `Certificate`, `About`, `Site`, `FeedEntry`.
  - `repo.ts`: `listPublished<T>(collection: Collection): Promise<T[]>` (ordered by `order` or `publishedAt desc`), `getPublished<T>(collection: Collection, id: string): Promise<T | null>`, `getSingleton<T>(path: "about/main" | "site/main"): Promise<T>`, `saveWithRevision<T>(collection: Collection, id: string, data: T, savedBy: string): Promise<void>` (writes doc and revision in one batch), `listRevisions(collection, id, limit = 20)`, `restoreRevision(collection, id, revisionId, savedBy)`.
  - `render.ts`: `renderMarkdown(md: string): Promise<{ html: string; headings: { id: string; text: string; depth: 2 | 3 }[]; minutes: number }>`; reading time = `ceil(words / 220)`.
  - `firebase.ts`: `db()`, `bucket()`, `auth()` singletons that honor `FIRESTORE_EMULATOR_HOST` and friends.

- [x] **Step 1: Tests**:
  - `schemas.test.ts`: a post missing `title` fails; `status` outside the enum fails; `experience.end` accepts `null` and `"2024-04"`, rejects `"2024-4"`.
  - `render.test.ts`: `<script>alert(1)</script>` is removed; `[x](javascript:alert(1))` renders without an `href`; `## Batching to stay free` yields heading `{ id: "batching-to-stay-free", depth: 2 }`; a fenced `ts` block renders with Shiki classes; 440 words gives `minutes: 2`.
  - `repo.test.ts`: `saveWithRevision` creates exactly one revision per call; `listPublished("posts")` excludes drafts; `restoreRevision` writes the snapshot back and adds a new revision.
- [x] **Step 2: Run** `pnpm test`, expect FAIL.
- [x] **Step 3: Implement**; render pipeline `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-slug` → `@shikijs/rehype` (theme matching graphite tokens) → `rehype-sanitize` (default schema extended to keep Shiki `class`/`style` on `span` and `pre`) → `rehype-stringify`.
- [x] **Step 4: `scripts/seed.ts`** writes sample docs for every collection using the copy from the labs, so every later task has content; `pnpm seed` runs it against the emulator.
- [x] **Step 5: Run** `pnpm test`, expect PASS.
- [x] **Step 6: Review**: leave uncommitted.

### Task 4: Header, footer shell and side index

**Files:**
- Create: `src/components/site/Header.astro`, `src/components/site/Footer.astro`, `src/components/site/SideIndex.astro`, `src/components/site/scrollspy.ts`
- Test: `tests/e2e/chrome.spec.ts`, `tests/unit/scrollspy.test.ts`

**Interfaces:**
- Consumes: `Base.astro` from Task 2.
- Produces: `SideIndex` props `{ sections: { id: string; title: string; color: string; entries: { id: string; title: string }[] }[] }`; `scrollspy.ts` exports `currentId(positions: { id: string; top: number }[], viewportTop: number, offset = 120): string | null`.
- Footer reads `import.meta.env.PUBLIC_VERSION`, `PUBLIC_COMMIT`, `PUBLIC_BRANCH`; the status dot is a placeholder until Task 9.

- [x] **Step 1: Tests**: `scrollspy.test.ts` returns the last section whose top is above `viewportTop + offset` and `null` above the first; `chrome.spec.ts`: at scroll 0 the header has no visible name; after scrolling past the hero the name and `/ experience` appear; clicking a rail entry scrolls to it and marks it `.on`; the current section's entries are expanded and others collapsed; under 960px wide the rail is hidden; the footer shows the stamp `v0.0.0`, the 7-char commit and branch.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement** per `docs/design.md` Header, Side index and Footer sections.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 5: Home sections (hero identity, experience, projects, education, about, writing)

**Files:**
- Create: `src/components/home/{Hero,Experience,Projects,Education,About,PhotoStack,Writing}.astro`, `src/components/home/photo-stack.ts`, `src/components/home/tenure.ts`, `src/pages/index.astro` (replace placeholder)
- Test: `tests/unit/tenure.test.ts`, `tests/unit/photo-stack.test.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `repo.listPublished`, `repo.getSingleton`, `renderMarkdown`.
- Produces: `tenure(start: string, end: string | null, now: Date): { years: number; widthPct: number }` with `widthPct = min(100, years / 6 * 100)`; `photo-stack.ts` exports `cycle<T>(order: T[]): T[]` (first to last) and `shouldSendBack(dx: number, dy: number): boolean` (true when `hypot > 90`).

- [x] **Step 1: Tests**:
  - `tenure.test.ts`: `tenure("2021-03","2022-12", ...)` is about 1.8 years and 30% width; `end: null` uses `now`; 8 years caps at 100.
  - `photo-stack.test.ts`: `cycle([a,b,c])` is `[b,c,a]`; `shouldSendBack(60, 60)` is false, `(80, 60)` is true.
  - `home.spec.ts`: each section has its color label; experience cards show a monogram and tenure bar; backend projects strip scrolls with the → button and confidential ones show "conf."; "Earlier engineering work" lists engineering projects; clicking a certificate opens a dialog with "Open original"; the photo stack sends the top photo back on Enter and updates "2 / n"; the writing list shows date, minutes and title; Resume pill links to `/resume.pdf`.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement** per `docs/design.md`; the hero right column is an empty terminal frame until Task 8.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 6: Post pages and writing index

**Files:**
- Create: `src/layouts/Post.astro`, `src/components/post/{Toc,CodeBlock,Callout}.astro`, `src/pages/writing/index.astro`, `src/pages/writing/[slug].astro`
- Test: `tests/e2e/post.spec.ts`

**Interfaces:**
- Consumes: `renderMarkdown` headings and minutes.

- [x] **Step 1: Test** `post.spec.ts`: body font is IBM Plex Serif at 18px with max width 68ch; the right index lists h2s and marks the current one while scrolling; "min left" decreases; the code block copy button puts the code on the clipboard; a draft slug returns 404; series navigation links to the previous and next parts.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement**; callouts use a Markdown directive `:::note` via `remark-directive`.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 7: Command palette and keyboard shortcuts

**Files:**
- Create: `src/components/site/Palette.astro`, `src/components/site/palette.ts`, `src/components/site/shortcuts.ts`, `src/pages/search-index.json.ts`
- Test: `tests/unit/palette.test.ts`, `tests/unit/shortcuts.test.ts`, `tests/e2e/palette.spec.ts`

**Interfaces:**
- Produces: `search(index: PaletteItem[], q: string): PaletteItem[]` (case-insensitive substring on label, hint and group; groups keep the order Sections, Experience, Projects, Writing, Education, About, Links, Actions); `PaletteItem = { group: string; label: string; hint: string; target: string; keys?: string[] }`; `createShortcuts(map: Record<string, () => void>, timeoutMs = 800)` handling two-key sequences like `g e`.

- [x] **Step 1: Tests**: `search(idx, "boca")` returns the About item; empty query returns all in group order; `shortcuts` fires `g e` within 800 ms and not after; keys are ignored while focus is in an input. E2E: `/` and `⌘K` open the modal; typing then Enter navigates; Esc closes and returns focus; each result shows its shortcut; at 390px width the bottom sheet opens with filter chips.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement** per `docs/design.md`; the index is a cached JSON endpoint (`s-maxage=300`) built from published content.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 8: Public API, live request feed and hero terminal

**Files:**
- Create: `src/lib/http/cache.ts`, `src/lib/feed/sanitize.ts`, `src/lib/feed/buffer.ts`, `src/pages/api/{me,experience,stack,now,requests}.ts`, `src/pages/internal/ingest.ts`, `src/components/home/Terminal.astro`, `src/components/home/terminal.ts`
- Test: `tests/unit/sanitize.test.ts`, `tests/unit/buffer.test.ts`, `tests/unit/cache.test.ts`, `tests/e2e/terminal.spec.ts`

**Interfaces:**
- Produces:
  - `cache.ts`: `cacheHeaders(kind: "page" | "api" | "requests" | "status" | "private"): Record<string, string>` returning the exact values in Global Constraints.
  - `sanitize.ts`: `sanitize(logEntry: unknown, now: number): FeedEntry | null`, reading `httpRequest.requestMethod`, `httpRequest.requestUrl`, `httpRequest.status`, `httpRequest.cacheHit`, `httpRequest.latency` from the Cloud Logging entry; `FeedEntry = { m: "GET" | "POST" | "HEAD"; p: string; s: number; c: "HIT" | "MISS"; ms: number; t: number }`; route allowlist `/`, `/writing`, `/writing/:slug`, `/api/(me|experience|stack|now|requests|status)`, `/rss.xml`, `/resume.pdf`; static assets under `/_astro/` and `/images/` are dropped.
  - `buffer.ts`: `createFeedBuffer({ max = 30, flushMs = 10_000, write: (entries: FeedEntry[]) => Promise<void>, read: () => Promise<FeedEntry[]> })` returning `{ push(e: FeedEntry): Promise<void> }`; on the first flush after a cold start it merges the stored entries before writing.
  - `ingest.ts`: `POST` accepts a Pub/Sub push body, verifies the OIDC token (audience = service URL, email = the push service account from env `PUSH_SA`), decodes `message.data`, calls `sanitize` then `buffer.push`, returns 204; any verification failure returns 401.
  - `/api/requests` returns `{ entries: FeedEntry[], updatedAt: number, stats: { rpm: number, p50: number, hitRatio: number } }`.
  - `terminal.ts`: `formatAgo(ms: number): string` (`"14 s ago"`, `"3 min ago"`); polls `/api/requests` every 5 s only while the terminal is intersecting the viewport and `document.visibilityState === "visible"`.
- [x] **Step 1: Tests**:
  - `sanitize.test.ts`: `/writing/live-request-log?utm=x` becomes `/writing/live-request-log`; `/wp-login.php` with 404 becomes `404 · unknown path`; `/admin/posts` with 200 returns null; `/<script>` returns null or the 404 bucket and never contains `<`; a 4 KB path returns null; output has no IP or user agent keys; `latency: "0.084s"` becomes `ms: 84`.
  - `buffer.test.ts` (fake timers): 50 pushes in 1 s cause one write with 30 entries; a push 10 s later causes a second write; a cold buffer with stored entries `[x, y]` writes `[new, x, y]`, never `[new]` alone.
  - `cache.test.ts`: each kind returns the exact header string.
  - `terminal.spec.ts`: on load the curl pane shows the `/api/me` JSON without interaction; clicking `/stack` changes it; the tail pane lists seeded feed entries with relative times; no request to `/api/requests` happens while the terminal is scrolled out of view.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement**; OIDC verification with `google-auth-library` `OAuth2Client.verifyIdToken`.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 9: Status endpoint and footer status dot

**Files:**
- Create: `src/lib/status/check.ts`, `src/pages/api/status.ts`, `src/components/site/StatusDot.astro`, `src/components/site/status-tooltip.ts`
- Test: `tests/unit/status.test.ts`, `tests/unit/status-tooltip.test.ts`, `tests/e2e/status.spec.ts`

**Interfaces:**
- Produces: `checkServices(deps): Promise<Status>`; `Status = { overall: "ok" | "warn" | "down"; checkedAt: number; services: { name: string; state: "ok" | "warn" | "down"; detail: string }[]; uptime30d: number | null }`; services: Website (CDN), App (Cloud Run), Database (Firestore), Storage, Public API, Live request log; the log is `warn` when `feed.updatedAt` is older than 120 s; `uptime30d` comes from the Monitoring API uptime check (`null` locally).
- `status-tooltip.ts`: `withinIntent(pointer: [number, number], center: [number, number], radius = 32): boolean`; `placeTooltip(pointer, size, viewport, offset = 16): [number, number]` flipping left and down at the edges.

- [x] **Step 1: Tests**: `status.test.ts`: Firestore read failure gives Database `down` and overall `down`; stale feed gives overall `warn`. `status-tooltip.test.ts`: `withinIntent([0,0],[20,20])` true, `([0,0],[40,40])` false; placement flips near the right edge. `status.spec.ts`: hovering the dot shows the `$ status` tooltip and it follows the pointer; moving 40 px away hides it; Tab focus shows it anchored; when `/api/status` is routed to fail, the dot turns red with label "Site status: major outage".
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement** per the footer section of `docs/design.md`.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 10: Images, resume and certificate files

**Files:**
- Create: `src/lib/images/process.ts`, `src/pages/resume.pdf.ts`, `storage.rules`, `scripts/migrate-images.ts`
- Test: `tests/unit/process.test.ts`

**Interfaces:**
- Produces: `processImage(input: Buffer, base: string, alt: string): Promise<ImageRef>` (writes three WebP variants to Storage at `images/${base}-${w}.webp`, rejects inputs over 15 MB or that sharp cannot decode); `/resume.pdf` streams `site/main.resumePath` from Storage with `cacheHeaders("page")` and `Content-Disposition: inline; filename="juan-almaraz-resume.pdf"`.

- [x] **Step 1: Tests**: a 2000px JPEG yields widths 480, 960, 1600 in WebP; a 600px image yields 480 and 600 (no upscaling) and `widths` reflects it; a text file rejects with "Unsupported image".
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement**; `migrate-images.ts` reads the old repo's `assets/img/portfolio/**` and calls `processImage`.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 11: Admin

**Files:**
- Create: `src/lib/auth/admin.ts`, `src/middleware.ts`, `src/pages/admin/index.astro`, `src/pages/admin/[collection]/[id].astro`, `src/pages/admin/api/{save,upload,revisions,restore,session}.ts`, `src/components/admin/{Editor,ImageUpload,RevisionList}.astro`, `firestore.rules`
- Test: `tests/unit/admin-auth.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `repo.saveWithRevision`, `repo.listRevisions`, `repo.restoreRevision`, `processImage`, schemas.
- Produces: `requireAdmin(request: Request): Promise<{ email: string }>` throwing a 403 `Response` unless the session cookie holds a valid Firebase session for `ADMIN_EMAIL`; session cookie `__session` (the only cookie Firebase Hosting forwards), 5 days, `HttpOnly; Secure; SameSite=Strict`.
- Firestore rules deny all client reads and writes; only the Admin SDK touches data.

- [x] **Step 1: Tests**: `admin-auth.test.ts`: allowlisted email passes; another verified email gets 403; expired cookie gets 403. `admin.spec.ts` (Auth emulator): non-admin sees 403 on `/admin` and on `POST /admin/api/save`; admin edits a post in the Markdown editor with live preview, saves as draft (not on `/writing`), publishes (appears on `/writing`), sees two revisions and restores the first; uploads an image and gets three variants; uploads a new resume and `/resume.pdf` serves it.
- [x] **Step 2: Run**, expect FAIL.
- [x] **Step 3: Implement**; the editor validates with the zod schema before saving and shows field errors inline.
- [x] **Step 4: Run**, expect PASS.
- [x] **Step 5: Review**: leave uncommitted.

### Task 12: Discoverability and analytics

**Files:**
- Create: `src/pages/rss.xml.ts` (`@astrojs/rss`), `src/pages/sitemap.xml.ts`, `public/og.png`, `public/robots.txt`
- Modify: `src/layouts/Base.astro` (OG and Twitter meta, canonical, RSS link, Cloudflare Web Analytics beacon with token from `PUBLIC_CF_BEACON`)
- Test: `tests/e2e/seo.spec.ts`

- [ ] **Step 1: Test**: `/rss.xml` is valid RSS listing only published posts; `/sitemap.xml` lists `/`, `/writing` and every published post; every page has `og:title`, `og:description`, `og:image` and a canonical URL on `https://juanalmaraz.dev`; `/admin` is disallowed in `robots.txt`.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

## AWS migration

Tasks R1 to R7 move what Tasks 1 to 11 built off Firebase and GCP, keeping every existing test's intent.
Until R6 removes them, the Firebase emulators keep running next to the Docker services for the pieces not yet moved; `pnpm check` must stay green after every task.
Read the spec (`docs/superpowers/specs/2026-11-12-aws-migration-design.md`) first.

### Task R1: AWS clients and local services

**Files:**
- Create: `src/lib/aws.ts`, `docker-compose.yml`, `scripts/local-aws.ts`
- Modify: `package.json` (scripts), `.github/workflows/ci.yml`
- Test: `tests/unit/aws.test.ts`

**Interfaces:**
- Produces:
  - `interface AwsConfig { region: string; table: string; bucket: string; local: boolean }`
  - `resolveAwsConfig(env: Record<string, string | undefined>): AwsConfig`: `local` is true when `AWS_ENDPOINT_URL_DYNAMODB` is set; local defaults are region `us-east-2`, table `juanalmaraz-site-local`, bucket `juanalmaraz-media-local`; outside local, `TABLE_NAME` and `MEDIA_BUCKET` are required and `AWS_REGION` defaults to `us-east-2`.
  - `config(): AwsConfig` (memoized from `process.env`), `ddb(): DynamoDBDocumentClient` (with `removeUndefinedValues: true`, the equivalent of Firestore's `ignoreUndefinedProperties`), `s3(): S3Client` (`forcePathStyle` when local), all lazy singletons; local mode uses dummy credentials and the SDK's standard `AWS_ENDPOINT_URL_DYNAMODB` / `AWS_ENDPOINT_URL_S3` env vars.
  - `type SecretName = 'session-key' | 'cognito-client-secret'`; `createSecretStore(fetch: (name: SecretName) => Promise<string>): (name: SecretName) => Promise<string>` caches each value per process and shares one in-flight fetch; `secret` is that store over SSM `GetParameter` (`/juanalmaraz/<name>`, `WithDecryption`), or over env `SESSION_KEY` / `COGNITO_CLIENT_SECRET` when local; a missing value throws `Missing secret <name>`.
  - `docker-compose.yml`: `amazon/dynamodb-local` (pinned tag, in-memory) on port 8000 and a local S3-compatible server on port 9000 that is free to use without an account or auth token; both with healthchecks so `docker compose up -d --wait` blocks until ready.
  - `scripts/local-aws.ts`: idempotently creates the local table (`pk`/`sk` strings) and bucket (with CORS allowing `POST` from `http://localhost:*`); exports `resetTable(): Promise<void>` for tests.
  - `package.json`: a `services` script (`docker compose up -d --wait && tsx scripts/local-aws.ts`); `test`, `e2e` and `dev` run `pnpm services` first.

- [ ] **Step 1: Tests** in `aws.test.ts`:
  - `resolveAwsConfig({ AWS_ENDPOINT_URL_DYNAMODB: 'http://localhost:8000' })` equals `{ region: 'us-east-2', table: 'juanalmaraz-site-local', bucket: 'juanalmaraz-media-local', local: true }`.
  - `resolveAwsConfig({})` throws `TABLE_NAME and MEDIA_BUCKET must be set outside local services`.
  - `resolveAwsConfig({ TABLE_NAME: 't', MEDIA_BUCKET: 'b' })` equals `{ region: 'us-east-2', table: 't', bucket: 'b', local: false }`.
  - A store built with a counting fetch returns the same value for two concurrent and one later call of `'session-key'`, with the fetch called once.
  - A store whose fetch returns `''` rejects with `Missing secret session-key`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/aws.test.ts`, expect FAIL.
- [ ] **Step 3: Implement**; add `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/client-ssm`; in `ci.yml`, run `docker compose up -d --wait` before `pnpm check` (keep the Java setup until R6).
- [ ] **Step 4: Run** `pnpm test`, expect PASS, and `docker compose ps` shows both services healthy.
- [ ] **Step 5: Review**: leave uncommitted.

### Task R2: Content store on DynamoDB

**Files:**
- Modify: `src/lib/content/repo.ts`, `src/pages/admin/api/save.ts`, `scripts/seed.ts` (content writes)
- Test: `tests/unit/repo.test.ts`

**Interfaces:**
- Consumes: `ddb()`, `config()` from R1; `resetTable()` from `scripts/local-aws.ts`.
- Produces (same signatures as today): `listPublished`, `getPublished`, `getSingleton`, `saveWithRevision(collection, id, data, savedBy, { create })`, `listAll`, `getRaw`, `listRevisions(collection, id, limit = 20)`, `restoreRevision`, and the types `Collection`, `Doc`, `Revisable`, `Revision`; plus `MAX_DOC_BYTES = 350 * 1024`, `class AlreadyExistsError extends Error`, `class DocumentTooLargeError extends Error`.
  - Keys follow the Data Model: collections use `pk = collection`, `sk = id`; `about` and `site` use `sk = 'main'`; revisions use `pk = rev#<collection>#<id>`, `sk = <savedAt ISO>#<6 random chars>`, and `Revision.id` is that `sk`.
  - `saveWithRevision` writes the document and its revision in one `TransactWriteItems`; with `create`, the document put has `attribute_not_exists(pk)` and a failed condition throws `AlreadyExistsError`; a document whose `JSON.stringify` is over `MAX_DOC_BYTES` bytes throws `DocumentTooLargeError` before any write.
  - Reads strip `pk`, `sk` and `expiresAt`; schema validation and in-memory sorting stay as today.
  - `getFeed` and `saveFeed` stay on Firestore until R3.
  - `save.ts` maps `AlreadyExistsError` to 409 `{ errors: { id: 'Already exists' } }` and `DocumentTooLargeError` to 413 `{ error: 'Document too large (max 350 KB)' }`.

- [ ] **Step 1: Tests** in `repo.test.ts` against DynamoDB Local, `resetTable()` before each:
  - The three existing cases keep passing: `listPublished` excludes drafts and orders by `publishedAt` desc; it skips documents that fail their schema; `restoreRevision` writes the snapshot back and adds a revision.
  - `saveWithRevision('posts', 'a', doc, 'o', { create: true })` on an existing `a` rejects with `AlreadyExistsError`, and `getRaw('posts', 'a')` still returns the original.
  - A post with `bodyMd: 'x'.repeat(351 * 1024)` rejects with `DocumentTooLargeError`, and `listRevisions('posts', id)` is empty.
  - Three saves then `listRevisions(c, id, 2)` returns the two newest, newest first.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement**; `scripts/seed.ts` defaults `AWS_ENDPOINT_URL_DYNAMODB` to `http://localhost:8000` and keeps writing through `repo.ts`.
- [ ] **Step 4: Run** `pnpm check`, expect PASS (admin save e2e included).
- [ ] **Step 5: Review**: leave uncommitted.

### Task R3: Live request feed from the middleware

**Files:**
- Create: `src/lib/feed/store.ts`, `src/lib/feed/capture.ts`
- Modify: `src/lib/content/schemas.ts` (`FeedEntrySchema.c`), `src/lib/feed/sanitize.ts`, `src/lib/feed/stats.ts`, `src/middleware.ts`, `src/pages/api/requests.ts`, `src/components/home/terminal.ts`, `src/lib/status/deps.ts` (import `getFeed` from the store), `src/lib/status/check.ts` (`Deps.getFeed` stats carry `coldRatio`; the `Website (CDN)` row shows `-` until R6 renames the rows), `tests/unit/status.test.ts` (matching fixture), `src/lib/content/repo.ts` (remove `getFeed`, `saveFeed`, `Feed`), `scripts/seed.ts` (feed entries), `docs/design.md` (`--g-info` row reads "Cold start, functions")
- Delete: `src/lib/feed/buffer.ts`, `src/pages/internal/ingest.ts`, `tests/unit/buffer.test.ts`, `tests/unit/ingest.test.ts`; remove `google-auth-library`
- Test: `tests/unit/sanitize.test.ts`, `tests/unit/stats.test.ts`, `tests/unit/feed-store.test.ts`, `tests/unit/capture.test.ts`, `tests/e2e/terminal.spec.ts`

**Interfaces:**
- Consumes: `ddb()`, `config()` from R1.
- Produces:
  - `FeedEntry.c: 'cold' | 'warm'`.
  - `interface RequestFacts { method: string; path: string; status: number; ms: number; cold: boolean; t: number }`; `sanitize(facts: RequestFacts): FeedEntry | null` keeps today's allowlist, `404 · unknown path` bucket, 200-char limit and dropped prefixes, and also drops `/api/health`.
  - `feedStats(entries: FeedEntry[], now: number): { rpm: number; p50: number; coldRatio: number }` (`coldRatio` rounded to 2 decimals like `hitRatio` was).
  - `store.ts`: `putEntry(e: FeedEntry): Promise<void>` (item per the Data Model, `expiresAt = Math.floor(e.t / 1000) + 86_400`); `interface Feed { entries: FeedEntry[]; updatedAt: number; stats: ReturnType<typeof feedStats> }`; `getFeed(limit = 30): Promise<Feed>` queries `pk = feed` newest first, skips items failing `FeedEntrySchema`, `updatedAt` is the newest `t` or 0.
  - `capture.ts`: `takeColdFlag(): boolean` returns `true` exactly once per process; `recordRequest(facts: RequestFacts, put = putEntry): Promise<void>` sanitizes, awaits `put` for kept entries, and on any error logs `feed write failed: <error name>` and resolves.
  - `middleware.ts`: for every request outside `/internal/*`, takes the cold flag before handling, measures the handler with `performance.now()`, and awaits `recordRequest` with `url.pathname` before returning; a thrown handler error is recorded as status 500 and rethrown; requests under `/internal/*` neither take the cold flag nor get recorded.
  - `/api/requests` returns `getFeed()` with `cacheHeaders('requests')`.
  - The terminal renders `c` as `cold` or `warm`, with `cold` using the class and color `HIT` used.

- [ ] **Step 1: Tests**:
  - `sanitize.test.ts`, with facts input: `/writing/live-request-log` kept; `/wp-login.php` with 404 becomes `404 · unknown path`; `/admin/posts` with 200 returns null; `/<script>` returns null or the 404 bucket and never contains `<`; a 4 KB path returns null; `/api/health` returns null; output has no IP or user agent keys; `cold: true` gives `c: 'cold'`, `cold: false` gives `c: 'warm'`; `ms: 84` stays 84.
  - `stats.test.ts`: three entries with one `cold` give `coldRatio: 0.33`.
  - `feed-store.test.ts` (DynamoDB Local): 35 `putEntry` calls, then `getFeed()` returns the 30 newest, newest first; `updatedAt` is the newest `t`; the stored item's `expiresAt` equals `Math.floor(t / 1000) + 86_400`; an item with `c: 'HIT'` written directly is skipped.
  - `capture.test.ts`: `takeColdFlag()` is `true` then `false`; `recordRequest` with a `put` rejecting a `ProvisionedThroughputExceededException` resolves and logs `feed write failed: ProvisionedThroughputExceededException`; a dropped path never calls `put`.
  - `terminal.spec.ts`: seeded entries show `cold` and `warm`; after visiting `/writing`, the tail pane lists `/writing` within one poll; the existing out-of-view polling test still passes.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm check`, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task R4: Media on S3

**Files:**
- Modify: `src/lib/images/process.ts`, `src/lib/images/url.ts`, `src/pages/admin/api/upload.ts`, `src/pages/resume.pdf.ts`, `src/components/admin/ImageUpload.astro`, `scripts/seed.ts` (images, resume), `scripts/migrate-images.ts`
- Test: `tests/unit/process.test.ts`, `tests/unit/upload.test.ts`, `tests/unit/resume.test.ts`, `tests/e2e/admin.spec.ts` (upload), `tests/e2e/resume.spec.ts`

**Interfaces:**
- Consumes: `s3()`, `config()` from R1; `getRaw`, `saveWithRevision` from R2.
- Produces:
  - `processImage(input, base, alt, opts)` unchanged in signature and rules; writes `objectPath(base, w)` to the media bucket with `ContentType: image/webp` and `CacheControl: public, max-age=31536000, immutable`.
  - `imageUrl(ref, width, env)` returns `/images/${base}-${w}.webp` (same origin, through CloudFront) outside local, and `${AWS_ENDPOINT_URL_S3}/${bucket}/images/${base}-${w}.webp` when local.
  - `POST /admin/api/upload` with JSON body:
    - `{ step: 'presign', kind: 'image' | 'resume' }` returns `{ url, fields, key }` from `createPresignedPost`, `key = incoming/<crypto.randomUUID()>`, condition `content-length-range` of 1 to 15 MB for images and 1 to 5 MB for the resume, expiring in 300 s; add `@aws-sdk/s3-presigned-post`.
    - `{ step: 'process', kind: 'image', key, name, alt }` downloads the key, runs `processImage(bytes, baseFor(name), alt)`, deletes the key and returns `{ ref, preview }` as today.
    - `{ step: 'process', kind: 'resume', key }` checks the `%PDF-` signature and the 5 MB cap, writes it to `site.resumePath` (default `files/resume/juan-almaraz.pdf`), deletes the key and returns 204.
    - A `key` not matching `^incoming/[0-9a-f-]{36}$` returns 400 `{ error: 'Invalid upload key' }` without touching S3.
  - The browser uploads straight to the presigned URL with `FormData`, then calls the `process` step.
  - `/resume.pdf` streams `site.resumePath` with `GetObject`, keeping today's headers.

- [ ] **Step 1: Tests**:
  - `process.test.ts` (local S3): the existing three (a 2000px JPEG yields 480, 960, 1600 WebP; a 600px image yields 480 and 600 and `widths` reflects it; a text file rejects with `Unsupported image`), plus each written object has `ContentType` `image/webp`.
  - `upload.test.ts` (route handler with local S3 and a stub `locals.adminEmail`): presign returns a `key` matching `^incoming/[0-9a-f-]{36}$` and `fields.Policy`; `process` with key `images/x` or `incoming/../site` returns 400 `Invalid upload key`; processing an uploaded PNG returns a `ref` and leaves no object under `incoming/`; a resume over 5 MB or without `%PDF-` returns 400 `Not a PDF (max 5 MB)`.
  - `resume.test.ts` and `resume.spec.ts`: unchanged expectations (inline disposition, filename `juan-almaraz-resume.pdf`).
  - `admin.spec.ts`: uploading a photo through the editor shows its preview image.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm check`, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task R5: Admin auth through Cognito with Google

**Files:**
- Create: `src/lib/auth/session.ts`, `src/lib/auth/cognito.ts`, `src/lib/admin/fetch.ts`, `src/pages/admin/api/signin.ts`, `src/pages/admin/api/callback.ts`, `src/pages/admin/api/logout.ts`, `lambdas/presignup/index.mjs`
- Modify: `src/lib/auth/admin.ts`, `src/middleware.ts` (public admin routes), `src/pages/admin/login.astro`, `src/components/admin/{Editor,ImageUpload,RevisionList}.astro` and `src/layouts/Admin.astro` (use `adminFetch`, sign-out via `/admin/api/logout`)
- Delete: `src/pages/admin/api/session.ts`; remove `firebase` (web SDK)
- Test: `tests/unit/session.test.ts`, `tests/unit/cognito.test.ts`, `tests/unit/callback.test.ts`, `tests/unit/admin-fetch.test.ts`, `tests/unit/presignup.test.ts`, `tests/unit/admin-auth.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `secret('session-key')`, `secret('cognito-client-secret')`, `ddb()` from R1; `isAdmin`, `forbidden`, `requireAdmin`, `SESSION_COOKIE = '__session'`, `SESSION_DAYS = 5` from `admin.ts`.
- Env: `ADMIN_EMAIL`, `SITE_URL` (`https://juanalmaraz.dev`), `COGNITO_DOMAIN` (`https://<prefix>.auth.us-east-2.amazoncognito.com`), `COGNITO_CLIENT_ID`, `COGNITO_USER_POOL_ID`.
- Produces:
  - `signSession(email: string, now: number, key: string): string` returns `base64url(JSON {e, iat, exp}) + '.' + base64url(HMAC-SHA256)`, `exp = iat + 5 days`; `verifySession(token: string, now: number, key: string): { email: string; iat: number } | null` compares signatures with `timingSafeEqual` and returns null for malformed, expired or badly signed tokens.
  - `admin.ts` live verifier: `verifySession` with the session key, then rejects when `iat` is earlier than `sessionsValidAfter` on item `auth/main`; returns `{ email, email_verified: true }`, so `requireAdmin` and `isAdmin` keep their contracts.
  - `cognito.ts`: `authorizeUrl(state: string, codeChallenge: string, env = process.env): string` (`response_type=code`, `scope=openid email`, `identity_provider=Google`, `code_challenge_method=S256`, `redirect_uri=${SITE_URL}/admin/api/callback`); `exchangeCode(code: string, verifier: string, fetchImpl = fetch): Promise<string>` posts to `${COGNITO_DOMAIN}/oauth2/token` with HTTP Basic client id and secret and returns the `id_token`, throwing on non-200; `verifyIdToken(idToken: string): Promise<{ email?: string; email_verified?: boolean }>` with `aws-jwt-verify` (`tokenUse: 'id'`, the client id).
  - `GET /admin/api/signin`: creates `state` and a PKCE verifier, stores both in cookie `__oauth` (`HttpOnly; Secure; SameSite=Lax; Path=/admin/api/callback; Max-Age=600`) and redirects 302 to `authorizeUrl`.
  - `GET /admin/api/callback`: state must equal the cookie's (constant time), then exchange, verify, `isAdmin`; success sets `__session` (`Path=/admin; Max-Age=432000; HttpOnly; Secure; SameSite=Lax`), clears `__oauth` and redirects 302 to `/admin`; any failure returns `forbidden()` with no `__session` cookie.
  - `POST /admin/api/logout`: sets `auth/main.sessionsValidAfter = now` (signing out revokes every session, as today), clears `__session`, returns `{ logoutUrl }` for Cognito's `/logout` with `logout_uri=${SITE_URL}/admin/login`.
  - Middleware public admin routes: `/admin/login`, `/admin/api/signin`, `/admin/api/callback`.
  - `adminFetch(url: string, init?: RequestInit & { body?: string }): Promise<Response>` sets `x-amz-content-sha256` to the hex SHA-256 of the body when there is one (CloudFront OAC requirement for bodies to the Function URL); every admin `POST` uses it, so admin bodies are JSON strings.
  - `lambdas/presignup/index.mjs`: `handler(event)` throws `Error('Not allowed')` unless `event.request.userAttributes.email` lowercased equals `process.env.ADMIN_EMAIL` lowercased; otherwise returns `event`.

- [ ] **Step 1: Tests**:
  - `session.test.ts`: sign then verify returns the email; a changed payload, a changed signature, the wrong key, `now` past `iat + 5 days`, and `'garbage'` all return null.
  - `cognito.test.ts`: `authorizeUrl` includes `identity_provider=Google`, `code_challenge_method=S256` and the encoded `redirect_uri`; `exchangeCode` sends `Authorization: Basic base64(id:secret)`, `grant_type=authorization_code` and `code_verifier`, and throws on a 400; `verifyIdToken` accepts a token signed by a local RSA key preloaded with the verifier's `cacheJwks`, and rejects an access token (`token_use: access`).
  - `callback.test.ts` (verifier and exchange stubbed): a state mismatch returns 403 with no `__session`; a non-allowlisted email returns 403 with no `__session`; the owner gets 302 to `/admin` and a `__session` cookie with exactly `Path=/admin; Max-Age=432000; HttpOnly; Secure; SameSite=Lax`.
  - `admin-fetch.test.ts`: body `abc` gets `x-amz-content-sha256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; a body-less GET gets no such header.
  - `presignup.test.ts`: the owner's email in any case passes; any other email throws `Not allowed`.
  - `admin-auth.test.ts`: a valid owner session passes; a valid session for another email is 403; a session with `iat` before `sessionsValidAfter` is 403.
  - `admin.spec.ts`: `signInAs` sets a `__session` minted with `signSession` and the test key (`SESSION_KEY=test-session-key-not-secret` in the Playwright `webServer` env); without a session every admin page and API is 403; a cookie signed with another key is 403; a minted session for a non-allowlisted email is 403; after `POST /admin/api/logout`, the previous cookie is 403; the existing editor tests pass signed in.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement**; add `aws-jwt-verify`; `login.astro` shows one "Sign in with Google" link to `/admin/api/signin`.
- [ ] **Step 4: Run** `pnpm check`, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task R6: Status, health, uptime probe and Firebase removal

**Files:**
- Create: `src/pages/api/health.ts`, `src/lib/status/uptime.ts`, `lambdas/probe/index.mjs`
- Modify: `src/lib/status/check.ts`, `src/lib/status/deps.ts`, `src/components/site/StatusDot.astro` (fallback labels), `docs/design.md` (status rows), `package.json` (drop the emulator wrappers; remove `firebase-admin`, `firebase-tools`), `playwright.config.ts`, `.github/workflows/ci.yml` (drop Java)
- Delete: `src/lib/firebase.ts`, `firebase.json`, `firestore.rules`, `storage.rules`, `tests/unit/firebase.test.ts`
- Test: `tests/unit/uptime.test.ts`, `tests/unit/probe.test.ts`, `tests/unit/status.test.ts`, `tests/e2e/status.spec.ts`

**Interfaces:**
- Consumes: `ddb()`, `config()`, `s3()` from R1; `getFeed` from R3.
- Produces:
  - `GET /api/health`: `GetItem` on `site/main`; 200 `{ ok: true }` or 503 `{ ok: false }`, both `Cache-Control: no-store`.
  - `PROBE_INTERVAL_MS = 300_000`; `uptimeRatio(days: { day: string; ok: number }[], firstProbeAt: number | null, now: number, windowMs = 30 * 86_400_000): number | null`: null when `firstProbeAt` is null; otherwise `start = max(now - windowMs, firstProbeAt)`, `expected = max(1, floor((now - start) / PROBE_INTERVAL_MS))`, sum `ok` over days on or after `start`'s UTC day, result `min(1, sum / expected)` rounded to 4 decimals.
  - `deps.ts`: `pingDb` = `GetItem` on `site/main`; `bucketExists` = `HeadBucket`; `uptime` = query `pk = uptime` with `sk` between the window's first and last UTC day plus `GetItem` on `uptime/first`, then `uptimeRatio`.
  - `Deps.getFeed` returns `{ entries: number; updatedAt: number; stats: { p50: number; coldRatio: number } }`.
  - Service rows, in order: `Website (CloudFront)` (state ok, detail `-`), `App (Lambda)` (detail `p50 <p50> ms · <coldRatio %>% cold`, or `-` without data), `Database (DynamoDB)`, `Media (S3)` (`bucket found` / `bucket missing`), `Public API`, `Live request log`; logic otherwise unchanged.
  - `StatusDot.astro` fallback when `/api/status` fails shows `App (Lambda)` as `down` / `unreachable`.
  - `lambdas/probe/index.mjs`: `handler(event, deps = liveDeps)` with `deps = { now(): number; fetch: typeof fetch; addOk(day: string, expiresAt: number): Promise<void>; markFirst(t: number): Promise<void> }`; fetches `${SITE_URL}/api/health` with a 5 s timeout; on 200 calls `addOk(<UTC day>, <day + 35 days in s>)` (`UpdateItem ADD ok 1`) and `markFirst(now)` (`attribute_not_exists`, condition failures ignored) and returns `{ ok: true }`; on any other outcome writes nothing and returns `{ ok: false }`.
  - `package.json`: `test` = `pnpm services && vitest run`, `e2e` = `pnpm services && playwright test`.

- [ ] **Step 1: Tests**:
  - `uptime.test.ts`: `firstProbeAt` null gives null; first probe 1 h ago with 12 ok gives 1; first probe 1 h ago with 6 ok gives 0.5; first probe 60 days ago with 8,640 ok in the window gives 1; first probe 2 days ago with no day items (probe stopped) gives 0; ok counts on days before the window start are ignored.
  - `probe.test.ts`: health 200 calls `addOk` once with today's UTC day and `markFirst` once; health 503 calls neither and returns `{ ok: false }`; a fetch that times out calls neither and resolves `{ ok: false }`.
  - `status.test.ts`: the row names equal the list above in order; with `p50: 84` and `coldRatio: 0.33` the App detail is `p50 84 ms · 33% cold`; the existing deadline and stale-log cases keep passing.
  - `status.spec.ts`: with `/api/status` aborted the dot is red and the tooltip lists `App (Lambda)` as unreachable; `GET /api/health` returns 200 with `cache-control: no-store`.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm check`, expect PASS, and `grep -rEi "firebase|firestore|google-auth|gcloud|cloud run" src scripts tests package.json playwright.config.ts .github` prints nothing.
- [ ] **Step 5: Review**: leave uncommitted.

### Task R7: Lambda container image

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `src/pages/internal/ready.ts`
- Test: `scripts/smoke-image.sh`

**Interfaces:**
- Produces:
  - `Dockerfile`: multi-stage on `node:24-slim` for `linux/arm64`; installs with `pnpm install --frozen-lockfile`; builds with build args `PUBLIC_VERSION`, `PUBLIC_COMMIT`, `PUBLIC_BRANCH`; the runtime stage keeps production dependencies only, runs as the `node` user, copies Lambda Web Adapter from `public.ecr.aws/awsguru/aws-lambda-adapter` (pinned version) to `/opt/extensions/lambda-adapter`, and sets `PORT=8080`, `HOST=0.0.0.0`, `AWS_LWA_READINESS_CHECK_PATH=/internal/ready`, `CMD ["node", "dist/server/entry.mjs"]`.
  - `GET /internal/ready` returns 200 `ok` with no dependency calls; it never takes the cold flag or reaches the feed (R3 rule), so a cold start is still reported on the first real request.
  - `scripts/smoke-image.sh`: builds the image, runs it against the Docker services from R1, and fails unless `/internal/ready`, `/`, `/api/me` and `/api/health` return 200 and the image is under 500 MB.

- [ ] **Step 1: Write** `scripts/smoke-image.sh` with the checks above.
- [ ] **Step 2: Run** it, expect FAIL (no Dockerfile).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm services && scripts/smoke-image.sh`, expect PASS; then `pnpm check`, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 13: Infrastructure (Terraform)

**Files:**
- Create: `infra/bootstrap/main.tf` (state bucket), `infra/{versions,providers,variables,outputs,main}.tf`, `infra/{ecr,lambda,dynamodb,s3,cloudfront,certificate,dns,cognito,scheduler,ssm,iam,pipeline,budget}.tf`, `infra/tests/main.tftest.hcl`, `infra/.tflint.hcl`, `infra/README.md`
- Modify: `.github/workflows/ci.yml` (a `terraform` job on changes under `infra/`)

**Interfaces:**
- Consumes: the R7 image, `lambdas/probe` and `lambdas/presignup` (zipped by Terraform's `archive_file`), `buildspec.yml` path (Task 14).
- Variables: `domain = "juanalmaraz.dev"`, `admin_email`, `google_client_id`, `cloudflare_zone_id`, `github_repo = "almarazj/juanalmaraz.dev"`, `initial_image_tag`.
- Produces outputs: `distribution_domain`, `distribution_id`, `function_url`, `function_name`, `table_name`, `bucket_name`, `user_pool_id`, `cognito_domain`, `cognito_client_id`, `ecr_repository_url`, `connection_arn`, `pipeline_name`.
- Resources, with the values the spec pins:
  - Providers: `aws` default `us-east-2`, alias `us_east_1` used only by the ACM certificate; `cloudflare`; backend S3 in `us-east-2` with `use_lockfile = true`; the state bucket (bootstrap) is private, versioned and encrypted.
  - ECR repository `juanalmaraz-site` with a lifecycle policy keeping the last 5 images.
  - Lambda `juanalmaraz-site`: image from ECR, `arm64`, 1024 MB, 30 s, alias `live`, Function URL on `live` with `authorization_type = "AWS_IAM"`, log group with 14-day retention, env `ADMIN_EMAIL`, `SITE_URL`, `TABLE_NAME`, `MEDIA_BUCKET`, `COGNITO_*`; `ignore_changes` on the image URI and the alias version; reserved concurrency 2 only if `aws lambda get-account-settings` allows it, otherwise a comment saying why not.
  - Execution role: DynamoDB actions on the table only, S3 actions on `images/*`, `files/*` and `incoming/*` only, `ssm:GetParameter` on `/juanalmaraz/*` only, logs.
  - DynamoDB `juanalmaraz-site`: `PROVISIONED`, read and write capacity within 25 each, TTL on `expiresAt`, point-in-time recovery off unless free.
  - S3 media bucket: Block Public Access all on, OAC-only bucket policy, CORS allowing `POST` from `https://${domain}`, lifecycle expiring `incoming/` after 1 day.
  - CloudFront: ACM certificate (us-east-1, DNS-validated through Cloudflare records); default behavior to the Function URL through an OAC of type `lambda`, origin request policy forwarding all viewer headers except `Host`, cookies and query strings, cache policy honoring origin headers (min TTL 0); `/admin/*` caching disabled; `/internal/*` answered 404 by a CloudFront Function; `/images/*` and `/files/*` to S3 through an OAC of type `s3`; `aws_lambda_permission` for `cloudfront.amazonaws.com` with the distribution as source.
  - Cloudflare: the validation records and `juanalmaraz.dev` pointing at the distribution, `proxied = false`.
  - Cognito: user pool with Google IdP (client id variable, secret from SSM `/juanalmaraz/google-client-secret`), prefix domain, app client (code flow, PKCE, secret, callback `https://${domain}/admin/api/callback`, logout `https://${domain}/admin/login`, scopes `openid email`), pre sign-up trigger `lambdas/presignup`; the generated client secret written to SSM `/juanalmaraz/cognito-client-secret` (`SecureString`).
  - Probe: Lambda `juanalmaraz-probe` (zip, Node 24, arm64, 128 MB, 10 s) whose role can only `UpdateItem`/`PutItem` items with `pk = uptime` (`dynamodb:LeadingKeys`); EventBridge Scheduler `rate(5 minutes)` with its own invoke role.
  - Pipeline: CodeConnections connection to GitHub (owner finishes the handshake), CodePipeline V2 with a git trigger on tags `v*` only, a source action using full clone, one CodeBuild project (arm64, privileged) reading `buildspec.yml`, an artifact bucket expiring objects after 7 days; least-privilege roles per the spec; a pipeline-level variable `EXPECTED_VERSION_OVERRIDE` defaulting to empty.
  - Budget: `aws_budgets_budget` imported from `672027759414:monthly-1usd` with an `import` block, matching the existing settings exactly.
- `infra/README.md` records the manual steps: bootstrap the state bucket, create the Google OAuth client (redirect URI `https://<cognito prefix>.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`), put `/juanalmaraz/google-client-secret` and `/juanalmaraz/session-key` (`openssl rand -base64 48`) in SSM, first apply in two phases (`-target` the ECR repository, push the R7 image as `initial_image_tag`, then full apply), finish the CodeConnections handshake, and note that the probe measures from inside AWS.

- [ ] **Step 1: Spike the tag trigger** with a throwaway pipeline in a scratch directory outside the repo: a connection, a CodePipeline V2 pipeline triggering on tags `spike-*` and a no-op CodeBuild project; pushing tag `spike-1` starts exactly one execution and pushing a branch starts none. Destroy the spike and delete the tag. If tag triggers do not work, stop and report to the owner with the observed behavior; never fall back to branch triggers.
- [ ] **Step 2: Tests** in `infra/tests/main.tftest.hcl` with mocked providers: the function's architectures are `["arm64"]`, memory 1024 and timeout 30; the Function URL uses `AWS_IAM`; table billing mode is `PROVISIONED` with capacities at most 25; the media bucket blocks all public access; the pipeline trigger includes only tags `v*` and has no branch filter; the ECR lifecycle keeps 5 images; log retention is 14 days; the scheduler expression is `rate(5 minutes)`; the budget limit is 1 USD.
- [ ] **Step 3: Run** `terraform -chdir=infra test`, expect FAIL.
- [ ] **Step 4: Implement**; `terraform fmt -check -recursive`, `terraform validate` and `tflint` (aws ruleset) run clean locally and in CI.
- [ ] **Step 5: Run** `terraform -chdir=infra test`, expect PASS.
- [ ] **Step 6: Plan against the real account** (owner runs `terraform plan` with `AWS_PROFILE=juanalmaraz`), expect only creates plus the budget import; the owner applies following `infra/README.md`.
- [ ] **Step 7: Verify**: `curl -sI https://juanalmaraz.dev/api/health` is 200 with `cache-control: no-store`; the raw Function URL returns 403; `https://juanalmaraz.dev/internal/ready` returns 404; a direct S3 object URL returns 403; the owner can sign in to `/admin` with Google and another Google account is refused at sign-up; after 15 minutes `/api/status` shows a non-null `uptime30d`.
- [ ] **Step 8: Review**: leave uncommitted.

### Task 14: Release pipeline

**Files:**
- Create: `buildspec.yml`, `scripts/release-check.sh`, `tests/e2e/deployed.spec.ts`, `playwright.deployed.config.ts`
- Modify: `package.json` (`e2e:deployed`)
- Test: `tests/unit/release-check.test.ts`, `tests/e2e/deployed.spec.ts`

**Interfaces:**
- Consumes: Task 13 outputs as CodeBuild environment variables (`ECR_REPOSITORY_URL`, `FUNCTION_NAME`, `DISTRIBUTION_ID`, `FUNCTION_URL`), the tag name from the pipeline source variables as `RELEASE_TAG`, and `EXPECTED_VERSION_OVERRIDE`.
- Produces:
  - `scripts/release-check.sh`: exits 0 only when `RELEASE_TAG` equals `v` + the `package.json` version and `git merge-base --is-ancestor HEAD origin/main` succeeds; otherwise exits 1 printing `tag <tag> does not match package.json <version>` or `tagged commit is not on main`.
  - `buildspec.yml` phases: install (Node 24, pnpm via corepack, Docker Compose); pre_build (`release-check.sh`, `pnpm install --frozen-lockfile`, `pnpm check`); build (arm64 image with the three `PUBLIC_*` build args, tagged `vX.Y.Z` and the 7-char SHA, pushed to ECR); post_build (`update-function-code`, `wait function-updated-v2`, `publish-version`, remember the alias's previous version, `update-alias live`, CloudFront invalidation of `/*` and wait, then `pnpm e2e:deployed` inside the official Playwright image pinned to the repo's Playwright version; if it fails, move `live` back to the previous version, invalidate `/*` again and exit 1).
  - `deployed.spec.ts` runs against `BASE_URL=https://juanalmaraz.dev` with `EXPECTED_VERSION` (the override when set, else the tag's version).

- [ ] **Step 1: Tests**:
  - `release-check.test.ts`, running the script in a temporary git repo: tag `v1.2.3` on a commit on `main` with package version `1.2.3` exits 0; tag `v1.2.3` with package `1.2.4` exits 1 with `tag v1.2.3 does not match package.json 1.2.4`; a tag on a commit only on `develop` exits 1 with `tagged commit is not on main`.
  - `deployed.spec.ts`: home returns 200 with `cache-control` containing `s-maxage=300`; a second request has `x-cache: Hit from cloudfront`; `/api/me` returns JSON; `/api/status` overall is `ok`; `/api/health` is 200 with `no-store`; `/admin` without a session returns 403; the raw `FUNCTION_URL` returns 403; the footer stamp matches `EXPECTED_VERSION`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/release-check.test.ts`, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again, expect PASS.
- [ ] **Step 5: First release**: the owner merges `develop` into `main` with `--no-ff`, runs `npm version minor` on `main`, and pushes with `--follow-tags`; exactly one pipeline execution starts, it deploys, and `deployed.spec.ts` passes. Pushing `develop` or `main` without a tag starts no execution.
- [ ] **Step 6: Rehearse the rollback**: start the pipeline on the same tag with `EXPECTED_VERSION_OVERRIDE=0.0.0`; expect the deployed checks to fail, the `live` alias to point back to the previous version, and the site to keep serving the released version.
- [ ] **Step 7: Review**: leave uncommitted.

### Task 15: Content and launch

- [ ] **Step 1:** Owner enters real content in `/admin`: experience, backend projects, bio, photos, quick questions, certificates (EF SET score and files), resume PDF, Letterboxd link.
- [ ] **Step 2:** Run `scripts/migrate-images.ts` for the four audio projects.
- [ ] **Step 3:** Verify the custom domain and HTTPS on `juanalmaraz.dev`.
- [ ] **Step 4:** Update LinkedIn and the CV to the new domain.
- [ ] **Step 5:** Delete the old `almarazj.github.io` repository (owner action, after the new site has been live and verified).

## Deferred to v2

- "Ask" mode in the palette: answers grounded only in site content, with citations (RAG, rate limit, evals); LLM provider and cost decided then.
- Animated line-drawn face that follows the pointer with its eyes, in the hero photo slot.
- Per-post generated Open Graph images.
- Live "now playing" from Spotify or Last.fm.

## Open items to verify before Task 13

- Domain availability and price of `juanalmaraz.dev` at Cloudflare Registrar; the domain and its Cloudflare zone must exist before the certificate, DNS, CORS and Cognito callback work.
- The Letterboxd URL for Martín (Hache).
- The account's Lambda concurrency limit and whether reserved concurrency 2 is accepted.
- Current always-free figures on the live AWS pricing pages for Lambda, DynamoDB, CloudFront, Cognito, EventBridge Scheduler, CodeBuild and CodePipeline V2, and any S3 or ECR allowance on this plan.
