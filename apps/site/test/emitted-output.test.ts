import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
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
let thoughtsIndexHtml = '';
let thoughtHtml = '';

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'u'))?.[1];
}

function srcSetCandidates(value: string | undefined): string[] {
  return value?.split(',').map((candidate) => candidate.trim().split(/\s+/u)[0] ?? '')
    .filter(Boolean) ?? [];
}

beforeAll(async () => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is required for the ordinary emitted-output build');
  await execFileAsync(process.execPath, [
    npmCli,
    'run',
    'build',
    '--workspace',
    '@beyondwin/site',
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  [homeHtml, articleHtml, reviewHtml, memoryHtml, thoughtsIndexHtml, thoughtHtml] = await Promise.all([
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
    readFile(join(candidateRoot, 'build/client/thoughts/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/thoughts/why-i-read-in-the-ai-era/index.html',
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
    const routeHtml = [homeHtml, articleHtml, reviewHtml, memoryHtml, thoughtsIndexHtml, thoughtHtml];
    const routeCss = routeHtml.map((html) => {
      const styles = [...html.matchAll(
        /<style data-critical-css="true">([\s\S]*?)<\/style>/gu,
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
      expect(styles[0]?.[1]).toContain(':where(a,button):focus-visible');
      expect(styles[0]?.[1]).toContain('@media (prefers-reduced-motion:reduce)');
      return styles[0]?.[1] ?? '';
    });

    expect(routeCss[0]).not.toContain('.reading-sheet');
    expect(routeCss[0]).not.toContain('.reading-threshold');
    expect(routeCss[0]).toContain('.public-scene');
    expect(routeCss[0]).toContain('.visually-hidden');
    for (const detailCss of routeCss.slice(1)) {
      expect(detailCss).not.toContain('.storyworld-page');
      expect(detailCss).not.toContain('.public-scene');
      expect(detailCss).toContain('.visually-hidden');
      expect(detailCss).toContain('[data-surface-mode=reading]');
      expect(detailCss).toContain('.reading-sheet');
    }
    expect(routeCss[1]).toContain('.reading-threshold');
    expect(routeCss[1]).not.toContain('.review-reading-page .content-figure');
    expect(routeCss[1]).not.toContain('.memory-thought');
    expect(routeCss[2]).toContain('.reading-threshold');
    expect(routeCss[2]).toContain('.review-reading-page .content-figure');
    expect(routeCss[2]).not.toContain('.memory-thought');
    expect(routeCss[3]).toContain('.memory-thought');
    expect(routeCss[3]).toContain('.reading-threshold');
    expect(routeCss[3]).toContain('.context-return');
    expect(routeCss[4]).not.toContain('.memory-thought');
    expect(routeCss[5]).not.toContain('.memory-thought');
    expect(routeCss[0].length).toBeLessThan(10_000);
    for (const detailCss of routeCss.slice(1)) expect(detailCss.length).toBeLessThan(12_000);
    const imagePreload = homeHtml.match(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/u)?.[0];
    expect(imagePreload).toContain('href="/assets/content/articles/why-i-read-in-the-ai-era/reading-desk-cobalt-1536w.avif"');
    expect(imagePreload).toContain('imageSizes="(max-width: 720px) 70vw, (max-width: 1540px) 61vw, 940px"');
    expect(imagePreload).toContain('fetchPriority="high"');
  });

  it('emits canonical thought pages and excludes the removed review compatibility page', async () => {
    expect(thoughtsIndexHtml).toContain('<title>생각 · FORM &amp; THOUGHT</title>');
    expect(thoughtsIndexHtml).toContain('href="/thoughts/why-i-read-in-the-ai-era/"');
    expect(thoughtHtml).toContain('<title>AI 시대에, 나는 왜 책을 읽는가 · FORM &amp; THOUGHT</title>');
    expect(thoughtHtml).toContain('<link rel="canonical" href="/thoughts/why-i-read-in-the-ai-era/"/>');
    expect(thoughtHtml).toContain('AI 때문에 책을 읽기 시작했다.');
    expect(thoughtHtml).toContain('<meta name="theme-color" content="#F2EFE9"/>');
    await expect(access(join(
      candidateRoot,
      'build/client/reviews/the-life-you-can-save/index.html',
    ))).rejects.toThrow();
  });

  it('preloads only AVIF candidates declared by the lead picture and present in static output', async () => {
    const imagePreload = homeHtml.match(
      /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/u,
    )?.[0];
    const leadPicture = homeHtml.match(
      /<picture><source\b[^>]*type="image\/avif"[^>]*reading-desk-cobalt[^>]*>[\s\S]*?<\/picture>/u,
    )?.[0];
    const avifSource = leadPicture?.match(/<source\b[^>]*type="image\/avif"[^>]*>/u)?.[0];

    expect(imagePreload).toBeDefined();
    expect(avifSource).toBeDefined();
    const preloadCandidates = srcSetCandidates(attribute(imagePreload ?? '', 'imageSrcSet'));
    const pictureCandidates = srcSetCandidates(attribute(avifSource ?? '', 'srcSet'));
    expect(preloadCandidates).toEqual(pictureCandidates);
    expect(preloadCandidates).toContain(attribute(imagePreload ?? '', 'href'));

    for (const candidate of preloadCandidates) {
      await expect(access(join(candidateRoot, 'build/client', candidate.replace(/^\//u, ''))))
        .resolves.toBeUndefined();
    }
  });

  it('preloads only the verified review AVIF candidates declared by its exact picture sizes', async () => {
    const imagePreload = reviewHtml.match(
      /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/u,
    )?.[0];
    const picture = reviewHtml.match(/<picture>[\s\S]*?<\/picture>/u)?.[0];
    const avifSource = picture?.match(/<source\b[^>]*type="image\/avif"[^>]*>/u)?.[0];

    expect(imagePreload).toBeDefined();
    expect(avifSource).toBeDefined();
    expect(attribute(imagePreload ?? '', 'imageSizes')).toBe('(max-width: 720px) 30vw, 9rem');
    expect(attribute(imagePreload ?? '', 'imageSizes')).toBe(attribute(avifSource ?? '', 'sizes'));
    const preloadCandidates = srcSetCandidates(attribute(imagePreload ?? '', 'imageSrcSet'));
    const pictureCandidates = srcSetCandidates(attribute(avifSource ?? '', 'srcSet'));
    expect(preloadCandidates).toEqual(pictureCandidates);
    expect(preloadCandidates).toContain(attribute(imagePreload ?? '', 'href'));
    for (const candidate of preloadCandidates) {
      await expect(access(join(candidateRoot, 'build/client', candidate.replace(/^\//u, ''))))
        .resolves.toBeUndefined();
    }
  });

  it('keeps inlined critical CSS out of the hydration chunks', async () => {
    const assetRoot = join(candidateRoot, 'build/client/assets');
    const javascriptAssets = (await readdir(assetRoot)).filter((file) => file.endsWith('.js'));
    const assets = await Promise.all(javascriptAssets.map(async (file) => ({
      file,
      source: await readFile(join(assetRoot, file), 'utf8'),
    })));
    const rootAssets = assets.filter(({ source }) => source.includes('data-critical-css'));

    expect(rootAssets).toHaveLength(1);
    expect(rootAssets[0]?.source).not.toContain('.site-header__inner{');
    expect(rootAssets[0]?.source).not.toContain('.public-scene');
    expect(rootAssets[0]?.source).not.toContain('.reading-threshold{');
    expect(rootAssets[0]?.source).not.toContain('.memory-thought');
    expect(rootAssets[0]?.source).not.toContain('.context-return{');

    const bundledCriticalCss = [
      '.site-header__inner{',
      '.public-scene{',
      '.reading-threshold{',
      '.memory-thought{',
      '.context-return{',
    ];
    const bundledJavascript = assets.map(({ source }) => source).join('\n');
    for (const pattern of bundledCriticalCss) {
      expect(bundledJavascript).not.toContain(pattern);
    }
  });
});
