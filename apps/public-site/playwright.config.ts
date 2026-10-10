import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const productionSmoke = process.env.PRODUCTION_SMOKE === 'true';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. */
  reporter: 'html',
  /* Shared settings for all the projects below. */
  use: {
    /* Production smoke tests point at an external URL and never start the local server. */
    baseURL: externalBaseURL || 'http://localhost:3000',
    /* Avoid retaining authenticated production data in CI artifacts. */
    trace: productionSmoke ? 'off' : 'on-first-retry',
    screenshot: productionSmoke ? 'off' : 'only-on-failure',
    video: productionSmoke ? 'off' : 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
