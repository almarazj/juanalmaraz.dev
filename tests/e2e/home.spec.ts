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

test('experience cards show a monogram and a tenure bar', async ({ page }) => {
  const cards = page.locator('#experience article');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    await expect(card.locator('.monogram')).toHaveText(/^\w{1,3}$/);
    const bar = card.getByRole('img', { name: /years? at/ });
    await expect(bar).toBeVisible();
  }
});

test('backend strip scrolls with the next button and marks confidential projects', async ({ page }) => {
  const strip = page.locator('[data-strip]');
  const before = await strip.evaluate((el) => el.scrollLeft);
  await page.getByRole('button', { name: 'Next projects' }).click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  const conf = strip.locator('article', { hasText: 'Document ingestion pipeline' });
  await expect(conf.getByText('conf.', { exact: true })).toBeVisible();
});

test('strip arrows are disabled at each end', async ({ page }) => {
  const strip = page.locator('[data-strip]');
  const prev = page.getByRole('button', { name: 'Previous projects' });
  const next = page.getByRole('button', { name: 'Next projects' });
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));
  await expect(next).toBeDisabled();
  await expect(prev).toBeEnabled();
});


test('earlier engineering work lists engineering projects', async ({ page }) => {
  const group = page.getByRole('region', { name: 'Earlier engineering work' });
  await expect(group.getByRole('listitem')).toHaveCount(4);
  await expect(group.getByText('Room impulse response tool')).toBeVisible();
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

test('resume pill links to /resume.pdf', async ({ page }) => {
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

test('hero shows the site photo from S3', async ({ page }) => {
  await page.goto('/');
  const photo = page.locator('#hero img.photo');
  await expect(photo).toHaveAttribute('src', /images\/about\/profile-418\.webp/);
  expect(await photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
});
