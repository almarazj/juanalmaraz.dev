import { expect, test } from '@playwright/test';

const bg = (page: import('@playwright/test').Page) =>
  page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);

test('fresh visit is light with no data-mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', /.*/);
  expect(await bg(page)).toBe('rgb(251, 251, 250)');
});

test('toggle switches to dark and survives reload', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /dark mode/i });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await bg(page)).toBe('rgb(20, 21, 24)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  expect(await bg(page)).toBe('rgb(20, 21, 24)');
  await expect(page.getByRole('button', { name: /dark mode/i })).toHaveAttribute('aria-pressed', 'true');
});

test.describe('OS dark scheme', () => {
  test.use({ colorScheme: 'dark' });
  test('still renders light', async ({ page }) => {
    await page.goto('/');
    expect(await bg(page)).toBe('rgb(251, 251, 250)');
  });
});
