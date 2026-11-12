import { expect, test } from '@playwright/test';

test('home responds 200 with an English document', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html[lang="en"]')).toHaveCount(1);
});
