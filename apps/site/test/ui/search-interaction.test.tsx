import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement, createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, transformWithEsbuild, type Plugin, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { createAnswerViewModel } from '../../src/ui/search/answerViewModel';
import { EvidencePanel } from '../../src/ui/search/EvidencePanel';
import { LivingEvidenceDesk } from '../../src/ui/search/LivingEvidenceDesk';
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
const answerEvidence = [0, 1, 2, 3, 4, 5].map((index) => ({
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
  claims: [
    {
      id: 'claim-1' as const,
      text: '첫 번째 검증 문장입니다.',
      evidenceIds: [answerEvidence[4]!.evidenceId, answerEvidence[0]!.evidenceId],
    },
    {
      id: 'claim-2' as const,
      text: '두 번째 검증 문장입니다.',
      evidenceIds: [answerEvidence[0]!.evidenceId, answerEvidence[5]!.evidenceId, answerEvidence[2]!.evidenceId],
    },
    {
      id: 'claim-3' as const,
      text: '세 번째 검증 문장입니다.',
      evidenceIds: [answerEvidence[3]!.evidenceId, answerEvidence[1]!.evidenceId],
    },
  ],
  evidence: answerEvidence,
};
const oneEvidenceAnswer = {
  ...answer,
  claims: [{
    id: 'claim-1' as const,
    text: '하나의 근거로 검증한 문장입니다.',
    evidenceIds: [answerEvidence[2]!.evidenceId],
  }],
  evidence: [answerEvidence[2]!],
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

function clientPlugin(serverMarkup: string, criticalCss: string, options: { deferHydration?: boolean } = {}): Plugin {
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
        response.end(`<!doctype html><html><head><style>${criticalCss}</style></head><body><div id="root">${serverMarkup}</div><script type="module" src="/@id/virtual:second-brain-search-client"></script></body></html>`);
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
  const criticalCss = (await Promise.all([
    readFile(tokenStylesPath, 'utf8'),
    readFile(shellStylesPath, 'utf8'),
    readFile(searchStylesPath, 'utf8'),
  ])).join('\n');
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    cacheDir: await freshViteCacheRoot(),
    publicDir: join(repositoryRoot, 'apps/site/public'),
    logLevel: 'silent',
    plugins: [clientPlugin(markup, criticalCss, options)],
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
  it('keeps pending paper anonymous and reveals only the first three claim-ordered evidence records', () => {
    const idle = renderToString(createElement(LivingEvidenceDesk, {
      phase: 'retrieving',
      answer: null,
      interactive: false,
      onOpenEvidence() {},
    }));
    expect(idle.match(/class="living-evidence-desk__paper"/g)).toHaveLength(3);
    expect(idle.match(/<span/g)).toHaveLength(3);
    expect(idle).toContain('aria-hidden="true"');
    expect(idle).not.toContain('aria-label');
    expect(idle).not.toContain('<button');
    expect(idle).not.toContain('공개 기록 1');
    expect(idle).not.toContain('문단 1');

    const answered = renderToString(createElement(LivingEvidenceDesk, {
      phase: 'answered',
      answer: createAnswerViewModel(answer),
      interactive: true,
      onOpenEvidence() {},
    }));
    expect(answered.match(/class="living-evidence-desk__card"/g)).toHaveLength(3);
    expect(answered).toContain(`data-evidence-id="${answerEvidence[4]!.evidenceId}"`);
    expect(answered).toContain(`data-evidence-id="${answerEvidence[0]!.evidenceId}"`);
    expect(answered).toContain(`data-evidence-id="${answerEvidence[5]!.evidenceId}"`);
    expect(answered).toContain('공개 기록 5');
    expect(answered).toContain('문단 5');
    expect(answered).toContain('공개 기록 1');
    expect(answered).toContain('공개 기록 6');
    expect(answered).not.toContain('공개 기록 2');
    expect(answered).not.toContain('공개 기록 3');
    expect(answered).not.toContain('공개 기록 4');
  });

  it('fails closed before rendering an evidence panel with an invalid evidence ID', () => {
    const answerModel = createAnswerViewModel(oneEvidenceAnswer);
    expect(() => renderToString(createElement(EvidencePanel, {
      answer: answerModel,
      selectedEvidenceId: '9'.repeat(64),
      returnFocusRef: createRef<HTMLElement>(),
      onClose() {},
      onSelect() {},
    }))).toThrow('selected evidence must resolve');
  });

  it('renders every claim citation in provider order and opens evidence by exact ID', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      await page.evaluate((response) => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'resolve', response }), {
        ...answer,
        evidence: answer.evidence.map((item, index) => index === 4
          ? { ...item, dateLabel: '꾸며낸 날짜', context: '꾸며낸 맥락', rawUrl: 'https://provider.invalid/private' }
          : item),
      });

      const search = page.getByRole('searchbox', { name: '기록에 묻기' });
      await search.fill(SAMPLE_QUESTION);
      await search.press('Enter');
      await expect.poll(
        () => page.locator('.second-brain-search').getAttribute('data-view'),
        { timeout: 3_000 },
      ).toBe('answered');

      const claims = page.locator('.answer-stage__lines > p');
      expect(await claims.evaluateAll((elements) => elements.map((element) => Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('')))).toEqual([
        '첫 번째 검증 문장입니다.',
        '두 번째 검증 문장입니다.',
        '세 번째 검증 문장입니다.',
      ]);
      expect(await claims.nth(0).getByRole('button').allTextContents()).toEqual(['5', '1']);
      expect(await claims.nth(1).getByRole('button').allTextContents()).toEqual(['1', '6', '3']);
      expect(await claims.nth(2).getByRole('button').allTextContents()).toEqual(['4', '2']);
      expect(await claims.nth(0).getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))))
        .toEqual(['공개 기록 5 · 문단 5 근거 보기', '공개 기록 1 · 문단 1 근거 보기']);

      const firstCitation = claims.nth(0).getByRole('button').first();
      await firstCitation.click();
      const dialog = page.getByRole('dialog', { name: '이 답의 근거' });
      await expect.poll(() => dialog.count()).toBe(1);
      expect(await dialog.locator('.evidence-panel__locator').textContent()).toBe('문단 5');
      expect(await dialog.locator('blockquote').textContent()).toBe('공개 기록 근거 5');
      expect(await dialog.getByRole('link', { name: '원문 보기' }).getAttribute('href'))
        .toBe('/thoughts/why-i-read-in-the-ai-era/');
      expect(await dialog.textContent()).not.toContain('꾸며낸 날짜');
      expect(await dialog.textContent()).not.toContain('꾸며낸 맥락');
      expect(await dialog.textContent()).not.toContain('provider.invalid');
      expect(await dialog.textContent()).not.toContain('MEMORY LENS');
      expect(await dialog.textContent()).not.toContain('PASSAGES');
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);

      await dialog.getByRole('button', { name: '공개 기록 1 · 문단 1' }).click();
      expect(await page.getByRole('dialog', { name: '이 답의 근거' }).count()).toBe(1);
      expect(await dialog.locator('.evidence-panel__locator').textContent()).toBe('문단 1');
      expect(await dialog.locator('blockquote').textContent()).toBe('공개 기록 근거 1');
      await dialog.getByRole('button', { name: '근거 패널 닫기' }).click();
      await page.getByRole('button', { name: '이 답의 근거 6개 보기' }).click();
      expect(await dialog.locator('.evidence-panel__locator').textContent()).toBe('문단 5');
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('renders a click-through desk from the first three claim-ordered evidence IDs', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });

      const papers = page.locator('.living-evidence-desk__paper');
      expect(await papers.count()).toBe(3);
      expect(await papers.evaluateAll((elements) => elements.every((element) => element.getAttribute('aria-hidden') === 'true'))).toBe(true);
      expect(await page.locator('.living-evidence-desk').getByRole('button').count()).toBe(0);

      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(
        () => page.locator('.second-brain-search').getAttribute('data-view'),
        { timeout: 4_000 },
      ).toBe('answered');
      const cards = page.locator('.living-evidence-desk__card');
      expect(await cards.count()).toBe(3);
      expect(await cards.evaluateAll((elements) => elements.map((element) => ({
        id: element.getAttribute('data-evidence-id'),
        label: element.getAttribute('aria-label'),
      })))).toEqual([
        { id: answerEvidence[4]!.evidenceId, label: '공개 기록 5 · 문단 5 근거 보기' },
        { id: answerEvidence[0]!.evidenceId, label: '공개 기록 1 · 문단 1 근거 보기' },
        { id: answerEvidence[5]!.evidenceId, label: '공개 기록 6 · 문단 6 근거 보기' },
      ]);
      const deskProbe = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.living-evidence-desk__card'));
        const ids = new Set(cards.map((card) => card.dataset.evidenceId));
        const threadIds = Array.from(document.querySelectorAll<SVGElement>('.living-evidence-desk__threads [data-evidence-id]'))
          .map((thread) => thread.dataset.evidenceId);
        const first = cards[0]!;
        const bounds = first.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + (bounds.width / 2), bounds.top + (bounds.height / 2));
        return {
          cardSize: [bounds.width, bounds.height],
          decorationPointer: getComputedStyle(document.querySelector<HTMLElement>('.living-evidence-desk__decoration')!).pointerEvents,
          hitOwnsCard: hit === first || first.contains(hit),
          threadIds,
          threadsAreSubset: threadIds.every((id) => ids.has(id)),
          threadsHidden: document.querySelector('.living-evidence-desk__threads')?.getAttribute('aria-hidden'),
          threadsPointer: getComputedStyle(document.querySelector<HTMLElement>('.living-evidence-desk__threads')!).pointerEvents,
        };
      });
      expect(deskProbe.cardSize[0]).toBeGreaterThanOrEqual(44);
      expect(deskProbe.cardSize[1]).toBeGreaterThanOrEqual(44);
      expect(deskProbe).toMatchObject({
        decorationPointer: 'none',
        hitOwnsCard: true,
        threadsAreSubset: true,
        threadsHidden: 'true',
        threadsPointer: 'none',
      });
      expect(deskProbe.threadIds).toEqual([
        answerEvidence[4]!.evidenceId,
        answerEvidence[0]!.evidenceId,
        answerEvidence[5]!.evidenceId,
      ]);

      await cards.first().focus();
      expect(await cards.first().evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
      await cards.first().click();
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 근거' }).count()).toBe(1);
      expect(await page.locator('.evidence-panel__locator').textContent()).toBe('문단 5');
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('traps evidence focus and restores every prior isolation snapshot across repeated opens', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      await page.evaluate((response) => (window as typeof window & {
        __publicAskControl: { enqueue(script: unknown): void };
      }).__publicAskControl.enqueue({ type: 'resolve', response }), oneEvidenceAnswer);
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('answered');

      const shell = page.locator('.site-shell');
      await shell.evaluate((element) => element.setAttribute('aria-hidden', 'false'));
      await page.evaluate(() => {
        document.documentElement.style.overflow = 'clip';
        document.body.style.overflow = 'scroll';
      });
      const citation = page.locator('.answer-stage__citation[aria-label="공개 기록 3 · 문단 3 근거 보기"]');
      await citation.click();
      const dialog = page.getByRole('dialog', { name: '이 답의 근거' });
      const close = dialog.getByRole('button', { name: '근거 패널 닫기' });
      await expect.poll(() => close.evaluate((element) => document.activeElement === element)).toBe(true);
      expect(await shell.getAttribute('inert')).not.toBeNull();
      expect(await shell.getAttribute('aria-hidden')).toBe('true');
      expect(await page.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow]))
        .toEqual(['hidden', 'hidden']);
      expect(await targetBoxesBelowMinimum(page)).toEqual([]);
      await close.press('Shift+Tab');
      expect(await dialog.getByRole('link', { name: '원문 보기' }).evaluate((element) => document.activeElement === element)).toBe(true);
      await dialog.getByRole('link', { name: '원문 보기' }).press('Tab');
      expect(await close.evaluate((element) => document.activeElement === element)).toBe(true);
      await page.keyboard.press('Escape');
      await expect.poll(() => dialog.count()).toBe(0);
      await expect.poll(() => citation.evaluate((element) => document.activeElement === element)).toBe(true);
      expect(await shell.getAttribute('inert')).toBeNull();
      expect(await shell.getAttribute('aria-hidden')).toBe('false');
      expect(await page.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow]))
        .toEqual(['clip', 'scroll']);

      await citation.click();
      await page.locator('.evidence-backdrop').click({ position: { x: 2, y: 2 } });
      await expect.poll(() => dialog.count()).toBe(0);
      await expect.poll(() => citation.evaluate((element) => document.activeElement === element)).toBe(true);

      await shell.evaluate((element) => element.setAttribute('inert', ''));
      await citation.evaluate((element) => (element as HTMLButtonElement).click());
      await expect.poll(() => dialog.count()).toBe(1);
      await close.click();
      await expect.poll(() => dialog.count()).toBe(0);
      expect(await shell.getAttribute('inert')).not.toBeNull();
      expect(await shell.getAttribute('aria-hidden')).toBe('false');
      await shell.evaluate((element) => element.removeAttribute('inert'));

      expect(await targetBoxesBelowMinimum(page)).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it('cleans evidence isolation without focusing a removed trigger when a new question starts', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('answered');
      await page.locator('.answer-stage__citation').first().click();
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 근거' }).count()).toBe(1);
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('#second-brain-follow-up');
        if (!input?.form) throw new Error('follow-up form missing');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, '새 질문');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.form.requestSubmit();
      });
      await expect.poll(() => page.getByRole('dialog', { name: '이 답의 근거' }).count()).toBe(0);
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).not.toBe('evidence-open');
      expect(await page.locator('.site-shell').getAttribute('inert')).toBeNull();
      expect(await page.evaluate(() => document.activeElement === null || document.activeElement.isConnected)).toBe(true);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

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
      const before = await page.locator('.agent-stage__portrait-frame').evaluate((element) => element.getBoundingClientRect().toJSON());

      await page.evaluate(() => (window as typeof window & { __hydrateSecondBrainSearch?: () => void }).__hydrateSecondBrainSearch?.());
      await expect.poll(() => page.locator('.agent-stage').getAttribute('data-image-state'), { timeout: 4_000 }).toBe('error');
      expect(await page.locator('.agent-stage__portrait-frame').evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(before);
      expect(await page.getByRole('img', { name: '종이 조각이 접힌 FORM & THOUGHT 기록 안내자' }).count()).toBe(1);
      expect(await page.getByText('FORM & THOUGHT', { exact: true }).count()).toBe(1);
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
      expect(mobileBounds.avatar?.height).toBeGreaterThan(390);
      expect(mobileBounds.dialogue?.y).toBeCloseTo((mobileBounds.avatar?.y ?? 0) + (mobileBounds.avatar?.height ?? 0), 1);
      expect(mobileBounds.dialogue?.width).toBe(390);
      expect(mobileBounds.order).toEqual(['agent-stage', 'second-brain-dialogue']);
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 60_000);

  it('keeps the portrait centered and evidence in flow across the full responsive matrix', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const viewports = [
        { width: 1440, height: 900, header: 88 },
        { width: 768, height: 900, header: 80 },
        { width: 390, height: 844, header: 72 },
        { width: 320, height: 844, header: 72 },
        { width: 720, height: 450, header: 72, deviceScaleFactor: 2 },
      ];

      for (const viewport of viewports) {
        const regular = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        });
        await regular.emulateMedia({ reducedMotion: 'no-preference' });
        await regular.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
        const regularFrame = await regular.locator('.agent-stage__portrait-frame').evaluate((element) => element.getBoundingClientRect().toJSON());
        await regular.close();

        const reduced = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        });
        await reduced.emulateMedia({ reducedMotion: 'reduce' });
        await reduced.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
        const layout = await reduced.evaluate(() => {
          const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
          const frame = rect('.agent-stage__portrait-frame');
          const agent = rect('.agent-stage');
          const dialogue = rect('.second-brain-dialogue');
          const desk = rect('.living-evidence-desk');
          const stage = document.querySelector<HTMLElement>('.second-brain-search__stage')!;
          const animations = Array.from(document.querySelectorAll<HTMLElement>(
            '.living-evidence-desk *, .agent-stage__portrait-frame',
          )).filter((element) => getComputedStyle(element).animationName !== 'none');
          return {
            agent,
            animations: animations.map((element) => element.className),
            desk,
            dialogue,
            display: getComputedStyle(stage).display,
            frame,
            framePosition: getComputedStyle(document.querySelector<HTMLElement>('.agent-stage__portrait-frame')!).position,
            gridColumns: getComputedStyle(stage).gridTemplateColumns,
            headerHeight: rect('.site-header__inner').height,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            stageChildren: Array.from(stage.children).map((child) => child.className),
          };
        });
        expect(layout.headerHeight).toBeCloseTo(viewport.header, 1);
        expect(layout.stageChildren).toEqual(['agent-stage', 'second-brain-dialogue']);
        expect(layout.overflow).toBe(0);
        expect(layout.animations).toEqual([]);
        expect(layout.frame.x + (layout.frame.width / 2)).toBeCloseTo(layout.agent.x + (layout.agent.width / 2), 0);
        expect(layout.frame.x).toBeGreaterThanOrEqual(layout.agent.x - 0.5);
        expect(layout.frame.x + layout.frame.width).toBeLessThanOrEqual(layout.agent.x + layout.agent.width + 0.5);
        expect(layout.frame.x).toBeCloseTo(regularFrame.x, 1);
        expect(layout.frame.y).toBeCloseTo(regularFrame.y, 1);
        expect(layout.frame.width).toBeCloseTo(regularFrame.width, 1);
        expect(layout.frame.height).toBeCloseTo(regularFrame.height, 1);

        if (viewport.width < 568 || viewport.height >= 600) {
          if (viewport.width <= 767) {
            expect(layout.display).toBe('block');
            expect(layout.framePosition).toBe('relative');
            expect(layout.desk.y).toBeGreaterThanOrEqual(layout.frame.y + layout.frame.height - 1);
            expect(layout.dialogue.y).toBeGreaterThanOrEqual(layout.agent.y + layout.agent.height - 1);
          }
        } else {
          expect(layout.display).toBe('grid');
          expect(layout.gridColumns).not.toBe('none');
          expect(layout.dialogue.x).toBeGreaterThan(layout.agent.x);
          expect(layout.frame.width).toBeGreaterThan(0);
        }

        if (viewport.width === 320) {
          await reduced.evaluate((response) => (window as typeof window & {
            __publicAskControl: { enqueue(script: unknown): void };
          }).__publicAskControl.enqueue({ type: 'resolve', response }), {
            ...answer,
            evidence: answer.evidence.map((item, index) => index === 4
              ? { ...item, recordTitle: '한 줄에 다 들어가지 않는 아주 긴 공개 기록 제목도 내용을 줄이지 않고 안전하게 읽을 수 있어야 합니다' }
              : item),
          });
        }
        await reduced.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
        await expect.poll(() => reduced.locator('.second-brain-search').getAttribute('data-view')).toBe('answered');
        const cards = reduced.locator('.living-evidence-desk__card');
        expect(await cards.count()).toBe(3);
        expect(await cards.evaluateAll((elements) => elements.every((element) => {
          const bounds = element.getBoundingClientRect();
          const agentBounds = element.closest('.agent-stage')?.getBoundingClientRect();
          return bounds.width >= 44
            && bounds.height >= 44
            && bounds.left >= 0
            && bounds.right <= document.documentElement.clientWidth
            && Boolean(agentBounds)
            && bounds.top >= (agentBounds?.top ?? 0) - 0.5
            && bounds.bottom <= (agentBounds?.bottom ?? 0) + 0.5;
        }))).toBe(true);
        if (viewport.width === 320) {
          expect(await cards.first().textContent()).toContain('한 줄에 다 들어가지 않는 아주 긴 공개 기록 제목');
        }
        await reduced.close();
      }
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 90_000);

  it('coalesces fine-pointer parallax to one measured frame and resets or cancels every exit path', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true);

      const probe = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('.agent-stage')!;
        const callbacks: Array<{ callback: FrameRequestCallback; id: number }> = [];
        const cancelled: number[] = [];
        let nextId = 40;
        let rectReads = 0;
        const realRect = stage.getBoundingClientRect.bind(stage);
        stage.getBoundingClientRect = () => {
          rectReads += 1;
          return realRect();
        };
        window.requestAnimationFrame = (callback) => {
          const id = nextId;
          nextId += 1;
          callbacks.push({ callback, id });
          return id;
        };
        window.cancelAnimationFrame = (id) => { cancelled.push(id); };

        for (let index = 0; index < 12; index += 1) {
          stage.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: 10_000 + index,
            clientY: -10_000 - index,
          }));
        }
        const queuedBeforeFrame = callbacks.length;
        callbacks.shift()?.callback(16);
        const afterFrame = {
          rectReads,
          x: stage.style.getPropertyValue('--look-x'),
          y: stage.style.getPropertyValue('--look-y'),
        };
        stage.dispatchEvent(new PointerEvent('pointerleave'));
        const afterLeave = [stage.style.getPropertyValue('--look-x'), stage.style.getPropertyValue('--look-y')];
        stage.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }));
        const pendingId = callbacks[0]?.id;
        (window as typeof window & { __secondBrainRoot: { unmount(): void } }).__secondBrainRoot.unmount();
        return { afterFrame, afterLeave, cancelled, pendingId, queuedBeforeFrame };
      });
      expect(probe.queuedBeforeFrame).toBe(1);
      expect(probe.afterFrame.rectReads).toBe(1);
      expect(probe.afterFrame.x).toBe('8px');
      expect(probe.afterFrame.y).toBe('-6px');
      expect(probe.afterLeave).toEqual(['0px', '0px']);
      expect(probe.cancelled).toContain(probe.pendingId);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

  it.each([
    { mode: 'reduced-motion' as const },
    { mode: 'coarse-pointer' as const },
    { mode: 'data-saver' as const },
    { mode: 'hidden-document' as const },
  ])('does no pointer RAF or parallax writes in $mode mode', async ({ mode }) => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const context = mode === 'coarse-pointer'
        ? await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
        : await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const realSetProperty = CSSStyleDeclaration.prototype.setProperty;
        (window as typeof window & { __parallaxWrites: { count: number } }).__parallaxWrites = { count: 0 };
        CSSStyleDeclaration.prototype.setProperty = function setProperty(property, value, priority) {
          if (property === '--look-x' || property === '--look-y') {
            (window as typeof window & { __parallaxWrites: { count: number } }).__parallaxWrites.count += 1;
          }
          return realSetProperty.call(this, property, value, priority);
        };
      });
      if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
      if (mode === 'data-saver') {
        await page.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'connection', {
            configurable: true,
            get: () => ({ saveData: true }),
          });
        });
      }
      await page.goto(`${harness.baseUrl}/search/`, { waitUntil: 'networkidle' });
      const probe = await page.evaluate((currentMode) => {
        const stage = document.querySelector<HTMLElement>('.agent-stage')!;
        let rafs = 0;
        window.requestAnimationFrame = () => {
          rafs += 1;
          return 99;
        };
        if (currentMode === 'hidden-document') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        stage.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
        return {
          rafs,
          writes: (window as typeof window & { __parallaxWrites: { count: number } }).__parallaxWrites.count,
        };
      }, mode);
      expect(probe).toEqual({ rafs: 0, writes: 0 });
      await context.close();
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 30_000);

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

  it('restores the exact 426px GET result scroll after detail and native Back without provider work', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const harness = await startHarness();
      server = harness.server;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 426, height: 926 } });
      await page.goto(`${harness.baseUrl}/search/?q=Graphify`, { waitUntil: 'networkidle' });
      const result = page.locator('#record-articles-graphify-code-knowledge-graph-deep-dive');
      await result.scrollIntoViewIfNeeded();
      const before = await result.evaluate((node) => ({
        scrollY: window.scrollY,
        top: node.getBoundingClientRect().top,
      }));

      await result.getByRole('link').click();
      await expect.poll(() => page.getByRole('heading', { name: 'Graphify detail' }).count()).toBe(1);
      await page.goBack({ waitUntil: 'networkidle' });
      await expect.poll(() => page.locator('.second-brain-search').getAttribute('data-view')).toBe('search-results');
      const after = await result.evaluate((node) => ({
        scrollY: window.scrollY,
        top: node.getBoundingClientRect().top,
      }));

      expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => (window as typeof window & { __publicAskCalls: unknown[] }).__publicAskCalls.length)).toBe(0);
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
