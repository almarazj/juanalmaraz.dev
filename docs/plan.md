# juanalmaraz.dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Repo rule from `AGENTS.md`: work in the main checkout, no worktrees, and leave every task's changes uncommitted for the owner to review; "Review" steps below replace the usual commit step.

**Goal:** Replace the old static portfolio with a reading-first backend portfolio at `juanalmaraz.dev` that runs a real public API, a live request log and a live status, edited from a small admin, entirely inside the GCP free tier.

**Architecture:** One Astro SSR app (Node adapter) on Cloud Run serves the public site, `/api/*`, `/internal/*` and `/admin`, behind Firebase Hosting as the CDN.
Content lives in Firestore as Markdown with revisions; images and the resume live in a public Cloud Storage bucket.
Hosting request logs flow to Cloud Logging, a sink publishes them to Pub/Sub, a push subscription delivers them to `/internal/ingest`, which batches a single `public/feed` document every 10 seconds.

**Tech Stack:** Node 24 LTS, pnpm, TypeScript (strict), Astro 5 SSR with `@astrojs/node`, Firebase Admin SDK, Firebase Auth (web SDK, admin only), unified (remark/rehype) with `rehype-sanitize` and Shiki, sharp, zod, Vitest, Playwright, Firebase Emulator Suite, Terraform (google, google-beta, cloudflare providers), GitHub Actions with Workload Identity Federation.

**Spec:** the decisions in this file plus [`docs/design.md`](design.md) (visual spec, tokens, component behavior, lab links).

## Global Constraints

- Everything stays within the GCP free tier; budget alert at 1 USD; Cloud Run `min-instances=0`, `max-instances=2`, region `us-central1`.
- Free quotas to respect: Firestore 50,000 reads, 20,000 writes per day; Cloud Logging 50 GiB per project per month; uptime checks 1 million executions per project per month.
- English only; `<html lang="en">`; light mode default, dark only via toggle stored in `localStorage["mode"]`.
- Content is Markdown, rendered server side and sanitized; no raw HTML from Firestore reaches the page unsanitized.
- Public cache headers: pages `public, max-age=0, s-maxage=300, stale-while-revalidate=86400`; `/api/requests` `s-maxage=5`; `/api/status` `s-maxage=30`; other `/api/*` `s-maxage=60`; `/admin/*` and `/internal/*` `no-store`.
- The request feed stores only method, path, status, cache (HIT or MISS), latency ms and timestamp; never IP, user agent, query string or referrer.
- Unknown paths with status 404 appear as the literal path `404 · unknown path`; any other path outside the allowlist, and anything under `/admin` or `/internal`, is dropped.
- Feed write cadence: at most one Firestore write per 10 seconds per instance; feed holds the latest 30 entries.
- Admin access: Firebase Auth Google sign-in, one allowlisted email from env `ADMIN_EMAIL`, verified server side on every admin request.
- Image variants on upload: WebP at widths 480, 960, 1600; originals are not kept.
- Versioning: semver in `package.json`, tag `vX.Y.Z` on merge to `main`; the footer stamp reads `PUBLIC_VERSION`, `PUBLIC_COMMIT` (7 chars) and `PUBLIC_BRANCH` injected at build.
- Accessibility: every hover behavior has a keyboard and touch equivalent; visible focus ring; `prefers-reduced-motion` disables animation.
- No em dashes in copy or docs.

## Review Focus

1. Feed sanitizer receives a log entry with a crafted path (`/<script>`, very long paths, `%2e%2e`): it must drop or bucket it, never echo it. Test lives in Task 8.
2. Cloud Run scales to zero with entries buffered: the next instance starts with an empty buffer and must not overwrite the feed with an empty list. Test lives in Task 8.
3. A non-allowlisted Google account signs in to `/admin`: every admin page and admin API returns 403, including direct POSTs. Test lives in Task 11.
4. A published post's Markdown contains raw HTML or a `javascript:` link: rendered output strips both. Test lives in Task 3.
5. `/api/status` is unreachable (Cloud Run down) while the CDN still serves the page: the footer dot turns red from the client side. Test lives in Task 9.

## Skills per task

Load these skills (installed globally) before working on the listed tasks; they carry the framework conventions this plan assumes.

