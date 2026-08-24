import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const candidateRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(candidateRoot, '../..');
const execFileAsync = promisify(execFile);
let homeHtml = '';
let articleHtml = '';
let reviewHtml = '';
let memoryHtml = '';

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
  [homeHtml, articleHtml, reviewHtml, memoryHtml] = await Promise.all([
    readFile(join(candidateRoot, 'build/client/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/articles/why-i-read-in-the-ai-era/index.html',
    ), 'utf8'),
    readFile(join(candidateRoot, 'build/client/reviews/black-swan/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/memory/agent-harnesses-are-operating-systems/index.html',
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

  it('emits one route-scoped critical style while preserving eager Framework bootstrap and shared rules', () => {
    const routeHtml = [homeHtml, articleHtml, reviewHtml, memoryHtml];
    const routeCss = routeHtml.map((html) => {
      const styles = [...html.matchAll(
        /<style data-current-parity="true">([\s\S]*?)<\/style>/gu,
      )];
      expect(styles).toHaveLength(1);
      expect(html).not.toContain('rel="stylesheet"');
      expect(html).not.toContain('rel="modulepreload"');
      expect(html).not.toContain('application/react-router-deferred');
      expect(html).not.toContain('requestAnimationFrame(() => setTimeout');
      const modules = [...html.matchAll(
        /<script\b(?=[^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/gu,
      )];
      expect(modules).toHaveLength(1);
      expect(modules[0]?.[0]).toContain('async=""');
      expect(modules[0]?.[1]).toContain('window.__reactRouterRouteModules');
      expect(modules[0]?.[1]).toMatch(/import\("\/assets\/entry\.client-[^"]+\.js"\);/u);
      expect(styles[0]?.[1]).toContain('.site-header__inner');
      expect(styles[0]?.[1]).toContain(':where(a,button,summary):focus-visible');
      expect(styles[0]?.[1]).toContain('@media (prefers-reduced-motion:reduce)');
      return styles[0]?.[1] ?? '';
    });

    expect(routeCss[0]).not.toContain('.press-page');
    expect(routeCss[0]).not.toContain('.book-sheet');
    expect(routeCss[0]).toContain('.public-scene');
    expect(routeCss[0]).toContain('.visually-hidden');
    for (const detailCss of routeCss.slice(1)) {
      expect(detailCss).not.toContain('.storyworld-page');
      expect(detailCss).not.toContain('.public-scene');
      expect(detailCss).not.toContain('.visually-hidden');
      expect(detailCss).toContain('.press-page');
      expect(detailCss).toContain('.press-sheet');
    }
    expect(routeCss[1]).toContain('.article-masthead');
    expect(routeCss[1]).not.toContain('.book-sheet');
    expect(routeCss[1]).not.toContain('.memory-thought');
    expect(routeCss[2]).toContain('.book-sheet');
    expect(routeCss[2]).not.toContain('.article-masthead');
    expect(routeCss[2]).not.toContain('.memory-thought');
    expect(routeCss[3]).toContain('.memory-thought');
    expect(routeCss[3]).not.toContain('.article-masthead');
    expect(routeCss[3]).not.toContain('.book-sheet');
    expect(routeCss[0].length).toBeLessThan(10_000);
    for (const detailCss of routeCss.slice(1)) expect(detailCss.length).toBeLessThan(8_000);
    expect(homeHtml).toContain(
      '<link rel="preload" as="image" href="/assets/content/articles/why-i-read-in-the-ai-era/reading-desk-cobalt-1536w.avif" type="image/avif" fetchPriority="high"/>',
    );
  });

  it('keeps inlined critical CSS out of the hydration chunks', async () => {
    const assetRoot = join(candidateRoot, 'build/client/assets');
    const javascriptAssets = (await readdir(assetRoot)).filter((file) => file.endsWith('.js'));
    const assets = await Promise.all(javascriptAssets.map(async (file) => ({
      file,
      source: await readFile(join(assetRoot, file), 'utf8'),
    })));
    const rootAssets = assets.filter(({ source }) => source.includes('data-current-parity'));

    expect(rootAssets).toHaveLength(1);
    expect(rootAssets[0]?.source).not.toContain('.site-header__inner{');
    expect(rootAssets[0]?.source).not.toContain('.public-scene');
    expect(rootAssets[0]?.source).not.toContain('.article-masthead');
    expect(rootAssets[0]?.source).not.toContain('.book-sheet');
    expect(rootAssets[0]?.source).not.toContain('.memory-thought');

    const bundledCriticalCss = [
      '.site-header__inner{',
      '.public-scene{',
      '.article-masthead{',
      '.book-sheet{',
      '.memory-thought{',
    ];
    const bundledJavascript = assets.map(({ source }) => source).join('\n');
    for (const pattern of bundledCriticalCss) {
      expect(bundledJavascript).not.toContain(pattern);
    }
  });
});
