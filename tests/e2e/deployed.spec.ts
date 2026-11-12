import { expect, test } from '@playwright/test';

const { BASE_URL, FUNCTION_URL, EXPECTED_VERSION } = process.env;

test.skip(!BASE_URL, 'runs only against a deployed site (BASE_URL)');

test('home is cacheable and a repeat request hits CloudFront', async ({ request }) => {
  const first = await request.get('/');
  expect(first.status()).toBe(200);
  expect(first.headers()['cache-control']).toContain('s-maxage=300');
  const second = await request.get('/');
  expect(second.headers()['x-cache']).toBe('Hit from cloudfront');
});

test('/api/me returns JSON', async ({ request }) => {
  const res = await request.get('/api/me');
  expect(res.headers()['content-type']).toContain('application/json');
  await res.json();
});

test('/api/status is ok overall', async ({ request }) => {
  const body = await (await request.get('/api/status')).json();
  expect(body.overall).toBe('ok');
});

test('/api/health is 200 and never cached', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('no-store');
});

test('/admin without a session is 403', async ({ request }) => {
  expect((await request.get('/admin', { maxRedirects: 0 })).status()).toBe(403);
});

test('the raw function URL refuses direct access', async ({ request }) => {
  test.skip(!FUNCTION_URL, 'FUNCTION_URL not set');
  expect((await request.get(FUNCTION_URL!)).status()).toBe(403);
});

test('footer stamp shows the expected version', async ({ page }) => {
  test.skip(!EXPECTED_VERSION, 'EXPECTED_VERSION not set');
  await page.goto('/');
  const stamp = page.getByRole('contentinfo').locator('[data-stamp] > span').first();
  await expect(stamp).toHaveText(`v${EXPECTED_VERSION}`);
});
