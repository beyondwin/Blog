import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { expectNoHorizontalOverflow } from './support';

const external = process.env.FORM_THOUGHT_E2E_EXTERNAL_STACK === '1';
const proxyOrigin = process.env.FORM_THOUGHT_E2E_EXTERNAL_ORIGIN ?? '';
const previewOrigin = process.env.FORM_THOUGHT_E2E_PREVIEW_ORIGIN ?? '';
const apiOrigin = process.env.FORM_THOUGHT_E2E_API_ORIGIN ?? '';
const sampleQuestion = 'AI 시대에도 왜 계속 책을 읽나요?';
const secondQuestion = 'AI 시대에도 왜 책을 계속 읽어야 하나요?';
const graphify = 'Graphify';
const arbitraryQuestion = 'AI';
const unsupportedQuestion = '---';
const maximumQuestion = '가'.repeat(120);

test.skip(!external, 'the provider suite requires the owned external stack');

async function instrumentPage(page: Page) {
  await page.addInitScript(() => {
    const calls = { pushState: 0, replaceState: 0 };
    Object.defineProperty(window, '__historyCalls', { value: calls, configurable: false });
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args) => { calls.pushState += 1; return push(...args); };
    history.replaceState = (...args) => { calls.replaceState += 1; return replace(...args); };
  });
}

async function submit(page: Page, question: string) {
  await page.getByRole('searchbox').fill(question);
  await page.getByRole('button', { name: '질문 보내기' }).click();
}

function askRequests(page: Page) {
  const requests: import('@playwright/test').Request[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/public/ask') requests.push(request);
  });
  return requests;
}

function requestDiagnostics(page: Page) {
  const failures: string[] = [];
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/public/ask') {
      failures.push(request.failure()?.errorText ?? 'unknown request failure');
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning') consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { consoleErrors, consoleWarnings, failures, pageErrors };
}

function assertCleanDiagnostics(
  diagnostics: ReturnType<typeof requestDiagnostics>,
  drivenValues: readonly string[],
) {
  expect(diagnostics.consoleWarnings).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  for (const message of [...diagnostics.consoleErrors, ...diagnostics.failures]) {
    for (const value of drivenValues) expect(message).not.toContain(value);
  }
  expect(diagnostics.consoleErrors.every((message) => (
    /Failed to load resource: the server responded with a status of (?:307|308|409|429|503)/u.test(message)
  ))).toBe(true);
}

async function historyCalls(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & { __historyCalls: { pushState: number; replaceState: number } }).__historyCalls
  ));
}

async function settledSearchHistoryCalls(page: Page) {
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
  await page.evaluate(() => new Promise<void>((accept) => {
    requestAnimationFrame(() => requestAnimationFrame(() => accept()));
  }));
  return historyCalls(page);
}

async function assertNoRawPersistence(page: Page, rawQuestion: string) {
  const evidence = await page.evaluate((question) => {
    const attributeHits = [...document.querySelectorAll('*')].flatMap((element) => (
      [...element.attributes]
        .filter((attribute) => !(element instanceof HTMLInputElement && attribute.name === 'value'))
        .filter((attribute) => attribute.value.includes(question))
        .map((attribute) => `${element.tagName}:${attribute.name}`)
    ));
    const storageHits: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index) ?? '';
      const value = sessionStorage.getItem(key) ?? '';
      if (key.includes(question) || value.includes(question)) storageHits.push(key);
    }
    return {
      attributeHits,
      history: JSON.stringify(history.state ?? null).includes(question),
      storageHits,
      url: location.href.includes(encodeURIComponent(question)) || location.href.includes(question),
    };
  }, rawQuestion);
  expect(evidence).toEqual({ attributeHits: [], history: false, storageHits: [], url: false });
}

