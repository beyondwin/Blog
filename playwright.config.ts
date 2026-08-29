import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir: 'output/playwright/task14/artifacts',
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4391',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium-151',
    use: { browserName: 'chromium' },
  }],
  webServer: {
    command: 'npm run site:preview -- --host 127.0.0.1 --port 4391',
    url: 'http://127.0.0.1:4391/',
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