| Skill | Tasks |
|---|---|
| `typescript-best-practices` | all code tasks |
| `astro` | 1, 2, 4, 5, 6, 7, 8, 11, 12 |
| `vitest` | every task with `tests/unit` |
| `playwright-best-practices` | every task with `tests/e2e` |
| `accessibility` | 2, 4, 5, 6, 7, 9, 11 |
| `firebase-firestore` | 3, 8, 9, 11 |
| `firebase-auth-basics` | 11 |
| `firestore-rules-creation`, `firebase-security-rules-auditor` | 10, 11 |
| `firebase-hosting-basics`, `firebase-basics` | 1, 14 |
| `terraform-style-guide`, `terraform-test` | 13 |
| `google-cloud-waf-security`, `google-cloud-waf-cost-optimization` | 13, 14 |

---

## File Structure

```
juanalmaraz.dev/
  AGENTS.md, CLAUDE.md -> AGENTS.md
  docs/plan.md, docs/design.md
  package.json, pnpm-lock.yaml, .nvmrc, tsconfig.json, astro.config.mjs
  firebase.json, .firebaserc, firestore.rules, firestore.indexes.json, storage.rules
  src/
    styles/tokens.css            design tokens from docs/design.md
    styles/base.css              reset, typography, focus, layout primitives
    layouts/Base.astro           html shell, theme bootstrap, header, footer
    layouts/Post.astro           post page shell with index and progress
    components/site/             Header, Footer, StatusDot, SideIndex, Palette, ThemeToggle
    components/home/             Hero, Terminal, Experience, Projects, Education, About, PhotoStack, Writing
    components/post/             Toc, CodeBlock, Callout
    components/admin/            Editor, ImageUpload, RevisionList
    lib/content/schemas.ts       zod schemas and inferred types
    lib/content/repo.ts          Firestore reads and writes, revisions
    lib/markdown/render.ts       Markdown to sanitized HTML, headings, reading time
    lib/images/process.ts        sharp variants and Storage upload
    lib/feed/sanitize.ts         log entry to FeedEntry or null
    lib/feed/buffer.ts           in-memory ring and flush throttle
    lib/status/check.ts          service checks for /api/status
    lib/auth/admin.ts            ID token verification and allowlist
    lib/http/cache.ts            Cache-Control helpers
    lib/firebase.ts              Admin SDK singletons (emulator aware)
    pages/index.astro
    pages/writing/index.astro, pages/writing/[slug].astro
    pages/api/me.ts, experience.ts, stack.ts, now.ts, requests.ts, status.ts
    pages/internal/ingest.ts
    pages/admin/index.astro, admin/[collection]/[id].astro, admin/api/*.ts
    pages/rss.xml.ts, pages/sitemap.xml.ts, pages/resume.pdf.ts
    scripts/seed.ts              seeds the emulator with sample content
    scripts/migrate-images.ts    pushes the old site's audio project images through process.ts
  tests/unit/*.test.ts           Vitest
  tests/e2e/*.spec.ts            Playwright against emulators
  infra/                         Terraform root module
  .github/workflows/ci.yml, deploy.yml
```

## Data Model (Firestore)

| Path | Fields |
|---|---|
| `posts/{slug}` | `title`, `summary`, `bodyMd`, `tags: string[]`, `status: "draft" \| "published"`, `publishedAt`, `updatedAt`, `series?: { id, title, part }` |
| `projects/{slug}` | `title`, `group: "backend" \| "engineering"`, `year`, `summary`, `problem?`, `decision?`, `result?`, `stack: string[]`, `links: {label,url}[]`, `image?: ImageRef`, `diagramSvg?`, `confidential: boolean`, `order`, `status` |
| `experience/{id}` | `role`, `org`, `monogram`, `start: "YYYY-MM"`, `end: "YYYY-MM" \| null`, `place`, `summary`, `stack: string[]`, `order` |
| `education/{id}` | `title`, `school`, `start`, `end`, `summary` |
| `certificates/{id}` | `name`, `issuer`, `year`, `level?`, `file?: ImageRef`, `verifyUrl?`, `order` |
| `about/main` | `bio`, `photos: {image: ImageRef, caption}[]`, `questions: {q, a, detail, icon, link?}[]` |
| `site/main` | `lede`, `roleLine`, `resumePath`, `now: object` |
| `{collection}/{id}/revisions/{auto}` | full snapshot of the parent plus `savedAt`, `savedBy` |
| `public/feed` | `entries: FeedEntry[]` (max 30), `updatedAt`, `stats: { rpm, p50, hitRatio }` |

`ImageRef = { base: string, widths: [480, 960, 1600], alt: string }`, URLs built as `${base}-${w}.webp`.

---

### Task 1: Repository bootstrap and CI skeleton