test('@success-core approved question traverses only the owned proxy and renders exact public evidence', async ({ context, page }) => {
  expect(new Set([proxyOrigin, previewOrigin, apiOrigin]).size).toBe(3);
  await context.addCookies([{ name: 'hostile-cookie', value: 'must-not-cross', url: proxyOrigin }]);
  await instrumentPage(page);
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto(`/search/?q=${graphify}`);
  const initialUrl = page.url();
  const initialHistoryCalls = await settledSearchHistoryCalls(page);
  await submit(page, sampleQuestion);
  await expect(page.locator('.answer-stage'), JSON.stringify(diagnostics)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.answer-stage__lines > p')).toHaveCount(1);
  await expect(page.locator('.answer-stage__citation')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /이 답의 근거 1개 보기/u })).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  expect(await historyCalls(page)).toEqual(initialHistoryCalls);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]!.url()).origin).toBe(proxyOrigin);
  expect(requests[0]!.method()).toBe('POST');
  // Playwright serializes an omitted Chromium Referer as an empty string.
  expect(requests[0]!.headers()['referer'] ?? '').toBe('');
  await assertNoRawPersistence(page, sampleQuestion);

  const citation = page.locator('.answer-stage__citation');
  await citation.focus();
  await citation.press('Enter');
  const dialog = page.getByRole('dialog', { name: '이 답의 근거' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '근거 패널 닫기' })).toBeFocused();
  await expect(dialog.getByRole('link', { name: '원문 보기' })).toHaveAttribute(
    'href', '/thoughts/why-i-read-in-the-ai-era/',
  );
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: '원문 보기' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '근거 패널 닫기' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(citation).toBeFocused();
  assertCleanDiagnostics(diagnostics, [sampleQuestion]);
});

for (const entry of [
  ['@provider-disabled', '현재 답변 기능을 쉬고 있어', 200],
  ['@insufficient-evidence', '충분한 공개 근거를 확인하지 못해', 200],
  ['@unavailable', '답변 기능에 연결하지 못해', 503],
  ['@timeout', '답변을 기다리는 시간이 길어져', 503],
  ['@release-mismatch', '공개 기록 버전이 바뀌어', 409],
] as const) {
  test(`${entry[0]} exact status falls back to real deterministic results without retry`, async ({ page }) => {
    await instrumentPage(page);
    const requests = askRequests(page);
    const diagnostics = requestDiagnostics(page);
    const statuses: number[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/public/ask') statuses.push(response.status());
    });
    await page.goto(`/search/?q=${graphify}#record-articles-graphify-code-knowledge-graph-deep-dive`);
    await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
    const initialUrl = page.url();
    const initialHistoryCalls = await settledSearchHistoryCalls(page);
    await submit(page, arbitraryQuestion);
    await expect(page.locator('.second-brain-search__notice')).toContainText(entry[1], { timeout: 15_000 });
    await expect(page.locator('.search-result-list')).toHaveCount(1);
    await expect(page.locator('.answer-stage, .answer-stage__citation')).toHaveCount(0);
    expect(page.url()).toBe(initialUrl);
    expect(await historyCalls(page)).toEqual(initialHistoryCalls);
    expect(requests).toHaveLength(1);
    expect(statuses).toEqual([entry[2]]);
    await assertNoRawPersistence(page, arbitraryQuestion);
    assertCleanDiagnostics(diagnostics, [arbitraryQuestion]);
  });
}

test('@unsupported arbitrary format-only question takes the deterministic fallback without provider work', async ({ page }) => {
  await instrumentPage(page);
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto(`/search/?q=${graphify}#record-articles-graphify-code-knowledge-graph-deep-dive`);
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
  const initialUrl = page.url();
  const initialHistoryCalls = await settledSearchHistoryCalls(page);
  await submit(page, unsupportedQuestion);
  await expect(page.locator('.second-brain-search__notice')).toContainText('답하기 어려워');
  await expect(page.locator('.search-zero, .search-result-list')).toHaveCount(1);
  expect(page.url()).toBe(initialUrl);
  expect(await historyCalls(page)).toEqual(initialHistoryCalls);
  expect(requests).toHaveLength(1);
  await assertNoRawPersistence(page, unsupportedQuestion);
  assertCleanDiagnostics(diagnostics, [unsupportedQuestion]);
});

