import { expect, test } from '@playwright/test';

const ORIGIN = 'https://juanalmaraz.dev';

test('rss lists only published posts', async ({ request }) => {
  const res = await request.get('/rss.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('xml');
  const xml = await res.text();
  expect(xml).toContain('<rss');
  expect(xml).toContain(`${ORIGIN}/writing/live-request-log`);
  expect(xml).toContain(`${ORIGIN}/writing/terraform-one-person`);
  expect(xml).not.toContain('draft-post');
});

test('sitemap lists home, writing and published posts', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/', '/writing', '/writing/live-request-log', '/writing/terraform-one-person']) {
    expect(xml).toContain(`<loc>${ORIGIN}${path}</loc>`);
  }
  expect(xml).not.toContain('draft-post');
});

for (const path of ['/', '/writing', '/writing/live-request-log']) {
  test(`${path} has OG tags and a canonical URL`, async ({ page }) => {
    await page.goto(path);
    for (const p of ['og:title', 'og:description', 'og:image']) {
      await expect(page.locator(`meta[property="${p}"]`)).toHaveAttribute('content', /.+/);
    }
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${ORIGIN}/og.png`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGIN}${path}`);
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', '/rss.xml');
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
  });
}

test('robots.txt disallows /admin', async ({ request }) => {
  const txt = await (await request.get('/robots.txt')).text();
  expect(txt).toMatch(/Disallow: \/admin/);
  expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
});