**Files:**
- Create: `package.json`, `.nvmrc` (`24`), `tsconfig.json` (extends `astro/tsconfigs/strict`), `astro.config.mjs` (output `server`, adapter `@astrojs/node` mode `standalone`), `firebase.json` (emulators: auth 9099, firestore 8080, storage 9199, ui off), `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `src/pages/index.astro` (placeholder "ok")
- Test: `tests/unit/smoke.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm build`, `pnpm test` (vitest), `pnpm e2e` (playwright with `firebase emulators:exec`), `pnpm lint` (`astro check` + eslint), `pnpm check` (lint + test + e2e).

- [ ] **Step 1: Write `tests/e2e/smoke.spec.ts`**: `GET /` returns 200 and `html[lang="en"]` exists.
- [ ] **Step 2: Run `pnpm e2e`**; expected FAIL (no app).
- [ ] **Step 3: Scaffold Astro with the config above**; set `"packageManager": "pnpm@<current>"` and `"engines": { "node": ">=24" }`.
- [ ] **Step 4: Run `pnpm check`**; expected all green.
- [ ] **Step 5: CI**: `ci.yml` runs `pnpm install --frozen-lockfile`, `pnpm check` on every push and PR, with Java installed for the emulators.
- [ ] **Step 6: Review**: leave uncommitted; owner commits on `feature/bootstrap`.

### Task 2: Design tokens, base layout, theme toggle

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/layouts/Base.astro`, `src/components/site/ThemeToggle.astro`
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Produces: `Base.astro` props `{ title: string; description: string; ogImage?: string }`; tokens exactly as in `docs/design.md` (names `--bg`, `--fg`, `--muted`, `--faint`, `--line`, `--soft`, `--accent`, `--ok`, `--warn`, `--down`, `--c-experience`, `--c-projects`, `--c-engineering`, `--c-education`, `--c-writing`, `--c-about`, `--g-*`).

- [ ] **Step 1: Test** `theme.spec.ts`: fresh context renders `html` without `data-mode` and `body` background `rgb(251, 251, 250)`; clicking the toggle sets `data-mode="dark"` and background `rgb(20, 21, 24)`; reload keeps dark; an OS-level `colorScheme: 'dark'` context still renders light.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** tokens, base styles and an inline `<script>` in `<head>` that applies `localStorage.mode` before paint (no flash); wrap storage access in try/catch.
- [ ] **Step 4: Run** `pnpm e2e -- theme`, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

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

- [ ] **Step 1: Tests**:
  - `schemas.test.ts`: a post missing `title` fails; `status` outside the enum fails; `experience.end` accepts `null` and `"2024-04"`, rejects `"2024-4"`.
  - `render.test.ts`: `<script>alert(1)</script>` is removed; `[x](javascript:alert(1))` renders without an `href`; `## Batching to stay free` yields heading `{ id: "batching-to-stay-free", depth: 2 }`; a fenced `ts` block renders with Shiki classes; 440 words gives `minutes: 2`.
  - `repo.test.ts`: `saveWithRevision` creates exactly one revision per call; `listPublished("posts")` excludes drafts; `restoreRevision` writes the snapshot back and adds a new revision.
- [ ] **Step 2: Run** `pnpm test`, expect FAIL.
- [ ] **Step 3: Implement**; render pipeline `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-slug` → `@shikijs/rehype` (theme matching graphite tokens) → `rehype-sanitize` (default schema extended to keep Shiki `class`/`style` on `span` and `pre`) → `rehype-stringify`.
- [ ] **Step 4: `scripts/seed.ts`** writes sample docs for every collection using the copy from the labs, so every later task has content; `pnpm seed` runs it against the emulator.
- [ ] **Step 5: Run** `pnpm test`, expect PASS.
- [ ] **Step 6: Review**: leave uncommitted.

### Task 4: Header, footer shell and side index

**Files:**
- Create: `src/components/site/Header.astro`, `src/components/site/Footer.astro`, `src/components/site/SideIndex.astro`, `src/components/site/scrollspy.ts`
- Test: `tests/e2e/chrome.spec.ts`, `tests/unit/scrollspy.test.ts`

**Interfaces:**
- Consumes: `Base.astro` from Task 2.
- Produces: `SideIndex` props `{ sections: { id: string; title: string; color: string; entries: { id: string; title: string }[] }[] }`; `scrollspy.ts` exports `currentId(positions: { id: string; top: number }[], viewportTop: number, offset = 120): string | null`.
- Footer reads `import.meta.env.PUBLIC_VERSION`, `PUBLIC_COMMIT`, `PUBLIC_BRANCH`; the status dot is a placeholder until Task 9.

