import { expect, test } from '@playwright/test';

const modal = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Search or jump to' });

test('/ and Ctrl+K open the palette, Esc closes and restores focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(modal(page)).toBeVisible();
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();

  await page.keyboard.press('Control+k');
  await expect(modal(page)).toBeVisible();
  await page.keyboard.press('Escape');

  const opener = page.locator('[data-palette-open]');
  await page.evaluate(() => document.querySelector('#experience')!.scrollIntoView());
  await opener.focus();
  await opener.click();
  await expect(modal(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('typing then Enter navigates', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('boca');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#about-questions$/);
  await expect(modal(page)).toBeHidden();
});

test('results show their shortcut keys and the cheat sheet is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  const row = page.getByRole('option', { name: /Experience/ }).first();
  await expect(row.locator('kbd')).toHaveText(['g', 'e']);
  await expect(modal(page).getByText('next / prev section')).toBeVisible();
});

test('g e jumps, t toggles theme, keys are ignored inside the field', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('g');
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/#experience$/);
  await page.keyboard.press('t');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.keyboard.press('/');
  await page.keyboard.type('t');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.getByRole('combobox')).toHaveValue('t');
});

test('a javascript: target in the index does nothing', async ({ page }) => {
  await page.route('**/search-index.json', (r) =>
    r.fulfill({
      json: [{ group: 'Links', label: 'Evil', hint: '', target: 'javascript:window.__pwned=1' }],
    }),
  );
  await page.goto('/');
  await page.keyboard.press('/');
  await page.getByRole('option', { name: /Evil/ }).click();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page).toHaveURL(/\/$/);
});

test('a failed index load keeps its error message', async ({ page }) => {
  await page.route('**/search-index.json', (r) => r.fulfill({ status: 500 }));
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(page.getByText('Search is unavailable right now.')).toBeVisible();
  await page.keyboard.type('x');
  await expect(page.getByText('Search is unavailable right now.')).toBeVisible();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('search button is usable at scroll 0', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Search or jump to' }).click();
    await expect(modal(page)).toBeVisible();
  });

  test('opens a bottom sheet with filter chips', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.querySelector('#experience')!.scrollIntoView());
    await page.getByRole('button', { name: 'Search or jump to' }).click();
    const sheet = modal(page);
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(844, 0);
    expect(box.width).toBe(390);
    const chips = sheet.getByRole('group', { name: 'Filter by group' });
    await chips.getByRole('button', { name: 'Writing' }).click();
    await expect(sheet.getByRole('option').first()).toBeVisible();
    await expect(chips.getByRole('button', { name: 'Writing' })).toHaveAttribute('aria-pressed', 'true');
  });
});
