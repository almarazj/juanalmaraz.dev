import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { auth, bucket, db } from '../../src/lib/firebase';

const ADMIN = 'owner@example.com';
const OTHER = 'someone@example.com';
const authHost = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

// Signs in through the Auth emulator's fake Google IdP, as the popup would.
async function idToken(email: string): Promise<string> {
  const claims = JSON.stringify({ sub: email, email, email_verified: true });
  const res = await fetch(`http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestUri: 'http://localhost',
      returnSecureToken: true,
      postBody: `id_token=${encodeURIComponent(claims)}&providerId=google.com`,
    }),
  });
  expect(res.ok).toBe(true);
  return ((await res.json()) as { idToken: string }).idToken;
}

async function signInAs(page: Page, email: string) {
  const res = await page.request.post('/admin/api/session', { data: { idToken: await idToken(email) } });
  expect(res.status()).toBe(204);
}

const ENDPOINTS = ['/admin/api/save', '/admin/api/restore', '/admin/api/upload', '/admin/api/preview'];

test.describe('non-admin', () => {
  test('without a session every admin page and API is 403', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res!.status()).toBe(403);
    expect(res!.headers()['cache-control']).toBe('no-store');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    expect((await page.goto('/admin/posts/live-request-log'))!.status()).toBe(403);
    for (const url of ENDPOINTS) expect((await page.request.post(url, { data: {} })).status(), url).toBe(403);
  });

  test('a non-allowlisted Google account gets no session and stays at 403', async ({ page }) => {
    const res = await page.request.post('/admin/api/session', { data: { idToken: await idToken(OTHER) } });
    expect(res.status()).toBe(403);
    expect(res.headers()['set-cookie']).toBeUndefined();

    // Even a valid session cookie minted for that account outside the endpoint is refused.
    const forged = await auth().createSessionCookie(await idToken(OTHER), { expiresIn: 3_600_000 });
    await page.context().addCookies([{ name: '__session', value: forged, url: test.info().project.use.baseURL! }]);
    expect((await page.goto('/admin'))!.status()).toBe(403);
    const save = await page.request.post('/admin/api/save', {
      data: { collection: 'posts', id: 'hijack', data: { title: 'x', summary: '', bodyMd: '', tags: [], status: 'published' } },
    });
    expect(save.status()).toBe(403);
    expect((await db().doc('posts/hijack').get()).exists).toBe(false);
  });

  test('a non-allowlisted account signing in from the page is told it is not allowed', async ({ page }) => {
    await page.goto('/admin/login');
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await addEmulatorAccount(await popup, OTHER);
    await expect(page.getByRole('alert')).toHaveText(`${OTHER} is not allowed here.`);
  });
});

// The emulator's account picker renders before its click handlers attach, so the first click can be lost.
async function addEmulatorAccount(popup: Page, email: string) {
  await expect(async () => {
    await popup.getByRole('button', { name: /add new account/i }).click({ timeout: 1000 });
    await expect(popup.getByLabel('Email')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await popup.getByLabel('Email').fill(email);
  await popup.getByRole('button', { name: /sign in with google/i }).click();
}

test('the owner signs in from the page, lands on /admin and signs out', async ({ page }) => {
  await page.goto('/admin');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await addEmulatorAccount(await popup, ADMIN);
  await expect(page.getByRole('heading', { name: 'Content', level: 1 })).toBeVisible();
  await expect(page.getByText(ADMIN)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.goto('/admin'))!.status()).toBe(403);
});

test.describe('owner', () => {
  test.beforeEach(({ page }) => signInAs(page, ADMIN));

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
      await db().recursiveDelete(db().doc(`posts/${slug}`));
    }
  });

  test('creating an id that exists is refused inline', async ({ page }) => {
    await page.goto('/admin/education/new');
    const existing = (await db().collection('education').limit(1).get()).docs[0].id;
    await page.getByLabel('id', { exact: true }).fill(existing);
    await page.getByLabel('title').fill('Dup');
    await page.getByLabel('school').fill('Dup');
    await page.getByLabel('start').fill('2020-01');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('#err-id')).toHaveText('Already exists');
    expect((await db().doc(`education/${existing}`).get()).data()!.title).not.toBe('Dup');
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
      for (const w of ref.widths) expect((await bucket().file(`images/${ref.base}-${w}.webp`).exists())[0]).toBe(true);
      await expect(form.locator('[data-upload-preview]')).toHaveJSProperty('naturalWidth', 960);
    } finally {
      await Promise.all(ref.widths.map((w) => bucket().file(`images/${ref.base}-${w}.webp`).delete({ ignoreNotFound: true })));
    }
  });

  test('uploads a new resume and /resume.pdf serves it', async ({ page }) => {
    const { resumePath } = (await db().doc('site/main').get()).data() as { resumePath: string };
    const [original] = await bucket().file(resumePath).download();
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
      await bucket().file(resumePath).save(original, { contentType: 'application/pdf' });
    }
  });
});
