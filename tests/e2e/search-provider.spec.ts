import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, observeRuntimeIssues } from './support';

const external = process.env.FORM_THOUGHT_E2E_EXTERNAL_STACK === '1';
const proxyOrigin = process.env.FORM_THOUGHT_E2E_EXTERNAL_ORIGIN ?? '';
const previewOrigin = process.env.FORM_THOUGHT_E2E_PREVIEW_ORIGIN ?? '';
const apiOrigin = process.env.FORM_THOUGHT_E2E_API_ORIGIN ?? '';
const sampleQuestion = 'AI 시대에도 왜 계속 책을 읽나요?';
const graphify = 'Graphify';

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
  await page.getByRole('searchbox', { name: '기록에 묻기' }).fill(question);
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
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/public/ask') {
      failures.push(request.failure()?.errorText ?? 'unknown request failure');
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text());
  });
  return { consoleErrors, failures };
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
  const runtimeIssues = observeRuntimeIssues(page);
  await page.goto(`/search/?q=${graphify}`);
  const initialUrl = page.url();
  const initialHistoryCalls = await page.evaluate(() => (
    (window as typeof window & { __historyCalls: { pushState: number; replaceState: number } }).__historyCalls
  ));
  await submit(page, sampleQuestion);
  await expect(page.locator('.answer-stage'), JSON.stringify(diagnostics)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.answer-stage__lines > p')).toHaveCount(1);
  await expect(page.locator('.answer-stage__citation')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /이 답의 근거 1개 보기/u })).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  expect(await page.evaluate(() => (
    (window as typeof window & { __historyCalls: { pushState: number; replaceState: number } }).__historyCalls
  ))).toEqual(initialHistoryCalls);
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
  expect(diagnostics).toEqual({ consoleErrors: [], failures: [] });
  expect(runtimeIssues).toEqual([]);
});

for (const entry of [
  ['@provider-disabled', '현재 답변 기능을 쉬고 있어', 200],
  ['@insufficient-evidence', '충분한 공개 근거를 확인하지 못해', 200],
  ['@unavailable', '답변 기능에 연결하지 못해', 503],
  ['@timeout', '답변을 기다리는 시간이 길어져', 503],
  ['@release-mismatch', '공개 기록 버전이 바뀌어', 409],
] as const) {
  test(`${entry[0]} exact status falls back to real deterministic results without retry`, async ({ page }) => {
    const requests = askRequests(page);
    const statuses: number[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/public/ask') statuses.push(response.status());
    });
    await page.goto('/search/');
    const initialUrl = page.url();
    await submit(page, graphify);
    await expect(page.locator('.second-brain-search__notice')).toContainText(entry[1], { timeout: 15_000 });
    await expect(page.locator('.search-result-list')).toHaveCount(1);
    await expect(page.locator('.answer-stage, .answer-stage__citation')).toHaveCount(0);
    expect(page.url()).toBe(initialUrl);
    expect(requests).toHaveLength(1);
    expect(statuses).toEqual([entry[2]]);
  });
}

test('@navigation direct, reload, back, and forward are deterministic and send zero POSTs', async ({ page }) => {
  const requests = askRequests(page);
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
});

test('@canonical-fallback POST fallback detail Back restores only location-derived state', async ({ page }) => {
  const requests = askRequests(page);
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
});

test('@redirect-307 owned redirect first hop falls back and never follows', async ({ page }) => {
  const requests = askRequests(page);
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
});

test('@redirect-308 owned redirect first hop falls back and never follows', async ({ page }) => {
  const requests = askRequests(page);
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
});

test('@slow-sql browser 8-second abort settles once and leaves no retry', async ({ page }) => {
  test.setTimeout(30_000);
  const requests = askRequests(page);
  await page.goto('/search/');
  const startedAt = Date.now();
  await submit(page, graphify);
  await expect(page.locator('.second-brain-search__notice')).toContainText('시간이 길어져', { timeout: 12_000 });
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(7_500);
  expect(Date.now() - startedAt).toBeLessThan(10_000);
  expect(requests).toHaveLength(1);
  await expect(page.locator('.search-result-list')).toHaveCount(1);
});

