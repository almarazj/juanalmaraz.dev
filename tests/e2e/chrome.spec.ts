import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

test('header shows name and search at the top and adds the section after the hero', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header.getByText('Juan Almaraz')).toBeVisible();
  await expect(header.getByRole('button', { name: /search or jump to/i })).toBeVisible();
  await expect(header.locator('[data-header-section]')).toBeEmpty();
  await page.locator('#experience').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('#experience')!.scrollIntoView());
  await expect(header.getByText('Juan Almaraz')).toBeVisible();
  await expect(header.getByText('/ experience')).toBeVisible();
  await expect(header.getByRole('button', { name: /search or jump to/i })).toBeVisible();
});

test('rail entry click scrolls, marks it on, and expands only the current section', async ({ page }) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'On this page' });
  await page.evaluate(() => document.querySelector('#experience')!.scrollIntoView());
  await expect(rail.locator('[data-section="experience"] .entries')).toBeVisible();
  await expect(rail.locator('[data-section="projects"] .entries')).toBeHidden();

  const entry = rail.locator('a.entry[href="#proj-engineering"]');
  await page.evaluate(() => document.querySelector('#projects')!.scrollIntoView());
  await entry.click();
  await expect(entry).toHaveClass(/\bon\b/);
  await expect(rail.locator('[data-section="projects"] .entries')).toBeVisible();
  await expect(rail.locator('[data-section="experience"] .entries')).toBeHidden();
  const top = await page.locator('#proj-engineering').evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(160);
});

test('rail is hidden under 960px', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden();
});

test('footer shows the build stamp', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  const stamp = footer.locator('[data-stamp] > span');
  await expect(stamp).toHaveCount(3);
  await expect(stamp.nth(0)).toHaveText(new RegExp(`^v${version.replace(/\./g, '\\.')}$`));
  await expect(stamp.nth(1)).toHaveText(/^[0-9a-f]{7}$/);
  await expect(stamp.nth(2)).not.toBeEmpty();
  await expect(footer.getByRole('button', { name: 'Site status' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', '/rss.xml');
});

for (const width of [320, 500, 700, 760, 1000, 1600]) {
  test(`header name and search do not overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/');
    await page.evaluate(() => document.querySelector('#experience')!.scrollIntoView());
    const header = page.getByRole('banner');
    await expect(header.getByText('Juan Almaraz')).toBeVisible();
    const who = await header.locator('.who').boundingBox();
    const search = await header.locator('.search').boundingBox();
    if (search) expect(who!.x + who!.width).toBeLessThanOrEqual(search.x);
    const toggle = await header.locator('.theme-toggle').boundingBox();
    expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(width);
  });
}

test('clicking the last rail entry marks it on', async ({ page }) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'On this page' });
  const last = rail.locator('a.entry[href="#about-questions"]');
  await page.evaluate(() => document.querySelector('#about')!.scrollIntoView());
  await last.click();
  await expect(last).toHaveClass(/\bon\b/);
  await expect(last).toHaveAttribute('aria-current', 'location');
  await expect(rail.locator('a.entry[href="#about-me"]')).not.toHaveAttribute('aria-current', /.*/);
  await expect(rail.locator('a.section.on')).toHaveAttribute('aria-current', 'location');
});

for (const path of ['/', '/writing', '/writing/terraform-one-person', '/missing-page']) {
  test(`footer spans the page width, centered in the viewport, at ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const footer = (await page.locator('body > .site-footer').boundingBox())!;
    expect(footer.width).toBe(1040);
    expect(footer.x).toBe((1440 - 1040) / 2);
  });
}

for (const width of [1100, 1440]) {
  test(`header, hero, content, rail and footer share one frame at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const left = (width - 1040) / 2;
    const right = left + 1040;
    const [name, toggle, hero, content, footer] = await Promise.all(
      ['.site-header .name', '.site-header .right', '.hero', 'main .sections', 'body > .site-footer'].map(box),
    );
    const rail = (await page.getByRole('navigation', { name: 'On this page' }).boundingBox())!;
    for (const b of [name, hero, content, footer]) expect(b.x).toBe(left);
    for (const b of [toggle, hero, rail, footer]) expect(b.x + b.width).toBe(right);
    expect(rail.x).toBe(content.x + content.width + 100);
  });
}

test('the rail starts level with Experience and then sticks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'On this page' });
  const experience = (await page.locator('#experience').boundingBox())!;
  expect(Math.abs((await rail.boundingBox())!.y - experience.y)).toBeLessThanOrEqual(1);

  await page.evaluate(() => document.querySelector('#education')!.scrollIntoView());
  await expect.poll(async () => (await rail.boundingBox())!.y).toBe(96);
});