test('@second-submit keeps query and hash byte-identical and replaces the answer only through a second POST', async ({ page }) => {
  const databaseUrl = process.env.FORM_THOUGHT_E2E_DATABASE_URL;
  expect(databaseUrl).toMatch(/^postgresql:\/\/beyondwin_test:beyondwin_test@127\.0\.0\.1:\d+\/beyondwin_test$/u);
  const pool = new Pool({ connectionString: databaseUrl });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await instrumentPage(page);
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  try {
    await page.goto(`/search/?q=${graphify}#record-articles-graphify-code-knowledge-graph-deep-dive`);
    await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
    const initialUrl = page.url();
    const initialHistoryCalls = await settledSearchHistoryCalls(page);
    await submit(page, sampleQuestion);
    await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'pending');
    await expect.poll(async () => Number((await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_stat_activity
      WHERE datname=current_database() AND query LIKE 'SELECT pg_sleep(30)%' AND state='active'
    `)).rows[0]!.count), { message: 'the first request must enter the owned runtime slow query' }).toBe(1);
    expect(await page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.playState === 'running').length)).toBe(0);

    const replacementComposer = page.getByRole('searchbox', { name: '다른 질문으로 바꾸기' });
    await expect(replacementComposer, 'replacement must be available while the first runtime query is active')
      .toBeVisible({ timeout: 750 });
    await replacementComposer.fill(secondQuestion);
    await replacementComposer.press('Enter');
    await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'pending');
    await expect(page.locator('.answer-stage__asked strong')).toHaveText(secondQuestion, { timeout: 15_000 });
    await expect.poll(async () => Number((await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_stat_activity
      WHERE datname=current_database() AND query LIKE 'SELECT pg_sleep(30)%' AND state='active'
    `)).rows[0]!.count), { message: 'replacement must cancel the first runtime query' }).toBe(0);
    await page.waitForTimeout(250);
    await expect(page.locator('.answer-stage__asked strong')).toHaveText(secondQuestion);
    await expect(page.locator('.answer-stage__asked strong')).not.toHaveText(sampleQuestion);
    expect(page.url()).toBe(initialUrl);
    expect(await historyCalls(page)).toEqual(initialHistoryCalls);
    expect(requests).toHaveLength(2);
    await assertNoRawPersistence(page, sampleQuestion);
    await assertNoRawPersistence(page, secondQuestion);
    assertCleanDiagnostics(diagnostics, [sampleQuestion, secondQuestion]);
  } finally {
    await pool.end();
  }
});

test('@popstate-active cancels active SQL and restores only the prior location state', async ({ page }) => {
  test.setTimeout(30_000);
  await instrumentPage(page);
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto(`/search/?q=${graphify}#record-articles-graphify-code-knowledge-graph-deep-dive`);
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
  await page.evaluate(() => history.pushState({ ownedSetup: true }, '', '/search/?q=AI#record-articles-ai-design-references'));
  const initialHistoryCalls = await settledSearchHistoryCalls(page);
  await submit(page, arbitraryQuestion);
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'pending');
  await expect.poll(() => requests.length, { message: 'the real POST must be active before popstate cancellation' }).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(`${proxyOrigin}/search/?q=${graphify}#record-articles-graphify-code-knowledge-graph-deep-dive`);
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
  await expect(page.locator('.answer-stage, .second-brain-search__notice')).toHaveCount(0);
  expect(await historyCalls(page)).toEqual(initialHistoryCalls);
  expect(requests).toHaveLength(1);
  await assertNoRawPersistence(page, arbitraryQuestion);
  assertCleanDiagnostics(diagnostics, [arbitraryQuestion]);
});

