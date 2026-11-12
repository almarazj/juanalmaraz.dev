import { expect, test } from '@playwright/test';

test('curl pane shows /api/me on load and switches endpoints', async ({ page }) => {
  await page.goto('/');
  const out = page.locator('[data-api-out]');
  await expect(out).toContainText('"name": "Juan Almaraz"');
  expect(JSON.parse((await out.textContent())!)).toMatchObject({ name: 'Juan Almaraz' });

  await page.getByRole('button', { name: '/stack' }).click();
  await expect(page.getByRole('button', { name: '/stack' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '/me' })).toHaveAttribute('aria-pressed', 'false');
  await expect(out).toContainText('"daily"');
  expect(JSON.parse((await out.textContent())!)).toHaveProperty('infra');
});

test('tail pane lists seeded requests with relative times', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('[data-feed] li');
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toContainText(/(GET|POST|HEAD)\s+\/\S*\s+\d{3}\s+(cold|warm)\s+\d+ ms\s+\d+ (s|min|h|d) ago/);
});

test('tail pane renders cold and warm rows', async ({ page }) => {
  const t = Date.now();
  const entries = [
    { m: 'GET', p: '/', s: 200, c: 'cold', ms: 480, t },
    { m: 'GET', p: '/writing', s: 200, c: 'warm', ms: 12, t: t - 1000 },
  ];
  await page.route('**/api/requests', (route) => route.fulfill({ json: { entries, updatedAt: t, stats: {} } }));
  await page.goto('/');
  const rows = page.locator('[data-feed] li');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(/\scold\s/);
  await expect(rows.nth(0).locator('.c')).toHaveClass(/hit/);
  await expect(rows.nth(1)).toContainText(/\swarm\s/);
});

test('a visited page is recorded by the middleware and shows up in the tail', async ({ page, request }) => {
  // /api/experience is allowlisted but not in the seed, so a row for it can only come from the middleware.
  expect((await request.get('/api/experience')).ok()).toBe(true);
  const feed = await (await request.get('/api/requests')).json();
  const recorded = { m: 'GET', p: '/api/experience', s: 200, c: expect.stringMatching(/^(cold|warm)$/) };
  expect(feed.entries).toContainEqual(expect.objectContaining(recorded));

  // Parallel workers push it past the terminal's 8 rows, so the page gets the recorded row on top.
  const entry = feed.entries.find((e: { p: string }) => e.p === '/api/experience');
  await page.route('**/api/requests', (route) => route.fulfill({ json: { ...feed, entries: [entry, ...feed.entries] } }));
  await page.goto('/');
  await expect(page.locator('[data-feed] li').filter({ hasText: /\/api\/experience\s+200/ }).first()).toBeVisible();
});

test('an unknown path is recorded as a 404 unknown-path entry', async ({ request }) => {
  expect((await request.get('/wp-login.php')).status()).toBe(404);
  const feed = await (await request.get('/api/requests')).json();
  expect(feed.entries).toContainEqual(expect.objectContaining({ p: '404 · unknown path', s: 404 }));
});

test('does not poll /api/requests while the terminal is out of view', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('[data-feed] li').first()).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // A fresh observer reports in the same rendering step as the terminal's own, so this waits for it.
  const intersecting = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        new IntersectionObserver((entries, observer) => {
          observer.disconnect();
          resolve(entries[0].isIntersecting);
        }).observe(document.querySelector('[data-terminal]')!);
      }),
  );
  expect(intersecting).toBe(false);

  const polls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/requests') polls.push(r.url());
  });
  await page.clock.runFor(30_000);
  expect(polls).toHaveLength(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => {
    await page.clock.runFor(5_000);
    return polls.length;
  }).toBeGreaterThan(0);
});
