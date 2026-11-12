import { defineConfig } from '@playwright/test';

// Runs against a live site: BASE_URL, FUNCTION_URL and EXPECTED_VERSION come from the release build.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'deployed.spec.ts',
  retries: 1,
  reporter: 'list',
  use: { baseURL: process.env.BASE_URL },
});
