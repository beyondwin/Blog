import { defineConfig } from '@playwright/test';

const PORT = 4397;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',
  outputDir: 'output/playwright/form-and-thought-reference-comparison/artifacts',
  reporter: [['line']],
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'form-thought-chromium',
    use: { browserName: 'chromium' },
  }],
  webServer: {
    command: [
      'npm run public-release:build',
      'npm run public-release:verify',
      'npm run site:build',
      `npm run site:preview -- --host 127.0.0.1 --port ${PORT}`,
    ].join(' && '),
    url: `${BASE_URL}/`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