test('@navigation direct, reload, back, and forward are deterministic and send zero POSTs', async ({ page }) => {
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto(`/search/?q=${graphify}`);
  await expect(page.locator('.search-result-list')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.search-result-list')).toHaveCount(1);
  await page.goto('/search/');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/search/\\?q=${graphify}$`, 'u'));
  await page.goForward();
  await expect(page).toHaveURL(/\/search\/$/u);
  expect(requests).toHaveLength(0);
  assertCleanDiagnostics(diagnostics, []);
});

test('@canonical-fallback POST fallback detail Back restores only location-derived state', async ({ page }) => {
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  const rawQuestion = graphify;
  await page.goto('/search/');
  await submit(page, rawQuestion);
  await expect(page.locator('.second-brain-search__notice')).toBeVisible();
  const first = page.locator('.search-result-list a').first();
  await expect(first).toBeVisible();
  await first.click();
  await page.goBack();
  await expect(page).toHaveURL(`${proxyOrigin}/search/`);
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'idle');
  await expect(page.locator('.answer-stage, .second-brain-search__notice')).toHaveCount(0);
  await assertNoRawPersistence(page, rawQuestion);
  expect(requests).toHaveLength(1);
  assertCleanDiagnostics(diagnostics, [rawQuestion]);
});

test('@redirect-307 owned redirect first hop falls back and never follows', async ({ page }) => {
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/public/ask') statuses.push(response.status());
  });
  await page.goto('/search/');
  await submit(page, graphify);
  await expect(page.locator('.second-brain-search__notice')).toContainText('검증할 수 없는');
  await expect(page.locator('.search-result-list')).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(statuses).toEqual([307]);
  await assertNoRawPersistence(page, graphify);
  assertCleanDiagnostics(diagnostics, [graphify]);
});

test('@redirect-308 owned redirect first hop falls back and never follows', async ({ page }) => {
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/public/ask') statuses.push(response.status());
  });
  await page.goto('/search/');
  await submit(page, graphify);
  await expect(page.locator('.second-brain-search__notice')).toContainText('검증할 수 없는');
  await expect(page.locator('.search-result-list')).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(statuses).toEqual([308]);
  await assertNoRawPersistence(page, graphify);
  assertCleanDiagnostics(diagnostics, [graphify]);
});

test('@slow-sql browser 8-second abort settles once and leaves no retry', async ({ page }) => {
  test.setTimeout(30_000);
  await instrumentPage(page);
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto(`/search/?q=${graphify}#record-articles-graphify-code-knowledge-graph-deep-dive`);
  await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
  const initialUrl = page.url();
  const initialHistoryCalls = await settledSearchHistoryCalls(page);
  const startedAt = Date.now();
  await submit(page, arbitraryQuestion);
  await expect(page.locator('.second-brain-search__notice')).toContainText('시간이 길어져', { timeout: 12_000 });
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(7_500);
  expect(Date.now() - startedAt).toBeLessThan(10_000);
  expect(requests).toHaveLength(1);
  await expect(page.locator('.search-result-list')).toHaveCount(1);
  expect(page.url()).toBe(initialUrl);
  expect(await historyCalls(page)).toEqual(initialHistoryCalls);
  await assertNoRawPersistence(page, arbitraryQuestion);
  assertCleanDiagnostics(diagnostics, [arbitraryQuestion]);
});

test('@rate-limit repeated real requests reach the guard without automatic retries', async ({ page }) => {
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto('/search/');
  for (let index = 0; index < 4; index += 1) {
    await submit(page, graphify);
    await expect(page.locator('.second-brain-search')).not.toHaveAttribute('data-view', 'pending', { timeout: 15_000 });
  }
  await expect(page.locator('.second-brain-search__notice')).toContainText('질문이 많아');
  expect(requests).toHaveLength(4);
  await assertNoRawPersistence(page, graphify);
  assertCleanDiagnostics(diagnostics, [graphify]);
});

test('@stress-max real stack renders five 600-code-point claims and six canonical evidence items', async ({ page }) => {
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);
  await page.goto('/search/');
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/public/ask');
  await submit(page, sampleQuestion);
  const response = await responsePromise;
  const payload = await response.json() as { claims: readonly unknown[]; evidence: readonly { evidenceId: string }[] };
  expect(payload.claims).toHaveLength(5);
  expect(payload.evidence).toHaveLength(6);
  expect(new Set(payload.evidence.map((item) => item.evidenceId)).size).toBe(6);
  await expect(page.locator('.answer-stage')).toBeVisible({ timeout: 15_000 });
  const claims = page.locator('.answer-stage__lines > p');
  await expect(claims).toHaveCount(5);
  expect(await claims.evaluateAll((items) => items.map((item) => (
    [...(item.firstChild?.textContent ?? '')].length
  ))))
    .toEqual([600, 600, 600, 600, 600]);
  const citations = page.locator('.answer-stage__citation');
  await expect(citations).toHaveCount(6);
  for (let index = 0; index < await citations.count(); index += 1) {
    await citations.nth(index).click();
    const dialog = page.getByRole('dialog', { name: '이 답의 근거' });
    await expect(dialog).toBeVisible();
    const sources = dialog.locator('.evidence-panel__sources button');
    for (let sourceIndex = 0; sourceIndex < await sources.count(); sourceIndex += 1) {
      await sources.nth(sourceIndex).click();
      await expect(dialog.getByRole('link', { name: '원문 보기' })).toHaveAttribute('href', /^\/(?:[a-z0-9-]+\/)+$/u);
    }
    await page.keyboard.press('Escape');
  }
  expect(requests).toHaveLength(1);
  await assertNoRawPersistence(page, sampleQuestion);
  assertCleanDiagnostics(diagnostics, [sampleQuestion]);
});

