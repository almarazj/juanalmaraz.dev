import { expect, test } from '@playwright/test';

const LIGHT = 'rgb(251, 251, 250)';
const DARK = 'rgb(20, 21, 24)';
const bg = (page: import('@playwright/test').Page) =>
  page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);

test('fresh visit on a light system is light with no data-mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', /.*/);
  expect(await bg(page)).toBe(LIGHT);
  await expect(page.getByRole('button', { name: 'Dark mode' }).locator('.moon')).toBeVisible();
});

test('toggle switches to dark, shows the sun and survives reload', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle.locator('.sun')).toBeVisible();
  await expect(toggle.locator('.moon')).toBeHidden();
  expect(await bg(page)).toBe(DARK);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  expect(await bg(page)).toBe(DARK);
  await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
});

test('follows system changes until the reader picks a mode', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', /.*/);
});

test.describe('OS dark scheme', () => {
  test.use({ colorScheme: 'dark' });

  test('starts dark', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    expect(await bg(page)).toBe(DARK);
  });

  test('a light pick wins over the system after reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-mode', /.*/);
    expect(await bg(page)).toBe(LIGHT);
  });
});
