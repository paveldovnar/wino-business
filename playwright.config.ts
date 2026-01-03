import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially for on-chain tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker for on-chain tests
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 180000, // 180 second timeout for on-chain tests
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: process.env.APP_URL || 'https://wino-business.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