- [ ] **Step 1: Tests**: `scrollspy.test.ts` returns the last section whose top is above `viewportTop + offset` and `null` above the first; `chrome.spec.ts`: at scroll 0 the header has no visible name; after scrolling past the hero the name and `/ experience` appear; clicking a rail entry scrolls to it and marks it `.on`; the current section's entries are expanded and others collapsed; under 960px wide the rail is hidden; the footer shows the stamp `v0.0.0`, the 7-char commit and branch.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** per `docs/design.md` Header, Side index and Footer sections.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 5: Home sections (hero identity, experience, projects, education, about, writing)

**Files:**
- Create: `src/components/home/{Hero,Experience,Projects,Education,About,PhotoStack,Writing}.astro`, `src/components/home/photo-stack.ts`, `src/components/home/tenure.ts`, `src/pages/index.astro` (replace placeholder)
- Test: `tests/unit/tenure.test.ts`, `tests/unit/photo-stack.test.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `repo.listPublished`, `repo.getSingleton`, `renderMarkdown`.
- Produces: `tenure(start: string, end: string | null, now: Date): { years: number; widthPct: number }` with `widthPct = min(100, years / 6 * 100)`; `photo-stack.ts` exports `cycle<T>(order: T[]): T[]` (first to last) and `shouldSendBack(dx: number, dy: number): boolean` (true when `hypot > 90`).

- [ ] **Step 1: Tests**:
  - `tenure.test.ts`: `tenure("2021-03","2022-12", ...)` is about 1.8 years and 30% width; `end: null` uses `now`; 8 years caps at 100.
  - `photo-stack.test.ts`: `cycle([a,b,c])` is `[b,c,a]`; `shouldSendBack(60, 60)` is false, `(80, 60)` is true.
  - `home.spec.ts`: each section has its color label; experience cards show a monogram and tenure bar; backend projects strip scrolls with the → button and confidential ones show "conf."; "Earlier engineering work" lists engineering projects; clicking a certificate opens a dialog with "Open original"; the photo stack sends the top photo back on Enter and updates "2 / n"; the writing list shows date, minutes and title; Resume pill links to `/resume.pdf`.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** per `docs/design.md`; the hero right column is an empty terminal frame until Task 8.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 6: Post pages and writing index

**Files:**
- Create: `src/layouts/Post.astro`, `src/components/post/{Toc,CodeBlock,Callout}.astro`, `src/pages/writing/index.astro`, `src/pages/writing/[slug].astro`
- Test: `tests/e2e/post.spec.ts`

**Interfaces:**
- Consumes: `renderMarkdown` headings and minutes.

- [ ] **Step 1: Test** `post.spec.ts`: body font is IBM Plex Serif at 18px with max width 68ch; the right index lists h2s and marks the current one while scrolling; "min left" decreases; the code block copy button puts the code on the clipboard; a draft slug returns 404; series navigation links to the previous and next parts.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement**; callouts use a Markdown directive `:::note` via `remark-directive`.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 7: Command palette and keyboard shortcuts

**Files:**
- Create: `src/components/site/Palette.astro`, `src/components/site/palette.ts`, `src/components/site/shortcuts.ts`, `src/pages/search-index.json.ts`
- Test: `tests/unit/palette.test.ts`, `tests/unit/shortcuts.test.ts`, `tests/e2e/palette.spec.ts`

**Interfaces:**
- Produces: `search(index: PaletteItem[], q: string): PaletteItem[]` (case-insensitive substring on label, hint and group; groups keep the order Sections, Experience, Projects, Writing, Education, About, Links, Actions); `PaletteItem = { group: string; label: string; hint: string; target: string; keys?: string[] }`; `createShortcuts(map: Record<string, () => void>, timeoutMs = 800)` handling two-key sequences like `g e`.

- [ ] **Step 1: Tests**: `search(idx, "boca")` returns the About item; empty query returns all in group order; `shortcuts` fires `g e` within 800 ms and not after; keys are ignored while focus is in an input. E2E: `/` and `⌘K` open the modal; typing then Enter navigates; Esc closes and returns focus; each result shows its shortcut; at 390px width the bottom sheet opens with filter chips.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** per `docs/design.md`; the index is a cached JSON endpoint (`s-maxage=300`) built from published content.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

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
- [ ] **Step 1: Tests**:
  - `sanitize.test.ts`: `/writing/live-request-log?utm=x` becomes `/writing/live-request-log`; `/wp-login.php` with 404 becomes `404 · unknown path`; `/admin/posts` with 200 returns null; `/<script>` returns null or the 404 bucket and never contains `<`; a 4 KB path returns null; output has no IP or user agent keys; `latency: "0.084s"` becomes `ms: 84`.
  - `buffer.test.ts` (fake timers): 50 pushes in 1 s cause one write with 30 entries; a push 10 s later causes a second write; a cold buffer with stored entries `[x, y]` writes `[new, x, y]`, never `[new]` alone.
  - `cache.test.ts`: each kind returns the exact header string.
  - `terminal.spec.ts`: on load the curl pane shows the `/api/me` JSON without interaction; clicking `/stack` changes it; the tail pane lists seeded feed entries with relative times; no request to `/api/requests` happens while the terminal is scrolled out of view.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement**; OIDC verification with `google-auth-library` `OAuth2Client.verifyIdToken`.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 9: Status endpoint and footer status dot

**Files:**
- Create: `src/lib/status/check.ts`, `src/pages/api/status.ts`, `src/components/site/StatusDot.astro`, `src/components/site/status-tooltip.ts`
- Test: `tests/unit/status.test.ts`, `tests/unit/status-tooltip.test.ts`, `tests/e2e/status.spec.ts`

**Interfaces:**
- Produces: `checkServices(deps): Promise<Status>`; `Status = { overall: "ok" | "warn" | "down"; checkedAt: number; services: { name: string; state: "ok" | "warn" | "down"; detail: string }[]; uptime30d: number | null }`; services: Website (CDN), App (Cloud Run), Database (Firestore), Storage, Public API, Live request log; the log is `warn` when `feed.updatedAt` is older than 120 s; `uptime30d` comes from the Monitoring API uptime check (`null` locally).
- `status-tooltip.ts`: `withinIntent(pointer: [number, number], center: [number, number], radius = 32): boolean`; `placeTooltip(pointer, size, viewport, offset = 16): [number, number]` flipping left and down at the edges.

- [ ] **Step 1: Tests**: `status.test.ts`: Firestore read failure gives Database `down` and overall `down`; stale feed gives overall `warn`. `status-tooltip.test.ts`: `withinIntent([0,0],[20,20])` true, `([0,0],[40,40])` false; placement flips near the right edge. `status.spec.ts`: hovering the dot shows the `$ status` tooltip and it follows the pointer; moving 40 px away hides it; Tab focus shows it anchored; when `/api/status` is routed to fail, the dot turns red with label "Site status: major outage".
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** per the footer section of `docs/design.md`.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 10: Images, resume and certificate files

**Files:**
- Create: `src/lib/images/process.ts`, `src/pages/resume.pdf.ts`, `storage.rules`, `scripts/migrate-images.ts`
- Test: `tests/unit/process.test.ts`

**Interfaces:**
- Produces: `processImage(input: Buffer, base: string, alt: string): Promise<ImageRef>` (writes three WebP variants to Storage at `images/${base}-${w}.webp`, rejects inputs over 15 MB or that sharp cannot decode); `/resume.pdf` streams `site/main.resumePath` from Storage with `cacheHeaders("page")` and `Content-Disposition: inline; filename="juan-almaraz-resume.pdf"`.

- [ ] **Step 1: Tests**: a 2000px JPEG yields widths 480, 960, 1600 in WebP; a 600px image yields 480 and 600 (no upscaling) and `widths` reflects it; a text file rejects with "Unsupported image".
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement**; `migrate-images.ts` reads the old repo's `assets/img/portfolio/**` and calls `processImage`.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

### Task 11: Admin

**Files:**
- Create: `src/lib/auth/admin.ts`, `src/middleware.ts`, `src/pages/admin/index.astro`, `src/pages/admin/[collection]/[id].astro`, `src/pages/admin/api/{save,upload,revisions,restore,session}.ts`, `src/components/admin/{Editor,ImageUpload,RevisionList}.astro`, `firestore.rules`
- Test: `tests/unit/admin-auth.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `repo.saveWithRevision`, `repo.listRevisions`, `repo.restoreRevision`, `processImage`, schemas.
- Produces: `requireAdmin(request: Request): Promise<{ email: string }>` throwing a 403 `Response` unless the session cookie holds a valid Firebase session for `ADMIN_EMAIL`; session cookie `__session` (the only cookie Firebase Hosting forwards), 5 days, `HttpOnly; Secure; SameSite=Strict`.
- Firestore rules deny all client reads and writes; only the Admin SDK touches data.

- [ ] **Step 1: Tests**: `admin-auth.test.ts`: allowlisted email passes; another verified email gets 403; expired cookie gets 403. `admin.spec.ts` (Auth emulator): non-admin sees 403 on `/admin` and on `POST /admin/api/save`; admin edits a post in the Markdown editor with live preview, saves as draft (not on `/writing`), publishes (appears on `/writing`), sees two revisions and restores the first; uploads an image and gets three variants; uploads a new resume and `/resume.pdf` serves it.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement**; the editor validates with the zod schema before saving and shows field errors inline.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Review**: leave uncommitted.

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

### Task 13: Infrastructure (Terraform)

**Files:**
- Create: `infra/{main,variables,outputs,providers,versions}.tf`, `infra/{run,firestore,storage,logging,pubsub,iam,wif,budget,monitoring,dns}.tf`, `infra/README.md`

**Interfaces:**
- Produces outputs `service_url`, `push_service_account`, `deployer_service_account`, `wif_provider`, `bucket_name`.
- Resources: enabled APIs; Artifact Registry repo (Docker, cleanup policy keeping the last 5 images to stay under 0.5 GB); Cloud Run service (`min 0`, `max 2`, 512 MiB, concurrency 80, env `ADMIN_EMAIL`, `PUSH_SA`); Firestore native database `(default)` in `us-central1`, the same region as everything else; public-read Storage bucket in `us-central1` with uniform access; Pub/Sub topic `hosting-requests` and push subscription to `${service_url}/internal/ingest` with OIDC; log sink filtered to Firebase Hosting request logs publishing to the topic; uptime check on `https://juanalmaraz.dev/` every 5 minutes; budget of 1 USD with 50%, 90%, 100% alerts to the owner; WIF pool and provider bound to the GitHub repo `almarazj/juanalmaraz.dev` on release tags `refs/tags/v*` only; Cloudflare DNS records required by Firebase Hosting's custom domain (DNS only, not proxied, so Hosting can issue the certificate).

- [ ] **Step 1: `terraform fmt -check` and `terraform validate`** in CI on every change under `infra/`.
- [ ] **Step 2: `tflint`** with the google ruleset, expect no warnings.
- [ ] **Step 3: Plan against the real project** (owner runs `terraform plan`), expect only creates on first run; the owner applies.
- [ ] **Step 4: Verify** the budget, the uptime check and the sink exist in the console; verify the Firebase Hosting log integration is linked (console step, recorded in `infra/README.md` because it has no Terraform resource).
- [ ] **Step 5: Review**: leave uncommitted.

### Task 14: Deploy pipeline and release flow

**Files:**
- Create: `.github/workflows/deploy.yml`, `Dockerfile` (multi-stage, `node:24-slim`, non-root), `firebase.json` hosting block (rewrite `**` to Cloud Run service, `__session` cookie passthrough)
- Test: `tests/e2e/deployed.spec.ts` (runs against `BASE_URL`)

**Interfaces:**
- `deploy.yml` runs only on push of a release tag `v*` (never on branch pushes); it fails fast if the tag does not match `package.json` version or does not point to a commit on `main`: `pnpm check`, build image tagged with the commit SHA, push to Artifact Registry, `gcloud run deploy`, `firebase deploy --only hosting`, then `pnpm e2e:deployed`; build args set `PUBLIC_VERSION` from `package.json`, `PUBLIC_COMMIT`, `PUBLIC_BRANCH`.

- [ ] **Step 1: Test** `deployed.spec.ts`: home returns 200 with `cache-control` containing `s-maxage=300`; second request has the Hosting cache hit header; `/api/me` returns JSON; `/api/status` overall is `ok`; `/admin` without session returns 403; footer stamp matches the deployed version.
- [ ] **Step 2: Dry run** the workflow on a branch with deploy steps disabled, expect green.
- [ ] **Step 3: Release**: owner merges `develop` into `main` with `--no-ff`, runs `npm version minor`, pushes the tag; the workflow deploys and `deployed.spec.ts` passes.
- [ ] **Step 4: Review**: leave uncommitted.

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

- Domain availability and price of `juanalmaraz.dev` at Cloudflare Registrar.
- The Letterboxd URL for Martín (Hache).
- Current free-tier figures on the live Google pricing pages (Cloud Logging 50 GiB, uptime checks 1 million executions, Firestore daily quotas).
