import { expect, type Page, test } from '@playwright/test';

const terminal = (page: Page) => page.locator('[data-terminal]');
const out = (page: Page) => page.locator('[data-out]');
const input = (page: Page) => page.locator('[data-in]');

async function focusPrompt(page: Page) {
  await terminal(page).locator('.line').click();
  await expect(input(page)).toBeFocused();
}

async function runCommand(page: Page, line: string) {
  await focusPrompt(page);
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test('the hero logs in on an Ubuntu tty and runs neofetch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Juan Almaraz' })).toBeAttached();
  await expect(out(page)).toContainText('ubuntu login: juan');
  await expect(out(page)).toContainText('Role: Backend Engineer');
  await expect(out(page)).toContainText(/Uptime: \d+\+ years in software engineering/);
  await expect(out(page)).toContainText(/Based: Buenos Aires, AR · \d{2}:\d{2} \(GMT-3\)/);
  await expect(out(page)).toContainText('Languages: Spanish (native), English (C1)');
  await expect(out(page)).toContainText(/Packages: \d+ projects, \d+ posts/);
  await expect(terminal(page).getByRole('link', { name: 'resume' })).toHaveAttribute('href', '/resume.pdf');
  await expect(terminal(page).locator('.line')).toContainText('juan@ubuntu:~$');
});

test('curl calls the real API and help lists only commands', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'curl -i /api/me');
  const response = out(page).locator('.blk').last();
  await expect(response).toContainText(/^HTTP\/[\d.]+ 200/);
  await expect(response).toContainText('content-type: application/json');
  await expect(response).toContainText('"name": "Juan Almaraz"');

  await runCommand(page, 'help');
  const help = out(page).locator('.blk').last();
  await expect(help).toContainText('Commands');
  await expect(help).toContainText('tail -f access.log');
  await expect(help).not.toContainText(/keys|pipes/i);
});

test('line editing: completion, suggestions, history and shortcuts', async ({ page }) => {
  await page.goto('/');
  await focusPrompt(page);

  await page.keyboard.type('cd pro');
  await page.keyboard.press('Tab');
  await expect(input(page)).toHaveValue('cd projects/');
  await page.keyboard.press('Enter');
  await expect(terminal(page).locator('.line')).toContainText('juan@ubuntu:~/projects$');

  await page.keyboard.type('ls');
  await page.keyboard.press('Enter');
  await expect(out(page).locator('.blk').last()).toContainText('juanalmaraz-dev.md');

  await page.keyboard.press('ArrowUp');
  await expect(input(page)).toHaveValue('ls');
  await page.keyboard.press('ArrowUp');
  await expect(input(page)).toHaveValue('cd projects/');

  await page.keyboard.press('Control+c');
  await expect(input(page)).toHaveValue('');
  await expect(out(page).locator('.echo').last()).toContainText('cd projects/^C');

  await page.keyboard.type('neo');
  await expect(terminal(page).locator('.line')).toContainText('neofetch');
  await page.keyboard.press('ArrowRight');
  await expect(input(page)).toHaveValue('neofetch');

  await page.keyboard.press('Control+l');
  await expect(out(page).locator('> *')).toHaveCount(0);
});

test('Tab on an empty prompt moves focus on, so the terminal never traps the keyboard', async ({ page }) => {
  await page.goto('/');
  await focusPrompt(page);
  await page.keyboard.press('Tab');
  await expect(input(page)).not.toBeFocused();
});

test('tail -f follows the live log, including requests made meanwhile, until Ctrl+C', async ({ page, request }) => {
  await page.goto('/');
  await runCommand(page, 'tail -f access.log');
  const log = out(page).locator('.blk').last();
  await expect(log).toContainText(/\d{2}:\d{2}:\d{2}\s+(GET|HEAD|POST)\s+\S/);

  // /api/experience is allowlisted but not in the seed, so this line can only come from the middleware.
  expect((await request.get('/api/experience')).ok()).toBe(true);
  await expect(out(page)).toContainText(/\/api\/experience\s+200/, { timeout: 15_000 });

  await page.keyboard.press('Control+c');
  await expect(out(page).locator('.blk').last()).toHaveText('^C');
  await expect(terminal(page).locator('.line')).toContainText('juan@ubuntu:~$');
});

test('an unknown path is recorded as a 404 unknown-path entry', async ({ request }) => {
  expect((await request.get('/wp-login.php')).status()).toBe(404);
  const feed = await (await request.get('/api/requests')).json();
  expect(feed.entries).toContainEqual(expect.objectContaining({ p: '404 · unknown path', s: 404 }));
});

test('tail -f does not poll /api/requests while the terminal is out of view', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await runCommand(page, 'tail -f access.log');
  await expect(out(page).locator('.blk').last()).toContainText(/\d{2}:\d{2}:\d{2}/);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // A fresh observer reports in the same rendering step as the terminal's own, so this waits for it.
  const intersecting = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        new IntersectionObserver((entries, observer) => {
          observer.disconnect();
          resolve(entries[0].isIntersecting);
        }).observe(document.querySelector('[data-terminal]')!);
      }),
  );
  expect(intersecting).toBe(false);

  const polls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/requests') polls.push(r.url());
  });
  await page.clock.runFor(30_000);
  expect(polls).toHaveLength(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => {
      await page.clock.runFor(5_000);
      return polls.length;
    })
    .toBeGreaterThan(0);
});

test('the JA spins, and holds still under reduced motion', async ({ page }) => {
  const art = page.locator('[data-terminal] .nf-art').last();

  await page.clock.install();
  await page.goto('/');
  const rest = await art.textContent();
  await page.clock.runFor(1_000);
  await expect(art).not.toHaveText(rest!);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const still = await art.textContent();
  await page.clock.runFor(1_000);
  await expect(art).toHaveText(still!);
});
