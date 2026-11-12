import { expect, test } from '@playwright/test';

const dot = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Site status/ });

test('hover shows the $ status tooltip, it follows the pointer and hides 40 px away', async ({ page }) => {
  await page.goto('/');
  await expect(dot(page)).toHaveAttribute('aria-label', /operational|degraded/);
  await dot(page).scrollIntoViewIfNeeded();
  const box = (await dot(page).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 30, cy - 30);
  await page.mouse.move(cx, cy);
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('$ status');
  await expect(tip).toContainText('Database (Firestore)');
  const before = (await tip.boundingBox())!;
  await page.mouse.move(cx + 10, cy + 10);
  await expect.poll(async () => (await tip.boundingBox())!.x).not.toBe(before.x);
  await page.mouse.move(cx + 40, cy + 40);
  await expect(tip).toBeHidden();
});

test('keyboard focus anchors the tooltip and Escape hides it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'RSS' }).focus();
  await page.keyboard.press('Tab');
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  const t = (await tip.boundingBox())!;
  const d = (await dot(page).boundingBox())!;
  expect(t.y + t.height).toBeLessThanOrEqual(d.y);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('the dot meets the 24px target', async ({ page }) => {
  await page.goto('/');
  const box = (await dot(page).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
});

test('a failing status endpoint turns the dot red', async ({ page }) => {
  await page.route('**/api/status', (r) => r.fulfill({ status: 500, body: 'x' }));
  await page.goto('/');
  await expect(dot(page)).toHaveAttribute('aria-label', 'Site status: major outage');
  await page.getByRole('link', { name: 'RSS' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tooltip')).toContainText('App (Cloud Run)');
});

test('Enter reopens the tooltip after Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'RSS' }).focus();
  await page.keyboard.press('Tab');
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(tip).toBeVisible();
  await expect(page.locator('#status-tip')).not.toBeEmpty();
});

test('the tooltip has description text before it is ever shown', async ({ page }) => {
  await page.goto('/');
  await expect(dot(page)).toHaveAttribute('aria-label', /operational|degraded/);
  await expect(page.locator('#status-tip')).toContainText('Database (Firestore)');
});
