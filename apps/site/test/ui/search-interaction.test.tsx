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
const publicAskProviderPath = join(repositoryRoot, 'apps/site/src/ui/search/publicAskProvider.ts');
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
const compactPrivacyDisclosure = '공개 승인 기록만 사용 · 이 사이트는 질문을 저장하지 않음';
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
        import { PublicAskTransportError } from ${JSON.stringify(publicAskProviderPath)};
        import { SiteShell } from ${JSON.stringify(siteShellPath)};
        import ${JSON.stringify(tokenStylesPath)};
        import ${JSON.stringify(shellStylesPath)};
        import ${JSON.stringify(searchStylesPath)};
        const binding = ${JSON.stringify(binding)};
        const answer = ${JSON.stringify(answer)};
        const sampleQuestion = ${JSON.stringify(SAMPLE_QUESTION)};
        const calls = [];
        const scripts = [];
        window.__publicAskCalls = calls;
        window.__publicAskControl = {
          calls,
          scripts,
          enqueue(script) { scripts.push(script); },
          resolve(index, response) { calls[index]?.resolve?.(response); },
          reject(index) { calls[index]?.reject?.(new Error('scripted transport failure')); },
          summaries() { return calls.map(({ question, aborted, settled }) => ({ question, aborted, settled })); },
        };
        const provider = { ask: (question, { signal }) => {
          const script = scripts.shift() ?? {
            type: 'resolve',
            response: question === sampleQuestion
              ? answer
              : { kind: 'search', reason: 'unsupported-question' },
          };
          const call = { question, aborted: signal.aborted, settled: false };
          calls.push(call);
          signal.addEventListener('abort', () => { call.aborted = true; }, { once: true });
          if (script.type === 'defer') {
            return new Promise((resolve, reject) => {
              call.resolve = (response) => { call.settled = true; resolve(response); };
              call.reject = (error) => { call.settled = true; reject(error); };
            });
          }
          if (script.type === 'reject') {
            call.settled = true;
            return Promise.reject(new PublicAskTransportError(script.code ?? 'unavailable'));
          }
          call.settled = true;
          return Promise.resolve(script.response);
        } };
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
        if (pathname === '/articles/graphify-code-knowledge-graph-deep-dive/') {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end('<!doctype html><html><body><main><h1>Graphify detail</h1></main></body></html>');
          return;
        }
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
  it('defers the answer until the provider settles and preserves the exact URL without history writes', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => {
        const pushState = window.history.pushState.bind(window.history);
        const replaceState = window.history.replaceState.bind(window.history);
        Object.defineProperty(window, '__historyWrites', {
          configurable: true,
          value: { push: 0, replace: 0 },
        });
        window.history.pushState = (...args) => {
          (window as typeof window & { __historyWrites: { push: number } }).__historyWrites.push += 1;
          return pushState(...args);
        };
        window.history.replaceState = (...args) => {
          (window as typeof window & { __historyWrites: { replace: number } }).__historyWrites.replace += 1;
          return replaceState(...args);
        };
      });
      await page.goto(`${harness.baseUrl}/search/?q=Graphify#record-articles-graphify-code-knowledge-graph-deep-dive`, {
        waitUntil: 'networkidle',
      });
      const before = page.url();
      await page.evaluate(() => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'defer' }));
      const question = page.getByRole('searchbox', { name: '기록에 묻기' });
      await question.fill(SAMPLE_QUESTION);
      await question.press('Enter');

      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __publicAskCalls: unknown[];
      }).__publicAskCalls.length)).toBe(1);
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('pending');
      expect(await page.locator('.answer-stage').count()).toBe(0);
      expect(page.url()).toBe(before);
      expect(await page.evaluate(() => (window as typeof window & {
        __historyWrites: { push: number; replace: number };
      }).__historyWrites)).toEqual({ push: 0, replace: 0 });

      await page.evaluate((response) => (window as typeof window & {
        __publicAskControl: { resolve(index: number, value: unknown): void };
      }).__publicAskControl.resolve(0, response), answer);
      await expect.poll(
        () => page.locator('.second-brain-search').getAttribute('data-view'),
        { timeout: 3_000 },
      ).toBe('answered');
      expect(await page.locator('.answer-stage').count()).toBe(1);
      expect(await page.getByText(compactPrivacyDisclosure, { exact: true }).count()).toBe(1);
      expect(page.url()).toBe(before);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

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
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('calls the provider once per explicit question and renders deterministic search for abstention', async () => {
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

      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      await search.fill('Graphify');
      await search.press('Enter');
      await expect.poll(() => page.getByRole('heading', { name: '검색 결과' }).count()).toBe(1);
      await expect.poll(() => page.locator('[aria-live="polite"]').textContent()).toBe('“Graphify”에 이어지는 공개 기록 1건을 찾았습니다.');
      await expect.poll(() => page.locator('[aria-live="polite"]').count()).toBe(1);
      expect(await page.evaluate(() => (window as typeof window & {
        __publicAskControl: { summaries(): unknown };
      }).__publicAskControl.summaries())).toEqual([{ question: 'Graphify', aborted: false, settled: true }]);
      expect(await page.locator('.answer-stage').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it('removes visual delay for reduced motion but still waits for the deferred provider response', async () => {
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
      await page.evaluate(() => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'defer' }));
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 500 }).toBe('pending');
      expect(await page.locator('.answer-stage').count()).toBe(0);
      await page.evaluate((response) => (window as typeof window & {
        __publicAskControl: { resolve(index: number, value: unknown): void };
      }).__publicAskControl.resolve(0, response), answer);
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 500 }).toBe('answered');
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it('keeps direct URL, reload, and suggestion navigation provider-free while explicit submit preserves the URL', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => {
        const originalPushState = window.history.pushState.bind(window.history);
        const originalReplaceState = window.history.replaceState.bind(window.history);
        Object.defineProperty(window, '__searchHistoryCalls', {
          configurable: true,
          value: { push: 0, replace: 0 },
        });
        window.history.pushState = (...args) => {
          (window as typeof window & { __searchHistoryCalls: { push: number } }).__searchHistoryCalls.push += 1;
          return originalPushState(...args);
        };
        window.history.replaceState = (...args) => {
          (window as typeof window & { __searchHistoryCalls: { replace: number } }).__searchHistoryCalls.replace += 1;
          return originalReplaceState(...args);
        };
      });

      await page.goto(`${harness.baseUrl}/search/?q=Graphify&keep=%2F#exact`, { waitUntil: 'networkidle' });
      const restoredUrl = page.url();
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      await expect.poll(() => page.locator('a[href="/articles/graphify-code-knowledge-graph-deep-dive/"]').count()).toBe(1);
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(0);
      expect(await page.evaluate(() => (window as typeof window & { __searchHistoryCalls: object }).__searchHistoryCalls))
        .toEqual({ push: 0, replace: 0 });

      await page.reload({ waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(0);
      expect(await page.evaluate(() => (window as typeof window & { __searchHistoryCalls: object }).__searchHistoryCalls))
        .toEqual({ push: 0, replace: 0 });

      const directQuery = page.getByRole('searchbox', { name: '기록에 묻기' });
      await directQuery.fill('없는질문');
      await directQuery.press('Enter');
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __publicAskCalls: unknown[];
      }).__publicAskCalls.length)).toBe(1);
      expect(page.url()).toBe(restoredUrl);
      expect(await page.evaluate(() => (window as typeof window & { __searchHistoryCalls: object }).__searchHistoryCalls))
        .toEqual({ push: 0, replace: 0 });

      await page.goto(`${harness.baseUrl}/search/?q=Graphify`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      await expect.poll(() => page.locator('a[href="/articles/graphify-code-knowledge-graph-deep-dive/"]').count()).toBe(1);

      await page.goto(`${harness.baseUrl}/search/?q=없는질문`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.getByRole('heading', { name: '일치하는 결과가 없습니다.' }).count()).toBe(1);
      await page.getByRole('link', { name: 'Graphify' }).click();
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      expect(new URL(page.url()).searchParams.get('q')).toBe('Graphify');
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(0);

      await page.goBack({ waitUntil: 'networkidle' });
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('없는질문');
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(0);
      await page.goForward({ waitUntil: 'networkidle' });
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(0);

      await page.locator('a[href="/articles/graphify-code-knowledge-graph-deep-dive/"]').click();
      await expect.poll(() => page.getByRole('heading', { name: 'Graphify detail' }).count()).toBe(1);
      const continuationUrl = new URL(page.url());
      expect(continuationUrl.searchParams.get('__bw_query')).toBe('Graphify');
      expect(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('bw:origin:')))).toBe(true);

      await page.goto(`${harness.baseUrl}/search/?q=${encodeURIComponent('가'.repeat(121))}`, { waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('idle');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe(SAMPLE_QUESTION);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('maps every provider and transport fallback to a real deterministic result without retrying', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });

      const cases = [
        [{ type: 'resolve', response: { kind: 'search', reason: 'insufficient-evidence' } }, '충분한 공개 근거를 확인하지 못해 검색 결과를 보여드립니다.'],
        [{ type: 'resolve', response: { kind: 'search', reason: 'unsupported-question' } }, '이 질문은 공개 기록만으로 답하기 어려워 검색 결과를 보여드립니다.'],
        [{ type: 'resolve', response: { kind: 'search', reason: 'provider-disabled' } }, '현재 답변 기능을 쉬고 있어 공개 기록 검색 결과를 보여드립니다.', SAMPLE_QUESTION],
        [{ type: 'resolve', response: { kind: 'search', reason: 'provider-disabled' } }, '현재 답변 기능을 쉬고 있어 공개 기록 검색 결과를 보여드립니다.', 'Graphify'],
        [{ type: 'resolve', response: { kind: 'search', reason: 'release-mismatch' } }, '공개 기록 버전이 바뀌어 안전하게 검색 결과로 전환했습니다.'],
        [{ type: 'resolve', response: { kind: 'error', code: 'timeout', retryable: true } }, '답변을 기다리는 시간이 길어져 공개 기록 검색 결과로 전환했습니다.'],
        [{ type: 'resolve', response: { kind: 'error', code: 'unavailable', retryable: true } }, '답변 기능에 연결하지 못해 공개 기록 검색 결과를 보여드립니다.'],
        [{ type: 'resolve', response: { kind: 'error', code: 'rate-limited', retryable: true } }, '잠시 질문이 많아 공개 기록 검색 결과를 보여드립니다.'],
        [{ type: 'resolve', response: { kind: 'error', code: 'invalid-response', retryable: false } }, '검증할 수 없는 답변 대신 공개 기록 검색 결과를 보여드립니다.'],
        [{ type: 'reject', code: 'timeout' }, '답변을 기다리는 시간이 길어져 공개 기록 검색 결과로 전환했습니다.'],
        [{ type: 'reject', code: 'unavailable' }, '답변 기능에 연결하지 못해 공개 기록 검색 결과를 보여드립니다.'],
        [{ type: 'reject', code: 'invalid-response' }, '검증할 수 없는 답변 대신 공개 기록 검색 결과를 보여드립니다.'],
      ] as const;

      for (const [script, notice, explicitQuestion = 'Graphify'] of cases) {
        await page.evaluate((value) => (window as typeof window & {
          __publicAskControl: { enqueue(next: unknown): void };
        }).__publicAskControl.enqueue(value), script);
        const search = page.getByRole('searchbox', { name: '기록에 묻기' });
        await search.fill(explicitQuestion);
        await search.press('Enter');
        await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
        expect(await page.locator('.second-brain-search__results [role="status"]').textContent()).toBe(notice);
        expect(await page.locator('.search-results, .search-zero').count()).toBe(1);
        expect(await page.locator(explicitQuestion === 'Graphify' ? '.search-result-list' : '.search-zero').count()).toBe(1);
        expect(await page.locator('.answer-stage').count()).toBe(0);
      }

      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length))
        .toBe(cases.length);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('settles a never-resolving provider at the coordinator deadline without changing the current URL', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => {
        const pushState = window.history.pushState.bind(window.history);
        const replaceState = window.history.replaceState.bind(window.history);
        Object.defineProperty(window, '__timeoutHistoryWrites', {
          configurable: true,
          value: { push: 0, replace: 0 },
        });
        window.history.pushState = (...args) => {
          (window as typeof window & { __timeoutHistoryWrites: { push: number } }).__timeoutHistoryWrites.push += 1;
          return pushState(...args);
        };
        window.history.replaceState = (...args) => {
          (window as typeof window & { __timeoutHistoryWrites: { replace: number } }).__timeoutHistoryWrites.replace += 1;
          return replaceState(...args);
        };
      });
      await page.goto(`${harness.baseUrl}/search/?q=Graphify&keep=%2F#exact`, { waitUntil: 'networkidle' });
      const exactUrl = page.url();
      await page.evaluate(() => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'defer' }));
      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      const differentQuestion = 'Graphify와 다른 timeout 질문';
      await search.fill(differentQuestion);
      await search.press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view'), { timeout: 10_000 })
        .toBe('search-results');
      expect(page.url()).toBe(exactUrl);
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe(differentQuestion);
      expect(await page.evaluate(() => (window as typeof window & {
        __timeoutHistoryWrites: { push: number; replace: number };
      }).__timeoutHistoryWrites)).toEqual({ push: 0, replace: 0 });
      expect(await page.locator('.second-brain-search__results [role="status"]').textContent())
        .toBe('답변을 기다리는 시간이 길어져 공개 기록 검색 결과로 전환했습니다.');
      expect(await page.locator('.search-zero').count()).toBe(1);
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(1);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it('preserves the entire query and hash with zero history writes for a different-question server error', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${harness.baseUrl}/search/?q=Graphify&keep=%2F#error`, { waitUntil: 'networkidle' });
      const exactUrl = page.url();
      await page.evaluate(() => {
        const pushState = window.history.pushState.bind(window.history);
        const replaceState = window.history.replaceState.bind(window.history);
        Object.defineProperty(window, '__errorHistoryWrites', {
          configurable: true,
          value: { push: 0, replace: 0 },
        });
        window.history.pushState = (...args) => {
          (window as typeof window & { __errorHistoryWrites: { push: number } }).__errorHistoryWrites.push += 1;
          return pushState(...args);
        };
        window.history.replaceState = (...args) => {
          (window as typeof window & { __errorHistoryWrites: { replace: number } }).__errorHistoryWrites.replace += 1;
          return replaceState(...args);
        };
      });
      await page.evaluate(() => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({
        type: 'resolve',
        response: { kind: 'error', code: 'unavailable', retryable: true },
      }));

      const differentQuestion = '서버 오류로 전환할 다른 질문';
      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      await search.fill(differentQuestion);
      await search.press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      expect(page.url()).toBe(exactUrl);
      expect(await page.evaluate(() => (window as typeof window & {
        __errorHistoryWrites: { push: number; replace: number };
      }).__errorHistoryWrites)).toEqual({ push: 0, replace: 0 });
      expect(await page.locator('.second-brain-search__results [role="status"]').textContent())
        .toBe('답변 기능에 연결하지 못해 공개 기록 검색 결과를 보여드립니다.');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe(differentQuestion);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it('cancels replaced, popstate, persisted pageshow, and unmounted requests while ignoring late settlement', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      const enqueueDeferred = () => page.evaluate(() => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'defer' }));

      await enqueueDeferred();
      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      await search.fill('첫 질문');
      await search.press('Enter');
      await enqueueDeferred();
      await page.getByRole('searchbox', { name: '기록에 묻기' }).fill('두 번째 질문');
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __publicAskControl: { summaries(): Array<{ aborted: boolean }> };
      }).__publicAskControl.summaries()[0]?.aborted)).toBe(true);

      await page.evaluate(() => {
        window.history.replaceState(null, '', '/search/?q=Graphify');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe('Graphify');
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __publicAskControl: { summaries(): Array<{ aborted: boolean }> };
      }).__publicAskControl.summaries()[1]?.aborted)).toBe(true);
      await page.evaluate((response) => (window as typeof window & {
        __publicAskControl: { resolve(index: number, value: unknown): void };
      }).__publicAskControl.resolve(1, response), answer);
      expect(await page.locator('.answer-stage').count()).toBe(0);

      await enqueueDeferred();
      await page.getByRole('searchbox', { name: '기록에 묻기' }).fill('세 번째 질문');
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await page.evaluate(() => {
        window.history.replaceState(null, '', '/search/');
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await expect.poll(() => page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe(SAMPLE_QUESTION);
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __publicAskControl: { summaries(): Array<{ aborted: boolean }> };
      }).__publicAskControl.summaries()[2]?.aborted)).toBe(true);

      await enqueueDeferred();
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await page.evaluate(() => (window as typeof window & {
        __secondBrainRoot: { unmount(): void };
      }).__secondBrainRoot.unmount());
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __publicAskControl: { summaries(): Array<{ aborted: boolean }> };
      }).__publicAskControl.summaries()[3]?.aborted)).toBe(true);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('uses canonical-only fallback links without retaining the POST question across detail and Back', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => sessionStorage.setItem('unrelated', 'preserve-me'));
      await page.evaluate(() => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'resolve', response: { kind: 'search', reason: 'provider-disabled' } }));

      const rawQuestion = 'Graphify';
      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      await search.fill(rawQuestion);
      await search.press('Enter');
      await expect.poll(() => page.getByRole('heading', { name: '검색 결과' }).count()).toBe(1);
      const canonical = page.locator('a[href="/articles/graphify-code-knowledge-graph-deep-dive/"]');
      expect(await canonical.count()).toBe(1);
      await canonical.click();
      await expect.poll(() => page.getByRole('heading', { name: 'Graphify detail' }).count()).toBe(1);
      expect(new URL(page.url()).search).toBe('');

      const privacySnapshot = await page.evaluate((question) => ({
        historyState: JSON.stringify(window.history.state),
        storage: Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)]),
        leaks: Object.keys(sessionStorage).filter((key) => key.includes(question)
          || (sessionStorage.getItem(key) ?? '').includes(question)),
      }), rawQuestion);
      expect(privacySnapshot.storage).toEqual([['unrelated', 'preserve-me']]);
      expect(privacySnapshot.leaks).toEqual([]);
      expect(privacySnapshot.historyState).not.toContain(rawQuestion);

      await page.goBack({ waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('idle');
      expect(await page.getByRole('searchbox', { name: '기록에 묻기' }).inputValue()).toBe(SAMPLE_QUESTION);
      expect(await page.locator('.answer-stage').count()).toBe(0);
      expect(await page.locator('.second-brain-search__results').count()).toBe(0);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('keeps the exact approved heading and keyboard-operable privacy disclosure before submit', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      expect(await page.getByRole('heading', { name: '공개 기록에 무엇을 묻고 싶나요?', exact: true }).count()).toBe(1);
      expect((await page.locator('h1').allTextContents()).join(' ')).not.toContain('제 기록에');
      const compactDisclosure = page.getByText(compactPrivacyDisclosure, { exact: true });
      expect(await compactDisclosure.count()).toBe(1);
      expect(await compactDisclosure.isVisible()).toBe(true);
      const summary = page.getByText('질문과 근거는 어떻게 처리되나요?', { exact: true });
      await summary.focus();
      await summary.press('Enter');
      await expect.poll(() => page.locator('details.question-composer__privacy').getAttribute('open')).not.toBeNull();
      const disclosure = await page.locator('details.question-composer__privacy').textContent();
      expect(disclosure).toContain('현재 질문과 선택된 공개 기록 발췌');
      expect(disclosure).toContain('설정된 AI 제공자');
      expect(disclosure).toContain('0일');
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);

  it.each([
    { height: 900, width: 1440 },
    { height: 844, width: 390 },
  ])('keeps every visible Task 2 search control at least 44 by 44 at $width px', async (viewport) => {
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

      await page.getByRole('searchbox', { name: '기록에 묻기' }).fill('없는질문');
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      await expect.poll(() => page.getByRole('heading', { name: '일치하는 결과가 없습니다.' }).count()).toBe(1);
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);
});
