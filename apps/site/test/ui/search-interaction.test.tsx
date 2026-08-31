import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, transformWithEsbuild, type Plugin, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { SearchPage } from '../../src/ui/search/SearchPage';
import { SAMPLE_QUESTION } from '../../src/ui/search/secondBrain';
import type { SearchInventoryItem } from '../../src/ui/search/searchModel';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const searchPagePath = join(repositoryRoot, 'apps/site/src/ui/search/SearchPage.tsx');
const siteShellPath = join(repositoryRoot, 'apps/site/src/ui/components/SiteShell.tsx');
const tokenStylesPath = join(repositoryRoot, 'apps/site/src/ui/styles/tokens.css');
const shellStylesPath = join(repositoryRoot, 'apps/site/src/ui/styles/shell.css');
const searchStylesPath = join(repositoryRoot, 'apps/site/src/ui/styles/route-search.css');
const viteCacheRoots: string[] = [];

afterEach(async () => {
  await Promise.all(viteCacheRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function freshViteCacheRoot() {
  const root = await mkdtemp(join(tmpdir(), 'beyondwin-search-interaction-vite-'));
  viteCacheRoots.push(root);
  return root;
}

const binding = {
  contentReleaseId: 'a'.repeat(64),
  answerReleaseId: 'b'.repeat(64),
};
const answerEvidence = [0, 1, 2].map((index) => ({
    evidenceId: String(index + 3).repeat(64).slice(0, 64),
    chunkId: String(index + 6).repeat(64).slice(0, 64),
    recordId: 'thoughts/why-i-read-in-the-ai-era' as const,
    collectionLabel: '생각',
    recordTitle: `공개 기록 ${index + 1}`,
    canonicalPath: '/thoughts/why-i-read-in-the-ai-era/' as const,
    locator: { kind: 'heading-paragraph' as const, label: `문단 ${index + 1}`, ordinal: index + 1 },
    excerpt: `공개 기록 근거 ${index + 1}`,
    excerptChecksum: `sha256:${'e'.repeat(64)}` as const,
}));
const answer = {
  kind: 'answer' as const,
  answerReleaseId: binding.answerReleaseId,
  claims: [{
    id: 'claim-1' as const,
    text: '공개 기록을 근거로 답합니다.',
    evidenceIds: answerEvidence.map(({ evidenceId }) => evidenceId),
  }],
  evidence: answerEvidence,
};
const provider = {
  ask: async (question: string) => question === SAMPLE_QUESTION
    ? answer
    : { kind: 'search' as const, reason: 'unsupported-question' as const },
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
        import ${JSON.stringify(tokenStylesPath)};
        import ${JSON.stringify(shellStylesPath)};
        import ${JSON.stringify(searchStylesPath)};
        const binding = ${JSON.stringify(binding)};
        const answer = ${JSON.stringify(answer)};
        const sampleQuestion = ${JSON.stringify(SAMPLE_QUESTION)};
        const provider = { ask: async (question) => question === sampleQuestion
          ? answer
          : { kind: 'search', reason: 'unsupported-question' } };
        const inventory = ${JSON.stringify(inventory)};
        const hydrate = () => {
          window.__secondBrainRoot = hydrateRoot(
            document.querySelector('#root'),
            <SiteShell currentSection="search">
              <SearchPage binding={binding} initialQuery="" inventory={inventory} provider={provider} />
            </SiteShell>,
          );
        };
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
        const pathname = new URL(request.url ?? '/', 'http://beyondwin.test').pathname;
        if (pathname !== '/__second-brain-search/' && pathname !== '/search/') return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><body><div id="root">${serverMarkup}</div><script type="module" src="/@id/virtual:second-brain-search-client"></script></body></html>`);
      });
    },
  };
}

function renderApplication() {
  return createElement(SiteShell, {
    children: createElement(SearchPage, { binding, initialQuery: '', inventory, provider }),
    currentSection: 'search',
  });
}

async function startHarness(options: { deferHydration?: boolean } = {}) {
  const markup = renderToString(renderApplication());
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    cacheDir: await freshViteCacheRoot(),
    publicDir: join(repositoryRoot, 'apps/site/public'),
    logLevel: 'silent',
    plugins: [clientPlugin(markup, options)],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function targetBoxesBelowMinimum(page: Page) {
  return page.evaluate(() => {
    const selector = [
      '.second-brain-search a[href]',
      '.second-brain-search button:not([disabled])',
      '.second-brain-search input:not([disabled])',
      '.evidence-modal-layer a[href]',
      '.evidence-modal-layer button:not([disabled])',
      '.evidence-modal-layer input:not([disabled])',
    ].join(',');
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (bounds.width === 0 || bounds.height === 0 || style.display === 'none' || style.visibility === 'hidden') {
        return [];
      }
      return bounds.width + 0.01 >= 44 && bounds.height + 0.01 >= 44 ? [] : [{
        control: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
        height: bounds.height,
        width: bounds.width,
      }];
    });
  });
}

describe('second-brain search client interaction', () => {
  it('marks an avatar request that failed before hydration as an error without changing stage geometry', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness({ deferHydration: true });
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.route('**/images/form-and-thought-agent-avatar-v1.png', (route) => route.abort('failed'));
      await page.goto(`${harness.baseUrl}/__second-brain-search/`, { waitUntil: 'domcontentloaded' });
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
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });

      const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await desktop.emulateMedia({ reducedMotion: 'reduce' });
      await desktop.goto(`${harness.baseUrl}/__second-brain-search/`, { waitUntil: 'networkidle' });
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
      expect(panel).toMatchObject({ x: 0, y: 0, height: 900 });
      expect(panel.width).toBeCloseTo(705.6, 1);

      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await mobile.emulateMedia({ reducedMotion: 'reduce' });
      await mobile.goto(`${harness.baseUrl}/__second-brain-search/`, { waitUntil: 'networkidle' });
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
      expect(mobileBounds.dialogue?.y).toBeCloseTo(375.84, 1);
      expect(mobileBounds.dialogue?.width).toBe(390);
      expect(mobileBounds.order).toEqual(['agent-stage', 'second-brain-dialogue']);
      await mobile.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await mobile.getByRole('button', { name: '근거 3개 보기' }).click();
      const sheet = await mobile.locator('.evidence-panel').evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(sheet).toMatchObject({ x: 0, width: 390, bottom: 844 });
      expect(sheet.height).toBeLessThanOrEqual(641.5);
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('answers only the sample, manages evidence focus, and falls back to real search', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${harness.baseUrl}/__second-brain-search/`, { waitUntil: 'networkidle' });

      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 4_000 }).toBe('answered');
      const evidenceButton = page.getByRole('button', { name: '근거 3개 보기' });
      await evidenceButton.click();
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 기억' }).count()).toBe(1);
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('근거 패널 닫기');
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('근거 3개 보기');

      const followUp = page.getByRole('searchbox', { name: '이 생각에 이어 묻기' });
      await followUp.fill('Graphify');
      await followUp.press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      await expect.poll(() => page.getByRole('heading', { name: '검색 결과' }).count()).toBe(1);
      await expect.poll(() => page.getByRole('status').textContent()).toBe('“Graphify”에 이어지는 공개 기록 1건을 찾았습니다.');
      expect(await page.locator('body').textContent()).not.toContain('공개 기록을 근거로 답합니다.');

      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      await search.fill('존재하지않는검색어');
      await search.press('Enter');
      await expect.poll(() => page.getByRole('heading', { name: '일치하는 결과가 없습니다.' }).count()).toBe(1);
      await expect.poll(() => page.getByRole('status').textContent()).toBe('“존재하지않는검색어”에 이어지는 공개 기록을 찾지 못했습니다.');
      await expect.poll(() => page.locator('[aria-live="polite"]').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it('skips staged waiting for reduced motion', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${harness.baseUrl}/__second-brain-search/`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.question-composer__note').isVisible()).toBe(true);
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 500 }).toBe('answered');
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it('restores a bounded direct URL query on mount, reload, and suggestion entry without pushing history', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => {
        const originalPushState = window.history.pushState.bind(window.history);
        Object.defineProperty(window, '__searchPushStateCalls', { configurable: true, value: 0, writable: true });
        window.history.pushState = (...args) => {
          (window as typeof window & { __searchPushStateCalls: number }).__searchPushStateCalls += 1;
          return originalPushState(...args);
        };
      });

      await page.goto(`${harness.baseUrl}/search/?q=Graphify`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      await expect.poll(() => page.locator('a[href="/articles/graphify-code-knowledge-graph-deep-dive/"]').count()).toBe(1);
      expect(await page.evaluate(() => (window as typeof window & { __searchPushStateCalls: number }).__searchPushStateCalls)).toBe(0);

      await page.reload({ waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      expect(await page.evaluate(() => (window as typeof window & { __searchPushStateCalls: number }).__searchPushStateCalls)).toBe(0);

      const directQuery = page.getByRole('searchbox', { name: '기록에 묻기' });
      await directQuery.fill('없는질문');
      await directQuery.press('Enter');
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
      expect(new URL(page.url()).pathname).toBe('/search/');

      await page.goto(`${harness.baseUrl}/search/?q=Graphify`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      await expect.poll(() => page.locator('a[href="/articles/graphify-code-knowledge-graph-deep-dive/"]').count()).toBe(1);

      await page.goto(`${harness.baseUrl}/search/?q=없는질문`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.getByRole('heading', { name: '일치하는 결과가 없습니다.' }).count()).toBe(1);
      await page.getByRole('link', { name: 'Graphify' }).click();
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      expect(new URL(page.url()).searchParams.get('q')).toBe('Graphify');

      await page.goto(`${harness.baseUrl}/search/?q=${encodeURIComponent('가'.repeat(121))}`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('idle');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe(SAMPLE_QUESTION);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('isolates the whole site shell while evidence is open and restores focus, pointer access, inert, and scroll state', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        document.documentElement.style.overflow = 'clip';
        document.body.style.overflow = 'auto';
        (window as typeof window & { __backgroundActivations: Record<string, number> }).__backgroundActivations = {
          brand: 0,
          skip: 0,
        };
        document.querySelector('.site-brand')?.addEventListener('click', (event) => {
          event.preventDefault();
          (window as typeof window & { __backgroundActivations: Record<string, number> }).__backgroundActivations.brand += 1;
        });
        document.querySelector('.skip-link')?.addEventListener('click', (event) => {
          event.preventDefault();
          (window as typeof window & { __backgroundActivations: Record<string, number> }).__backgroundActivations.skip += 1;
        });
      });
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      const evidenceButton = page.getByRole('button', { name: '근거 3개 보기' });
      const brandBounds = await page.locator('.site-brand').boundingBox();
      if (!brandBounds) throw new Error('Site brand was not measurable before opening evidence');
      await page.locator('.skip-link').focus();
      const skipBounds = await page.locator('.skip-link').boundingBox();
      if (!skipBounds) throw new Error('Skip link was not measurable before opening evidence');
      await evidenceButton.click();

      await expect.poll(() => page.locator('.site-shell').getAttribute('inert')).toBe('');
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 기억' }).count()).toBe(1);
      await expect.poll(() => page.locator('[aria-live="polite"]').count()).toBe(1);
      expect(await page.getByRole('link', { name: 'FORM & THOUGHT 홈' }).count()).toBe(0);
      expect(await page.getByRole('link', { name: '본문으로 건너뛰기' }).count()).toBe(0);
      const backdrop = await page.locator('.evidence-backdrop').boundingBox();
      expect(backdrop).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
      const panel = await page.getByRole('dialog', { name: '이 답의 기억' }).boundingBox();
      expect(panel).toMatchObject({ y: 0, height: 900 });

      for (const selector of ['.site-brand', '.skip-link']) {
        await page.locator(selector).evaluate((element) => (element as HTMLElement).focus());
        expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('근거 패널 닫기');
      }
      await page.mouse.click(
        brandBounds.x + brandBounds.width / 2,
        brandBounds.y + brandBounds.height / 2,
      );
      await page.mouse.click(
        skipBounds.x + skipBounds.width / 2,
        skipBounds.y + skipBounds.height / 2,
      );
      expect(await page.evaluate(() => (window as typeof window & { __backgroundActivations: Record<string, number> }).__backgroundActivations)).toEqual({
        brand: 0,
        skip: 0,
      });

      await page.keyboard.press('Escape');
      await expect.poll(() => page.locator('.site-shell').getAttribute('inert')).toBeNull();
      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('근거 3개 보기');
      expect(await page.evaluate(() => ({
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
      }))).toEqual({ body: 'auto', html: 'clip' });

      await page.locator('.site-brand').click();
      await page.locator('.skip-link').focus();
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => (window as typeof window & { __backgroundActivations: Record<string, number> }).__backgroundActivations)).toEqual({
        brand: 1,
        skip: 1,
      });

      await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('.site-shell');
        const trigger = document.querySelector<HTMLElement>('.answer-stage__evidence');
        shell?.setAttribute('inert', '');
        shell?.setAttribute('aria-hidden', 'false');
        trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 기억' }).count()).toBe(1);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.locator('.site-shell').getAttribute('inert')).toBe('');
      expect(await page.locator('.site-shell').getAttribute('aria-hidden')).toBe('false');
      await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('.site-shell');
        shell?.removeAttribute('inert');
        shell?.removeAttribute('aria-hidden');
      });

      await evidenceButton.click();
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 기억' }).count()).toBe(1);
      await page.evaluate(() => {
        (window as typeof window & { __secondBrainRoot: { unmount(): void } }).__secondBrainRoot.unmount();
      });
      expect(await page.evaluate(() => ({
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
      }))).toEqual({ body: 'auto', html: 'clip' });
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it.each([
    { height: 900, width: 1440 },
    { height: 844, width: 390 },
  ])('keeps every visible search and evidence control at least 44 by 44 at $width px', async (viewport) => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);

      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('answered');
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);

      await page.getByRole('button', { name: '근거 3개 보기' }).click();
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 기억' }).count()).toBe(1);
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);
      await page.keyboard.press('Escape');

      const followUp = page.getByRole('searchbox', { name: '이 생각에 이어 묻기' });
      await followUp.fill('없는질문');
      await followUp.press('Enter');
      await expect.poll(() => page.getByRole('heading', { name: '일치하는 결과가 없습니다.' }).count()).toBe(1);
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);
});
