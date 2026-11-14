import { expect, test } from '@playwright/test';

const color = (loc: import('@playwright/test').Locator) => loc.evaluate((el) => getComputedStyle(el).color);
const tokenColor = (page: import('@playwright/test').Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('each section label uses its section color', async ({ page }) => {
  for (const id of ['experience', 'projects', 'education', 'writing', 'about']) {
    const label = page.locator(`#${id} > h2`);
    await expect(label).toBeVisible();
    expect(await color(label)).toBe(await tokenColor(page, `--c-${id}`));
  }
});

test('work experience cards show tenure, type and highlights', async ({ page }) => {
  await expect(page.locator('#experience .section-label')).toHaveText('Work experience');
  const cards = page.locator('#experience article');
  for (const card of await cards.all()) {
    await expect(card.locator('.logo')).toBeVisible();
    await expect(card.locator('.meta')).toHaveText(/^\d+\.\d yrs/);
  }
  await expect(cards.first().locator('.highlights li')).toHaveCount(4);
  await expect(cards.first().getByRole('link', { name: 'Mecantronic' })).toHaveAttribute('href', 'https://mecantronic.com.ar/');
  await expect(page.locator('#exp-infiniem-labs .meta')).toHaveText('0.4 yrs · Internship');
  await expect(page.locator('#exp-untref-ta .summary')).toHaveCount(0);
});

test('projects share one grid that the domain filter narrows without JavaScript', async ({ browser }) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto('/');
  const cards = page.locator('#projects article');
  const filter = page.getByRole('group', { name: 'Show projects by domain' });
  await expect(cards).toHaveCount(7);
  await expect(filter.getByText('DSP')).toContainText('2');

  await filter.getByText('Electronics').click();
  await expect(cards.filter({ visible: true })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Vibration isolation system' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Webhook relay' })).toBeHidden();

  await filter.getByText('All').click();
  await expect(cards.filter({ visible: true })).toHaveCount(7);
  await page.close();
});

test('a project card shows its context, live state and confidential work, and links to its page', async ({ page }) => {
  const card = page.locator('#proj-document-ingestion');
  await expect(card.getByText('Client', { exact: true })).toBeVisible();
  await expect(card.getByText('Backend · confidential')).toBeVisible();
  await expect(card.getByRole('img', { name: 'Live in production' })).toBeVisible();
  await expect(page.locator('#proj-webhook-relay').getByRole('img', { name: 'Live in production' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Document ingestion pipeline' })).toHaveAttribute('href', '/projects/document-ingestion');
});

test('a certificate opens a dialog with the original link and closes back to its trigger', async ({ page }) => {
  const trigger = page.getByRole('button', { name: /EF SET English Certificate/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'EF SET English Certificate' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Open original/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('a certificate dialog closes on a backdrop click but not on a click inside it', async ({ page }) => {
  await page.getByRole('button', { name: /EF SET English Certificate/ }).click();
  const dialog = page.getByRole('dialog', { name: 'EF SET English Certificate' });
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + box.height - 4);
  await expect(dialog).toBeVisible();
  await page.mouse.click(box.x / 2, box.y / 2);
  await expect(dialog).toBeHidden();
});

test('photo stack sends the top photo back on Enter', async ({ page }) => {
  const stack = page.getByRole('group', { name: /photos/i });
  const counter = page.locator('[data-photo-counter]');
  await expect(counter).toHaveText(/^1 \/ \d+$/);
  const n = Number((await counter.textContent())!.split('/')[1]);
  expect(n).toBeGreaterThan(1);
  await stack.focus();
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText(`2 / ${n}`);
  await expect(page.locator('[data-photo-status]')).toHaveText(/^Photo 2 of \d+: Lab days/);
  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(counter).toHaveText(`${n > 2 ? 3 : 1} / ${n}`);
});

test('dragging the top photo past 90px sends it back, a short drag returns it', async ({ page }) => {
  const counter = page.locator('[data-photo-counter]');
  const top = page.locator('[data-stack] .polaroid[data-pos="0"]');
  await top.scrollIntoViewIfNeeded();
  const drag = async (dx: number) => {
    const box = (await top.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };
  await drag(50);
  await expect(counter).toHaveText(/^1 \//);
  await expect(top).not.toHaveAttribute('style', /translate/);
  await drag(120);
  await expect(counter).toHaveText(/^2 \//);
});

test('writing list shows date, minutes and title', async ({ page }) => {
  const item = page.locator('#writing article').first();
  await expect(item.locator('time')).toHaveText(/\w{3} \d{1,2}, \d{4}/);
  await expect(item.getByText(/\d+ min/)).toBeVisible();
  await expect(item.getByRole('link', { name: 'A live request log on the GCP free tier' })).toHaveAttribute(
    'href',
    '/writing/live-request-log',
  );
});

test('hero links the resume', async ({ page }) => {
  await expect(page.locator('#hero').getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/resume.pdf');
});

for (const width of [960, 1100, 1440]) {
  test(`content never sits under the rail at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const rail = await page.getByRole('navigation', { name: 'On this page' }).boundingBox();
    const right = await page.locator('main .sections').evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(rail!.x);
  });
}

test('no horizontal page scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('processed images load', async ({ page }) => {
  await page.goto('/');
  await page.locator('#about img').first().scrollIntoViewIfNeeded();
  const broken = await page.locator('img').evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length,
  );
  expect(broken).toBe(0);
});

test('technologies board sits between education and projects with one column per level', async ({ page }) => {
  const order = await page.locator('main .sections > section').evaluateAll((s) => s.map((x) => x.id));
  expect(order).toEqual(['experience', 'education', 'technologies', 'projects', 'writing', 'about']);
  const board = page.locator('#technologies');
  await expect(board.locator('.head')).toHaveText([/Production\s*\d+/, /Side projects\s*\d+/, /Tinkering\s*\d+/]);
  await expect(board.locator('.lv-production .tech', { hasText: 'Python' })).toBeVisible();
  // juanalmaraz.dev is live, so its stack counts as production; the webhook relay is not.
  await expect(board.locator('.lv-production .tech', { hasText: 'Astro' })).toBeVisible();
  await expect(board.locator('.lv-side .tech', { hasText: 'SNS' })).toBeVisible();
  await expect(board.locator('.legend')).toBeHidden();
});

test('technologies board stacks lanes with one legend on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const board = page.locator('#technologies');
  await expect(board.locator('.head').first()).toBeHidden();
  await expect(board.locator('.legend li')).toHaveText(['Tinkering', 'Side projects', 'Production']);
});

test('the degree reads like a role: years beside the title, linked school and thesis', async ({ page }) => {
  const degree = page.locator('#edu-degree');
  await expect(degree.locator('h3')).toHaveText('B.Eng. in Sound Engineering');
  await expect(degree.locator('.period')).toHaveText('2016 - 2024');
  await expect(degree.getByRole('link', { name: 'Universidad Nacional de Tres de Febrero' })).toHaveAttribute('href', 'https://www.untref.edu.ar/');
  await expect(degree.locator('.thesis')).toContainText('audio watermarking');
});
