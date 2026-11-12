import { expect, test } from '@playwright/test';

const slug = '/writing/live-request-log';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('body is IBM Plex Serif 18px with a 68ch measure', async ({ page }) => {
  await page.goto(slug);
  const prose = page.locator('.prose');
  const style = await prose.evaluate((el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.cssText = 'width:68ch;position:absolute;visibility:hidden';
    el.append(probe);
    const ch = probe.getBoundingClientRect().width;
    probe.remove();
    return { font: cs.fontFamily, size: cs.fontSize, max: parseFloat(cs.maxWidth), ch };
  });
  expect(style.font).toContain('IBM Plex Serif');
  expect(style.size).toBe('18px');
  expect(style.max).toBeCloseTo(style.ch, 0);
});

test('the right index lists h2s, follows the scroll and counts minutes left', async ({ page }) => {
  await page.goto(slug);
  const rail = page.getByRole('navigation', { name: 'On this page' });
  await expect(rail.locator('a.entry')).toHaveText(['Batching to stay free', 'Reading it back', 'Closing']);
  const left = rail.locator('[data-min-left]');
  const first = parseInt((await left.textContent())!, 10);
  await page.locator('#h-closing').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(rail.locator('a.entry.on')).toHaveText('Closing');
  await expect.poll(async () => parseInt((await left.textContent())!, 10)).toBeLessThan(first);
});

test('the copy button puts the code on the clipboard', async ({ page }) => {
  await page.goto(slug);
  const block = page.locator('.codeblock');
  await expect(block.locator('.file')).toHaveText('logger.ts');
  await block.getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('const batch: string[] = [];');
});

test('the copy button falls back to "select it" when the clipboard is refused', async ({ page }) => {
  await page.goto(slug);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) } });
  });
  const button = page.locator('.codeblock').getByRole('button');
  await button.click();
  await expect(button).toHaveText('select it');
});

test('drafts and unknown slugs return a real 404 with the site chrome', async ({ page }) => {
  for (const path of ['/writing/draft-post', '/writing/nope']) {
    const res = await page.goto(path);
    expect(res!.status()).toBe(404);
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  }
});

test('heading anchors do not change the heading name or duplicate page ids', async ({ page }) => {
  await page.goto(slug);
  await expect(page.getByRole('heading', { name: 'Closing', exact: true, level: 2 })).toBeVisible();
  const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test('series navigation links to the previous part', async ({ page }) => {
  await page.goto(slug);
  const nav = page.getByRole('navigation', { name: 'Series' });
  await expect(nav.getByRole('link', { name: /Terraform for a one-person project/ })).toHaveAttribute(
    'href',
    '/writing/terraform-one-person',
  );
  await page.goto('/writing/terraform-one-person');
  await expect(page.getByRole('navigation', { name: 'Series' }).getByRole('link', { name: /A live request log/ })).toBeVisible();
});

test('the writing index lists published posts only', async ({ page }) => {
  await page.goto('/writing');
  await expect(page.getByRole('link', { name: 'A live request log on the GCP free tier' })).toHaveAttribute('href', slug);
  await expect(page.getByText('Draft post')).toHaveCount(0);
});