async function assertSearchControls(page: Page) {
  const controls = page.locator('.second-brain-search button:visible, .second-brain-search input:visible, .second-brain-search summary:visible, .second-brain-search a:visible');
  const measurements = await controls.evaluateAll((elements) => elements.map((element, index) => {
    const control = element as HTMLElement;
    control.focus();
    const box = control.getBoundingClientRect();
      const style = getComputedStyle(element);
      const rowAfter = element.closest('.question-composer__row')
        ? getComputedStyle(element.closest('.question-composer__row')!, '::after')
        : null;
      return {
        label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? `${control.tagName}:${String(index)}`,
        width: box.width,
        height: box.height,
        outline: Number.parseFloat(style.outlineWidth),
        rowIndicator: rowAfter === null ? 0 : Number.parseFloat(rowAfter.height),
      };
  }));
  expect(measurements.length).toBeGreaterThan(0);
  for (const focus of measurements) {
    expect(focus.width, `${focus.label} width`).toBeGreaterThanOrEqual(44);
    expect(focus.height, `${focus.label} height`).toBeGreaterThanOrEqual(44);
    expect(Math.max(focus.outline, focus.rowIndicator)).toBeGreaterThanOrEqual(2);
  }
}

async function assertAccessibleState(page: Page) {
  await expect(page.locator('.site-shell')).toHaveCount(1);
  await expect(page.locator('.site-header')).toHaveCount(1);
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.locator('.agent-stage__portrait-frame')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await assertSearchControls(page);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((violation) => (
    violation.impact === 'serious' || violation.impact === 'critical'
  ))).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === 'running').length)).toBe(0);
}

