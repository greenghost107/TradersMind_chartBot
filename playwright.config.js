// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'unit-tests',
      testMatch: '**/ticker-detection.spec.js',
      use: {
        // Unit tests don't need browser context
      },
    },
    {
      name: 'integration-tests',
      testMatch: '**/bot-integration.spec.js',
      use: {
        // Integration tests for Discord bot functionality
      },
    },
    {
      name: 'retention-tests',
      testMatch: '**/retention-policy.spec.js',
      use: {
        // Retention policy tests
      },
    },
    {
      name: 'fallback-tests',
      testMatch: '**/yahoo-fallback.spec.js',
      use: {
        // Yahoo Finance fallback tests
      },
    },
  ],
});