const { defineConfig, devices } = require('@playwright/test');
if (process.env.RL_BROWSER_TESTS !== 'true' && !process.argv.includes('--list')) {
  throw new Error('Run npm run test:browser so Firebase configuration is isolated before starting the browser.');
}

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    // Run the most transport-sensitive engine first in the optional full suite.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'cd routeLogisticsWeb && node node_modules/vite/bin/vite.js build --outDir .browser-dist && node node_modules/vite/bin/vite.js preview --outDir .browser-dist --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