test('@rate-limit repeated real requests reach the guard without automatic retries', async ({ page }) => {
  const requests = askRequests(page);
  await page.goto('/search/');
  for (let index = 0; index < 4; index += 1) {
    await submit(page, graphify);
    await expect(page.locator('.second-brain-search')).not.toHaveAttribute('data-view', 'pending', { timeout: 15_000 });
  }
  await expect(page.locator('.second-brain-search__notice')).toContainText('질문이 많아');
  expect(requests).toHaveLength(4);
});

test('@viewport one real answer remains accessible across the complete viewport and input matrix', async ({ browser, page }) => {
  await mkdir('output/playwright/task8', { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/search/');
  const privacy = page.locator('details.question-composer__privacy');
  const summary = privacy.locator('summary');
  const summaryBox = await summary.boundingBox();
  expect(summaryBox?.width).toBeGreaterThanOrEqual(44);
  expect(summaryBox?.height).toBeGreaterThanOrEqual(44);
  await summary.focus();
  await summary.press('Enter');
  await expect(privacy).toContainText('AI 제공자');
  await expect(privacy).toContainText('보관 기간은 0일');
  await expect(privacy).not.toContainText(/검증된.*ZDR/u);
  await submit(page, sampleQuestion);
  await expect(page.locator('.answer-stage')).toBeVisible({ timeout: 15_000 });

  const cells = [
    ['desktop', 1440, 900],
    ['tablet', 768, 900],
    ['mobile', 390, 844],
    ['minimum', 320, 844],
  ] as const;
  for (const [name, width, height] of cells) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.site-shell')).toHaveCount(1);
    await expect(page.locator('.site-header')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(0);
    await expect(page.locator('.agent-stage__portrait-frame')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const serious = (await new AxeBuilder({ page }).analyze()).violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.playState === 'running').length)).toBe(0);
    await page.screenshot({ path: `output/playwright/task8/search-answer-${name}@${String(width)}x${String(height)}-dpr1.png`, fullPage: true });
  }

  const shortContext = await browser.newContext({
    baseURL: proxyOrigin,
    viewport: { width: 720, height: 450 },
    deviceScaleFactor: 2,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await shortContext.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, addEventListener() {}, removeEventListener() {} },
    });
  });
  const shortPage = await shortContext.newPage();
  try {
    await shortPage.goto('/search/');
    expect(await shortPage.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      devicePixelRatio,
      saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
    }))).toEqual({ coarse: true, devicePixelRatio: 2, saveData: true });
    const shortSummary = shortPage.locator('details.question-composer__privacy summary');
    const shortSummaryBox = await shortSummary.boundingBox();
    expect(shortSummaryBox?.width).toBeGreaterThanOrEqual(44);
    expect(shortSummaryBox?.height).toBeGreaterThanOrEqual(44);
    await submit(shortPage, sampleQuestion);
    await expect(shortPage.locator('.answer-stage')).toBeVisible({ timeout: 15_000 });
    await expect(shortPage.locator('.agent-stage__portrait-frame')).toBeVisible();
    await expectNoHorizontalOverflow(shortPage);
    expect((await new AxeBuilder({ page: shortPage }).analyze()).violations.filter((violation) => (
      violation.impact === 'serious' || violation.impact === 'critical'
    ))).toEqual([]);
    expect(await shortPage.evaluate(() => ({
      lookX: getComputedStyle(document.querySelector('.agent-stage')!).getPropertyValue('--look-x').trim(),
      lookY: getComputedStyle(document.querySelector('.agent-stage')!).getPropertyValue('--look-y').trim(),
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
    }))).toEqual({ lookX: '0px', lookY: '0px', runningAnimations: 0 });
    await shortPage.screenshot({
      path: 'output/playwright/task8/search-answer-short@720x450-dpr2.png',
      fullPage: true,
    });
  } finally {
    await shortContext.close();
  }

  const frame = page.locator('.agent-stage__portrait-frame');
  const before = await frame.boundingBox();
  await page.locator('.agent-stage__portrait').evaluate((image: HTMLImageElement) => { image.src = '/missing-avatar-task8.png'; });
  await expect(page.locator('.agent-stage')).toHaveAttribute('data-image-state', 'error');
  const after = await frame.boundingBox();
  expect(after).toEqual(before);
});
