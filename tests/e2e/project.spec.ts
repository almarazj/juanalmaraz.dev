import { expect, test } from '@playwright/test';

test('a card opens its project page with meta, body, stack, links and the next project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'juanalmaraz.dev', exact: true }).click();
  await expect(page).toHaveURL('/projects/juanalmaraz-dev');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('juanalmaraz.dev');
  const meta = page.locator('.head .meta');
  await expect(meta).toContainText('2026');
  await expect(meta).toContainText('Live');
  await expect(meta).toContainText('Personal');
  await expect(meta).toContainText('Backend');
  await expect(page.locator('.prose h2')).toHaveText(['Why', 'How it runs']);
  const rail = page.getByRole('navigation', { name: 'On this page' });
  await expect(rail.getByRole('link', { name: 'How it runs' })).toBeAttached();
  await expect(page.getByRole('list', { name: 'Stack' }).getByRole('listitem')).toHaveText(['Astro', 'DynamoDB', 'Lambda']);
  await expect(page.getByRole('link', { name: 'Source ↗' })).toHaveAttribute('href', 'https://github.com/almarazj/juanalmaraz.dev');

  const more = page.getByRole('navigation', { name: 'More projects' });
  await expect(more.getByRole('link', { name: /Previous project/ })).toHaveCount(0);
  await more.getByRole('link', { name: /Next project/ }).click();
  await expect(page).toHaveURL('/projects/document-ingestion');
});

test('a confidential project shows no screenshot and says why', async ({ page }) => {
  await page.goto('/projects/document-ingestion');
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.getByText(/Confidential client work/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Previous project/ })).toHaveAttribute('href', '/projects/juanalmaraz-dev');
});

test('the back link returns to the project on the home page', async ({ page }) => {
  await page.goto('/projects/phase-vocoder');
  await page.getByRole('link', { name: '← Projects' }).click();
  await expect(page).toHaveURL('/#proj-phase-vocoder');
  await expect(page.locator('#proj-phase-vocoder')).toBeInViewport();
});

test('a project with an image shows it whole, uncropped', async ({ page }) => {
  await page.goto('/projects/room-impulse-response');
  const img = page.locator('.hero img');
  await expect(img).toBeVisible();
  const fit = await img.evaluate((el: HTMLImageElement) => ({ ratio: el.clientWidth / el.clientHeight, natural: el.naturalWidth / el.naturalHeight }));
  expect(fit.ratio).toBeCloseTo(fit.natural, 1);
});

test('an unknown project is a 404', async ({ page }) => {
  const res = await page.goto('/projects/nope');
  expect(res!.status()).toBe(404);
});
