import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import config, { resolvePlaywrightStack } from '../playwright.config';

const execFileAsync = promisify(execFile);

describe('official public-site Playwright contract', () => {
  it('pins one Chromium project and the isolated 4391 production preview', () => {
    expect(config.projects).toEqual([{
      name: 'chromium-151',
      use: { browserName: 'chromium' },
    }]);
    expect(config.use).toMatchObject({
      baseURL: 'http://127.0.0.1:4391',
      browserName: 'chromium',
    });
    expect(config.webServer).toEqual({
      command: 'npm run site:preview -- --host 127.0.0.1 --port 4391',
      url: 'http://127.0.0.1:4391/',
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(config.workers).toBe(1);
    expect(config.retries).toBe(0);
    expect(config.snapshotPathTemplate).toBe(
      '{testDir}/{testFileName}-snapshots/{arg}{ext}',
    );
  });

  it('forwards host and port through the root workspace preview script', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts['site:preview'])
      .toBe('npm run preview --workspace @beyondwin/site --');

    const { stdout, stderr } = await execFileAsync('npm', [
      'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391', '--help',
    ]);
    expect(stdout).toContain('FORM & THOUGHT static preview');
    expect(stderr).not.toContain('Unknown cli config');
  }, 30_000);

  it('selects only three pairwise-distinct exact loopback origins in external-stack mode', () => {
    expect(resolvePlaywrightStack({
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://127.0.0.1:45101',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    })).toEqual({
      baseURL: 'http://127.0.0.1:45101',
      external: true,
      webServer: undefined,
    });
  });

  it.each([
    ['missing proxy', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
    ['non-loopback', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://192.0.2.1:45101',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
    ['credentials', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://user@127.0.0.1:45101',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
    ['path', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://127.0.0.1:45101/search/',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
    ['query', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://127.0.0.1:45101?x=1',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
    ['fragment', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://127.0.0.1:45101#x',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45102',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
    ['equal origins', {
      FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
      FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: 'http://127.0.0.1:45101',
      FORM_THOUGHT_E2E_PREVIEW_ORIGIN: 'http://127.0.0.1:45101',
      FORM_THOUGHT_E2E_API_ORIGIN: 'http://127.0.0.1:45103',
    }],
  ])('fails closed for %s external-stack configuration', (_label, env) => {
    expect(() => resolvePlaywrightStack(env)).toThrow(/external.*origin|distinct/u);
  });

  it.each([
    {},
    { FORM_THOUGHT_E2E_EXTERNAL_STACK: '0' },
    { FORM_THOUGHT_E2E_EXTERNAL_STACK: 'true' },
  ])('keeps default mode self-contained for %j', (env) => {
    expect(resolvePlaywrightStack(env)).toEqual({
      baseURL: 'http://127.0.0.1:4391',
      external: false,
      webServer: {
        command: 'npm run site:preview -- --host 127.0.0.1 --port 4391',
        url: 'http://127.0.0.1:4391/',
        timeout: 120_000,
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    });
  });
});
