import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const candidateRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(candidateRoot, '../..');
const execFileAsync = promisify(execFile);
let homeHtml = '';
let articleHtml = '';

beforeAll(async () => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is required for the ordinary emitted-output build');
  await execFileAsync(process.execPath, [
    npmCli,
    'run',
    'build',
    '--workspace',
    '@beyondwin/site-react-router-spike',
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  [homeHtml, articleHtml] = await Promise.all([
    readFile(join(candidateRoot, 'build/client/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/articles/why-i-read-in-the-ai-era/index.html',
    ), 'utf8'),
  ]);
}, 120_000);

describe('React Router emitted critical output', () => {
  it('keeps the eager Framework bootstrap without dead activation output', () => {
    const moduleScripts = [...homeHtml.matchAll(
      /<script\b(?=[^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/gu,
    )];

    expect(moduleScripts).toHaveLength(1);
    expect(moduleScripts[0]?.[0]).toContain('async=""');
    expect(moduleScripts[0]?.[1]).toContain('window.__reactRouterRouteModules');
    expect(moduleScripts[0]?.[1]).toMatch(/import\("\/assets\/entry\.client-[^"]+\.js"\);/u);
    expect(homeHtml).not.toContain('application/react-router-deferred');
    expect(homeHtml).not.toContain('requestAnimationFrame(() => setTimeout');
  });

  it('emits only the proven critical CSS and home media priority path', () => {
    const criticalStyles = [...homeHtml.matchAll(
      /<style data-current-parity="true">([\s\S]*?)<\/style>/gu,
    )];

    expect(criticalStyles).toHaveLength(1);
    const articleCriticalStyles = [...articleHtml.matchAll(
      /<style data-current-parity="true">([\s\S]*?)<\/style>/gu,
    )];
    expect(articleCriticalStyles).toHaveLength(1);
    expect(criticalStyles[0]?.[1]).toBe(articleCriticalStyles[0]?.[1]);
    expect(criticalStyles[0]?.[1].length).toBeGreaterThan(12_000);
    expect(homeHtml).not.toContain('rel="modulepreload"');
    expect(homeHtml).toContain(
      '<link rel="preload" as="image" href="/assets/content/articles/why-i-read-in-the-ai-era/reading-desk-cobalt-1536w.avif" type="image/avif" fetchPriority="high"/>',
    );
  });
});