async function forcePortraitFailureWithoutGeometryShift(
  page: Page,
  diagnostics: ReturnType<typeof requestDiagnostics>,
) {
  const frame = page.locator('.agent-stage__portrait-frame');
  const before = await frame.evaluate((element) => element.getBoundingClientRect().toJSON());
  const missing = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/images/task8-owned-missing-avatar.png' && response.status() === 404
  ));
  await page.locator('.agent-stage__portrait').evaluate((image) => {
    (image as HTMLImageElement).src = '/images/task8-owned-missing-avatar.png';
  });
  await missing;
  await expect(page.locator('.agent-stage')).toHaveAttribute('data-image-state', 'error');
  expect(await frame.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(before);
  await expect(page.getByText('FORM & THOUGHT', { exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleWarnings).toEqual([]);
  expect(diagnostics.consoleErrors.every((message) => /status of 404/u.test(message))).toBe(true);
  diagnostics.consoleErrors.length = 0;
}

async function exerciseMobileMenu(page: Page) {
  const open = page.getByRole('button', { name: '메뉴 열기' });
  if (!await open.isVisible() || await open.getAttribute('aria-haspopup') !== 'dialog') return;
  const previousOverflow = await page.evaluate(() => document.documentElement.style.overflow);
  await open.click();
  const close = page.getByRole('button', { name: '메뉴 닫기' });
  await expect(close).toBeVisible();
  await expect(page.getByRole('dialog', { name: '주 탐색 메뉴' })).toBeVisible();
  await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('#site-navigation-menu');
    if (menu === null || menu.hidden) throw new Error('mobile menu must be visible before observing close');
    const owner = window as typeof window & {
      __task8MobileMenuRestoration?: { inertCount: number; overflow: string } | null;
    };
    owner.__task8MobileMenuRestoration = null;
    const observer = new MutationObserver(() => {
      if (!menu.hidden) return;
      owner.__task8MobileMenuRestoration = {
        inertCount: document.querySelectorAll('[data-mobile-menu-inert][inert]').length,
        overflow: document.documentElement.style.overflow,
      };
      observer.disconnect();
    });
    observer.observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  });
  await close.click();
  expect(await page.evaluate(() => ({
    currentInertCount: document.querySelectorAll('[data-mobile-menu-inert][inert]').length,
    currentOverflow: document.documentElement.style.overflow,
    hidden: (window as typeof window & {
      __task8MobileMenuRestoration?: { inertCount: number; overflow: string } | null;
    }).__task8MobileMenuRestoration ?? null,
  }))).toEqual({
    currentInertCount: 0,
    currentOverflow: previousOverflow,
    hidden: { inertCount: 0, overflow: previousOverflow },
  });
  await expect(open).toBeVisible();
  await expect(open).toBeFocused();
  await expect(page.getByRole('dialog', { name: '주 탐색 메뉴' })).toHaveCount(0);
}

const viewportCells = [
  { tag: '@viewport-desktop', name: 'desktop', width: 1440, height: 900, dpr: 1, touch: false },
  { tag: '@viewport-tablet', name: 'tablet', width: 768, height: 900, dpr: 1, touch: false },
  { tag: '@viewport-mobile', name: 'mobile', width: 390, height: 844, dpr: 1, touch: true },
  { tag: '@viewport-minimum', name: 'minimum', width: 320, height: 844, dpr: 1, touch: true },
  { tag: '@viewport-short', name: 'short', width: 720, height: 450, dpr: 2, touch: true },
] as const;

