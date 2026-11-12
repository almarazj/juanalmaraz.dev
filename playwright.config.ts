import { defineConfig } from '@playwright/test';

// Tests and the server both read DynamoDB Local; workers inherit this.
process.env.AWS_ENDPOINT_URL_DYNAMODB ??= 'http://localhost:8000';

// E2E_PORT lets the suite run beside a dev server on 4321.
const port = Number(process.env.E2E_PORT ?? 4321);

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  webServer: {
    // Pages read Firestore on every request, so the emulator needs the sample content first.
    command: 'pnpm seed && pnpm build && node dist/server/entry.mjs',
    url: `http://localhost:${port}`,
    env: { HOST: 'localhost', PORT: String(port), ADMIN_EMAIL: 'owner@example.com' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
