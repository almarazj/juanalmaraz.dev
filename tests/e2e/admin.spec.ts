import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { config, ddb, s3 } from '../../src/lib/aws';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getRaw, listAll, listRevisions } from '../../src/lib/content/repo';
import { signSession } from '../../src/lib/auth/session';

const ADMIN = 'owner@example.com';
const OTHER = 'someone@example.com';
// Must match the webServer env in playwright.config.ts.
const SESSION_KEY = 'test-session-key-not-secret';
const COGNITO = 'https://cognito.example.test';

async function deletePost(slug: string) {
  const TableName = config().table;
  const keys = [{ pk: 'posts', sk: slug }, ...(await listRevisions('posts', slug, 100)).map((r) => ({ pk: `rev#posts#${slug}`, sk: r.id }))];
  await Promise.all(keys.map((Key) => ddb().send(new DeleteCommand({ TableName, Key }))));
}
const Key = (k: string) => ({ Bucket: config().bucket, Key: k });

// Cognito is not emulated: the session is the app's own token, so the test mints it like the callback does.
async function signInAs(page: Page, email: string, key = SESSION_KEY): Promise<string> {
  const value = signSession(email, Date.now(), key);
  await page.context().addCookies([{ name: '__session', value, domain: 'localhost', path: '/admin', httpOnly: true, sameSite: 'Lax' }]);
  return value;
}

const ENDPOINTS = ['/admin/api/save', '/admin/api/restore', '/admin/api/upload', '/admin/api/preview', '/admin/api/logout'];

async function expectLockedOut(page: Page) {
  const res = await page.goto('/admin');
  expect(res!.status()).toBe(403);
  expect(res!.headers()['cache-control']).toBe('no-store');
  expect((await page.goto('/admin/posts/live-request-log'))!.status()).toBe(403);
  for (const url of ENDPOINTS) expect((await page.request.post(url, { data: {} })).status(), url).toBe(403);
}