for (const cell of viewportCells) {
  test(`${cell.tag} idle answer and fallback remain accessible at ${cell.width}x${cell.height} DPR${cell.dpr}`, async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: proxyOrigin,
      viewport: { width: cell.width, height: cell.height },
      deviceScaleFactor: cell.dpr,
      hasTouch: cell.touch,
      reducedMotion: 'reduce',
    });
    if (cell.name === 'short') {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: { saveData: true, addEventListener() {}, removeEventListener() {} },
        });
      });
    }
    const page = await context.newPage();
    const requests = askRequests(page);
    const diagnostics = requestDiagnostics(page);
    try {
      await page.goto('/search/');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused();
      await assertAccessibleState(page);

      await forcePortraitFailureWithoutGeometryShift(page, diagnostics);

      await exerciseMobileMenu(page);

      const privacy = page.locator('details.question-composer__privacy');
      await privacy.locator('summary').press('Enter');
      await expect(privacy).toContainText('AI 제공자');
      await expect(privacy).toContainText('보관 기간은 0일');
      await expect(privacy).not.toContainText(/검증된.*ZDR/u);
      await page.getByRole('searchbox', { name: '기록에 묻기' }).fill(sampleQuestion);
      await page.getByRole('searchbox', { name: '기록에 묻기' }).press('Enter');
      await expect(page.locator('.answer-stage')).toBeVisible({ timeout: 15_000 });
      await assertAccessibleState(page);

      const cardsAreContained = await page.locator('.living-evidence-desk__card').evaluateAll((cards) => cards.every((card) => {
        const bounds = card.getBoundingClientRect();
        const owner = card.closest('.agent-stage')?.getBoundingClientRect();
        return owner !== undefined && bounds.left >= owner.left - 0.5 && bounds.right <= owner.right + 0.5
          && bounds.top >= owner.top - 0.5 && bounds.bottom <= owner.bottom + 0.5;
      }));
      expect(cardsAreContained).toBe(true);

      const citations = page.locator('.answer-stage__citation');
      for (let citationIndex = 0; citationIndex < await citations.count(); citationIndex += 1) {
        await citations.nth(citationIndex).focus();
        await citations.nth(citationIndex).press('Enter');
        const dialog = page.getByRole('dialog', { name: '이 답의 근거' });
        await expect(dialog).toBeVisible();
        const sources = dialog.locator('.evidence-panel__sources button');
        for (let sourceIndex = 0; sourceIndex < await sources.count(); sourceIndex += 1) {
          await sources.nth(sourceIndex).click();
          await expect(sources.nth(sourceIndex)).toHaveAttribute('aria-pressed', 'true');
          await expect(dialog.getByRole('link', { name: '원문 보기' })).toHaveAttribute('href', /^\//u);
        }
        await page.keyboard.press('Escape');
        await expect(citations.nth(citationIndex)).toBeFocused();
      }

      await exerciseMobileMenu(page);

      await submit(page, unsupportedQuestion);
      await expect(page.locator('.second-brain-search')).toHaveAttribute('data-view', 'search-results');
      await expect(page.locator('.answer-stage, .answer-stage__citation')).toHaveCount(0);
      await assertAccessibleState(page);

      await submit(page, maximumQuestion);
      await expect(page.locator('.second-brain-search')).not.toHaveAttribute('data-view', 'pending', { timeout: 15_000 });
      expect([...(requests[2]!.postDataJSON() as { question: string }).question]).toHaveLength(120);
      await assertNoRawPersistence(page, unsupportedQuestion);
      await assertNoRawPersistence(page, maximumQuestion);
      expect(requests).toHaveLength(3);

      if (cell.name === 'short') {
        expect(await page.evaluate(() => ({
          coarse: matchMedia('(pointer: coarse)').matches,
          devicePixelRatio,
          lookX: getComputedStyle(document.querySelector('.agent-stage')!).getPropertyValue('--look-x').trim(),
          lookY: getComputedStyle(document.querySelector('.agent-stage')!).getPropertyValue('--look-y').trim(),
          saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
        }))).toEqual({ coarse: true, devicePixelRatio: 2, lookX: '0px', lookY: '0px', saveData: true });
      }

      const evidenceRoot = process.env.FORM_THOUGHT_E2E_EVIDENCE_ROOT ?? 'output/playwright/task8';
      await mkdir(evidenceRoot, { recursive: true });
      await page.screenshot({
        path: `${evidenceRoot}/search-${cell.name}@${String(cell.width)}x${String(cell.height)}-dpr${String(cell.dpr)}.png`,
        fullPage: true,
      });
      assertCleanDiagnostics(diagnostics, [sampleQuestion, unsupportedQuestion, maximumQuestion]);
    } finally {
      await context.close();
    }
  });
}
