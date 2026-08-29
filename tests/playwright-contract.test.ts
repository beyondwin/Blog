import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import config from '../playwright.config';

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
});
