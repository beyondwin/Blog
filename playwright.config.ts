import { defineConfig } from '@playwright/test';

const DEFAULT_BASE_URL = 'http://127.0.0.1:4391';
const DEFAULT_WEB_SERVER = {
  command: 'npm run site:preview -- --host 127.0.0.1 --port 4391',
  url: 'http://127.0.0.1:4391/',
  timeout: 120_000,
  reuseExistingServer: false,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
};

interface ExternalStackEnvironment {
  readonly FORM_THOUGHT_E2E_EXTERNAL_STACK?: string;
  readonly FORM_THOUGHT_E2E_EXTERNAL_ORIGIN?: string;
  readonly FORM_THOUGHT_E2E_PREVIEW_ORIGIN?: string;
  readonly FORM_THOUGHT_E2E_API_ORIGIN?: string;
}

export function resolvePlaywrightStack(env: ExternalStackEnvironment): {
  baseURL: string;
  external: boolean;
  webServer: typeof DEFAULT_WEB_SERVER | undefined;
} {
  if (env.FORM_THOUGHT_E2E_EXTERNAL_STACK !== '1') {
    return { baseURL: DEFAULT_BASE_URL, external: false, webServer: DEFAULT_WEB_SERVER };
  }
  const names = [
    'FORM_THOUGHT_E2E_EXTERNAL_ORIGIN',
    'FORM_THOUGHT_E2E_PREVIEW_ORIGIN',
    'FORM_THOUGHT_E2E_API_ORIGIN',
  ] as const;
  const origins = names.map((name) => {
    const value = env[name];
    const match = value?.match(/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/u);
    const port = match ? Number(match[1]) : 0;
    if (!match || port > 65_535) throw new Error(`${name} must be an exact external loopback origin`);
    return value!;
  });
  if (new Set(origins).size !== origins.length) {
    throw new Error('external stack origins must be pairwise distinct');
  }
  return { baseURL: origins[0]!, external: true, webServer: undefined };
}

const stack = resolvePlaywrightStack(process.env);

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
    baseURL: stack.baseURL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium-151',
    use: { browserName: 'chromium' },
  }],
  webServer: stack.webServer,
});
