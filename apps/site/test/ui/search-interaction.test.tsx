import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { createServer, transformWithEsbuild, type Plugin, type ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { SearchPage } from '../../src/ui/search/SearchPage';
import { SAMPLE_QUESTION, type PublicAnswerFixture } from '../../src/ui/search/secondBrain';
import type { SearchInventoryItem } from '../../src/ui/search/searchModel';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const searchPagePath = join(repositoryRoot, 'apps/site/src/ui/search/SearchPage.tsx');
const siteShellPath = join(repositoryRoot, 'apps/site/src/ui/components/SiteShell.tsx');
const shellStylesPath = join(repositoryRoot, 'apps/site/src/ui/styles/shell.css');
const searchStylesPath = join(repositoryRoot, 'apps/site/src/ui/styles/route-search.css');

const fixture: PublicAnswerFixture = {
  question: SAMPLE_QUESTION,
  answerLead: '저에게 독서는 답을 얻는 일이 아닙니다.',
  answerConclusionPrefix: '결론까지 가는 시간을 지나며 ',
  answerEmphasis: '내 판단',
  answerConclusionSuffix: '을 되찾는 일입니다.',
  evidence: [0, 1, 2].map((index) => ({
    id: `evidence-${index + 1}`,
    label: ['결론까지 가는 시간', '판단의 마지막 몫', '답을 쉽게 믿지 않기'][index]!,
    collectionLabel: '생각' as const,
    dateLabel: '2026.08',
    locatorLabel: `문단 ${index + 1}`,
    excerpt: `공개 기록 근거 ${index + 1}`,
    context: `답변에 사용한 맥락 ${index + 1}`,
    recordTitle: 'AI 시대에, 나는 왜 책을 읽는가',
    canonicalPath: '/thoughts/why-i-read-in-the-ai-era/',
  })),
};

const inventory: SearchInventoryItem[] = [{
  id: 'articles/graphify-code-knowledge-graph-deep-dive',
  anchorId: 'record-articles-graphify-code-knowledge-graph-deep-dive',
  href: '/articles/graphify-code-knowledge-graph-deep-dive/',
  kind: 'article',
  title: 'Graphify는 코드 이해를 정말 더 빠르게 만드는가?',
  description: 'Graphify의 코드 지식 그래프를 검토한다.',
  topics: ['Graphify', 'AI'],
}];

function clientPlugin(serverMarkup: string, options: { deferHydration?: boolean } = {}): Plugin {
  const entryId = '\0second-brain-search-client.tsx';
  return {
    name: 'second-brain-search-client',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'virtual:second-brain-search-client') return entryId;
      return null;
    },
    load(id) {
      if (id !== entryId) return null;
      return `
        import { hydrateRoot } from 'react-dom/client';
        import { SearchPage } from ${JSON.stringify(searchPagePath)};
        import { SiteShell } from ${JSON.stringify(siteShellPath)};
        import ${JSON.stringify(shellStylesPath)};
        import ${JSON.stringify(searchStylesPath)};
        const fixture = ${JSON.stringify(fixture)};
        const inventory = ${JSON.stringify(inventory)};
        const hydrate = () => hydrateRoot(document.querySelector('#root'), <SiteShell currentSection="search"><SearchPage fixture={fixture} initialQuery="" inventory={inventory} /></SiteShell>);
        ${options.deferHydration ? 'window.__hydrateSecondBrainSearch = hydrate;' : 'hydrate();'}
      `;
    },
    async transform(code, id) {
      if (id !== entryId) return null;
      return transformWithEsbuild(code, 'second-brain-search-client.tsx', { loader: 'tsx', jsx: 'automatic' });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/images/form-and-thought-agent-avatar-v1.png') {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'image/png');
          response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
          return;
        }
        if (!request.url?.startsWith('/__second-brain-search/')) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><body><div id="root">${serverMarkup}</div><script type="module" src="/@id/virtual:second-brain-search-client"></script></body></html>`);
      });
    },
  };
}

describe('second-brain search client interaction', () => {
  it('marks an avatar request that failed before hydration as an error without changing the stage geometry', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const markup = renderToString(createElement(SiteShell, {
        currentSection: 'search',
        children: createElement(SearchPage, { fixture, initialQuery: '', inventory }),
      }));
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        publicDir: join(repositoryRoot, 'apps/site/public'),
        logLevel: 'silent',
        plugins: [clientPlugin(markup, { deferHydration: true })],
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral port');

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.route('**/images/form-and-thought-agent-avatar-v1.png', (route) => route.abort('failed'));
      await page.goto(`http://127.0.0.1:${address.port}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => page.locator('.agent-stage__portrait').evaluate((image) => {
        const portrait = image as HTMLImageElement;
        return portrait.complete && portrait.naturalWidth === 0;
      })).toBe(true);
      const before = await page.locator('.agent-stage').evaluate((element) => element.getBoundingClientRect().toJSON());

      await page.evaluate(() => (window as typeof window & { __hydrateSecondBrainSearch?: () => void }).__hydrateSecondBrainSearch?.());
      await expect.poll(() => page.locator('.agent-stage').getAttribute('data-image-state'), { timeout: 4_000 }).toBe('error');
      expect(await page.locator('.agent-stage').evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(before);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('keeps the approved desktop and mobile search composition measurable', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const markup = renderToString(createElement(SiteShell, {
        currentSection: 'search',
        children: createElement(SearchPage, { fixture, initialQuery: '', inventory }),
      }));
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        publicDir: join(repositoryRoot, 'apps/site/public'),
        logLevel: 'silent',
        plugins: [clientPlugin(markup)],
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral port');

      browser = await chromium.launch({ headless: true });
      const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await desktop.emulateMedia({ reducedMotion: 'reduce' });
      await desktop.goto(`http://127.0.0.1:${address.port}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });
      const desktopBounds = await desktop.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        return {
          header: rect('.site-header__inner'),
          stage: rect('.second-brain-search__stage'),
          avatar: rect('.agent-stage'),
          dialogue: rect('.second-brain-dialogue'),
          order: Array.from(document.querySelector('.second-brain-search__stage')?.children ?? []).map((child) => child.className),
        };
      });
      expect(desktopBounds.header?.height).toBeCloseTo(88, 1);
      expect(desktopBounds.stage).toMatchObject({ x: 0, y: 88, width: 1440, height: 812 });
      expect(desktopBounds.avatar?.width).toBeCloseTo(705.6, 1);
      expect(desktopBounds.dialogue?.x).toBeCloseTo(705.6, 1);
      expect(desktopBounds.dialogue?.width).toBeCloseTo(734.4, 1);
      expect(desktopBounds.order).toEqual(['agent-stage', 'second-brain-dialogue']);
      await desktop.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await desktop.getByRole('button', { name: '근거 3개 보기' }).click();
      const panel = await desktop.locator('.evidence-panel').evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(panel).toMatchObject({ x: 0, y: 88, height: 812 });
      expect(panel.width).toBeCloseTo(705.6, 1);

      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await mobile.emulateMedia({ reducedMotion: 'reduce' });
      await mobile.goto(`http://127.0.0.1:${address.port}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });
      const mobileBounds = await mobile.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        return {
          header: rect('.site-header__inner'),
          stage: rect('.second-brain-search__stage'),
          avatar: rect('.agent-stage'),
          dialogue: rect('.second-brain-dialogue'),
          order: Array.from(document.querySelector('.second-brain-search__stage')?.children ?? []).map((child) => child.className),
        };
      });
      expect(mobileBounds.header?.height).toBeCloseTo(72, 1);
      expect(mobileBounds.stage?.y).toBeCloseTo(72, 1);
      expect(mobileBounds.avatar).toMatchObject({ x: 0, y: 72, width: 390 });
      expect(mobileBounds.avatar?.height).toBeCloseTo(303.84, 1);
      expect(mobileBounds.avatar?.height).toBeGreaterThanOrEqual(300);
      expect(mobileBounds.dialogue?.y).toBeCloseTo(375.84, 1);
      expect(mobileBounds.dialogue?.width).toBe(390);
      expect(mobileBounds.order).toEqual(['agent-stage', 'second-brain-dialogue']);
      await mobile.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await mobile.getByRole('button', { name: '근거 3개 보기' }).click();
      const sheet = await mobile.locator('.evidence-panel').evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(sheet).toMatchObject({ x: 0, width: 390, bottom: 844 });
      expect(sheet.height).toBeLessThanOrEqual(641.5);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('inerts every shell control and covers the header while evidence is open', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const markup = renderToString(createElement(SiteShell, {
        currentSection: 'search',
        children: createElement(SearchPage, { fixture, initialQuery: '', inventory }),
      }));
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        publicDir: join(repositoryRoot, 'apps/site/public'),
        logLevel: 'silent',
        plugins: [clientPlugin(markup)],
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral port');

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${address.port}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });

      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 4_000 }).toBe('answered');
      const evidenceButton = page.getByRole('button', { name: '근거 3개 보기' });
      await evidenceButton.click();
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 기억' }).count()).toBe(1);
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('근거 패널 닫기');
      await expect.poll(() => page.locator('.second-brain-search__background').getAttribute('inert')).toBe('');
      await expect.poll(() => page.locator('.skip-link').getAttribute('inert')).toBe('');
      await expect.poll(() => page.locator('.site-header').getAttribute('inert')).toBe('');
      await expect.poll(() => page.locator('.evidence-backdrop').evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('근거 3개 보기');

      const followUp = page.getByRole('searchbox', { name: '이 생각에 이어 묻기' });
      await followUp.fill('Graphify');
      await followUp.press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      await expect.poll(() => page.getByRole('heading', { name: '검색 결과' }).count()).toBe(1);
      expect(await page.locator('body').textContent()).not.toContain(fixture.answerLead);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('keeps a single polite status region while evidence is open', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const markup = renderToString(createElement(SiteShell, {
        currentSection: 'search',
        children: createElement(SearchPage, { fixture, initialQuery: '', inventory }),
      }));
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        publicDir: join(repositoryRoot, 'apps/site/public'),
        logLevel: 'silent',
        plugins: [clientPlugin(markup)],
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral port');
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://127.0.0.1:${address.port}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });

      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 4_000 }).toBe('answered');
      await page.getByRole('button', { name: '근거 3개 보기' }).click();
      await expect.poll(() => page.locator('[aria-live="polite"]').count()).toBe(1);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('skips staged waiting for reduced motion', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const markup = renderToString(createElement(SiteShell, {
        currentSection: 'search',
        children: createElement(SearchPage, { fixture, initialQuery: '', inventory }),
      }));
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        publicDir: join(repositoryRoot, 'apps/site/public'),
        logLevel: 'silent',
        plugins: [clientPlugin(markup)],
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral port');
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`http://127.0.0.1:${address.port}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => page.locator('.question-composer__note').isVisible()).toBe(true);
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 500 }).toBe('answered');
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);
});