test.describe('non-admin', () => {
  test('without a session every admin page and API is 403, with a Google sign-in link', async ({ page }) => {
    await expectLockedOut(page);
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', '/admin/api/signin');
  });

  test('a session signed with another key is 403', async ({ page }) => {
    await signInAs(page, ADMIN, 'some-other-key');
    await expectLockedOut(page);
  });

  test('a valid session for a non-allowlisted email is 403 and writes nothing', async ({ page }) => {
    await signInAs(page, OTHER);
    await expectLockedOut(page);
    const save = await page.request.post('/admin/api/save', {
      data: { collection: 'posts', id: 'hijack', data: { title: 'x', summary: '', bodyMd: '', tags: [], status: 'published' } },
    });
    expect(save.status()).toBe(403);
    expect(await getRaw('posts', 'hijack')).toBeNull();
  });

  test('sign-in redirects to Cognito with PKCE and a callback with another state is refused', async ({ page }) => {
    const res = await page.request.get('/admin/api/signin', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = new URL(res.headers()['location']);
    expect(`${location.origin}${location.pathname}`).toBe(`${COGNITO}/oauth2/authorize`);
    expect(location.searchParams.get('identity_provider')).toBe('Google');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(res.headers()['set-cookie']).toMatch(/^__oauth=/);

    const callback = await page.request.get(`/admin/api/callback?code=x&state=forged-${location.searchParams.get('state')}`, { maxRedirects: 0 });
    expect(callback.status()).toBe(403);
    expect(callback.headers()['set-cookie'] ?? '').not.toContain('__session=');
  });
});

test.describe('owner', () => {
  let session: string;
  test.beforeEach(async ({ page }) => {
    session = await signInAs(page, ADMIN);
  });

  // Logout revokes every session, so this file relies on running in one worker (the default per file).
  test('signs out through Cognito, which revokes the previous session', async ({ page }) => {
    await page.route(`${COGNITO}/**`, (route) => route.fulfill({ contentType: 'text/plain', body: 'cognito logout' }));
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Content', level: 1 })).toBeVisible();
    await expect(page.getByText(ADMIN)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    const loginUrl = `${test.info().project.use.baseURL}/admin/login`;
    await expect(page).toHaveURL(`${COGNITO}/logout?client_id=e2e-client&logout_uri=${encodeURIComponent(loginUrl)}`);
    expect((await page.context().cookies()).some((c) => c.name === '__session')).toBe(false);

    await page.context().addCookies([{ name: '__session', value: session, domain: 'localhost', path: '/admin' }]);
    await expectLockedOut(page);
  });

  test('edits a post with live preview, saves a draft, publishes and restores a revision', async ({ page }) => {
    const slug = `e2e-${Date.now()}`;
    const title = `E2E post ${slug}`;
    try {
      await page.goto('/admin/posts/new');
      await page.getByLabel('id', { exact: true }).fill(slug);
      await page.getByLabel('title').fill(title);
      await page.getByLabel('summary').fill('Written by the admin E2E test.');
      await page.getByLabel('bodyMd', { exact: true }).fill('## Hello\n\nSome **bold** text.\n\n<script>alert(1)</script>');
      const preview = page.getByLabel('bodyMd preview');
      await expect(preview.getByRole('heading', { name: 'Hello' })).toBeVisible();
      await expect(preview.locator('strong')).toHaveText('bold');
      await expect(preview.locator('script')).toHaveCount(0);

      // Inline validation: an empty title never reaches the server.
      await page.getByLabel('title').fill('');
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.locator('#err-title')).toHaveText('Required');
      await expect(page.getByLabel('title')).toHaveAttribute('aria-invalid', 'true');
      await page.getByLabel('title').fill(title);

      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page).toHaveURL(`/admin/posts/${slug}`);
      await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
      await page.goto('/writing');
      await expect(page.getByText(title)).toHaveCount(0);

      await page.goto(`/admin/posts/${slug}`);
      await page.getByLabel('status').selectOption('published');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
      await page.goto('/writing');
      await expect(page.getByRole('link', { name: title })).toBeVisible();

      await page.goto(`/admin/posts/${slug}`);
      const revisions = page.getByRole('region', { name: 'Revisions' }).getByRole('listitem');
      await expect(revisions).toHaveCount(2);
      await revisions.nth(1).getByRole('button', { name: 'Restore' }).click();
      await expect(revisions).toHaveCount(3);
      await expect(page.getByLabel('status')).toHaveValue('draft');
      await page.goto('/writing');
      await expect(page.getByText(title)).toHaveCount(0);
    } finally {
      await deletePost(slug);
    }
  });

  test('creating an id that exists is refused inline', async ({ page }) => {
    await page.goto('/admin/education/new');
    const existing = (await listAll('education'))[0].id;
    await page.getByLabel('id', { exact: true }).fill(existing);
    await page.getByLabel('title').fill('Dup');
    await page.getByLabel('school').fill('Dup');
    await page.getByLabel('start').fill('2020-01');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('#err-id')).toHaveText('Already exists');
    expect((await getRaw('education', existing))!.title).not.toBe('Dup');
  });

  test('uploads an image and gets three WebP variants', async ({ page }) => {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#c2410c' } }).png().toBuffer();
    await page.goto('/admin');
    const form = page.locator('[data-image-upload]');
    await form.getByLabel('Image', { exact: true }).setInputFiles({ name: 'E2E Banner.png', mimeType: 'image/png', buffer: png });
    await form.getByLabel('Alt text').fill('An orange banner');
    await form.getByRole('button', { name: 'Upload image' }).click();
    await expect(form.getByLabel('ImageRef')).not.toHaveValue('');
    const ref = JSON.parse(await form.getByLabel('ImageRef').inputValue()) as { base: string; widths: number[]; alt: string };
    try {
      expect(ref).toMatchObject({ widths: [480, 960, 1600], alt: 'An orange banner' });
      expect(ref.base).toMatch(/^uploads\/e2e-banner-[a-z0-9]+$/);
      for (const w of ref.widths) await s3().send(new HeadObjectCommand(Key(`images/${ref.base}-${w}.webp`)));
      await expect(form.locator('[data-upload-preview]')).toHaveJSProperty('naturalWidth', 960);
    } finally {
      await Promise.all(ref.widths.map((w) => s3().send(new DeleteObjectCommand(Key(`images/${ref.base}-${w}.webp`)))));
    }
  });

  test('uploads a new resume and /resume.pdf serves it', async ({ page }) => {
    const { resumePath } = (await getRaw('site', 'main')) as { resumePath: string };
    const original = Buffer.from(await (await s3().send(new GetObjectCommand(Key(resumePath)))).Body!.transformToByteArray());
    const pdf = Buffer.from(`%PDF-1.4\n% e2e-resume-${Date.now()}\n%%EOF\n`);
    try {
      await page.goto('/admin');
      await page.getByLabel('PDF').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: pdf });
      await page.getByRole('button', { name: 'Upload resume' }).click();
      await expect(page.getByText('Resume updated.')).toBeVisible();
      const res = await page.request.get('/resume.pdf');
      expect(res.status()).toBe(200);
      expect(Buffer.compare(await res.body(), pdf)).toBe(0);

      await page.getByLabel('PDF').setInputFiles({ name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>') });
      await page.getByRole('button', { name: 'Upload resume' }).click();
      await expect(page.getByText(/Upload failed: Not a PDF/)).toBeVisible();
    } finally {
      await s3().send(new PutObjectCommand({ ...Key(resumePath), Body: original, ContentType: 'application/pdf' }));
    }
  });
});
