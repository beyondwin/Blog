import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  publicAskRequestSchema,
  publicAskResponseSchema,
  type PublicAskResponse,
} from '../../packages/contracts/src/public-answer.ts';
import { expectNoHorizontalOverflow } from './support';

const live = process.env.FORM_THOUGHT_E2E_LIVE_STACK === '1';
const proxyOrigin = process.env.FORM_THOUGHT_E2E_EXTERNAL_ORIGIN ?? '';
const firstQuestion = 'AI 시대에도 왜 계속 책을 읽나요?';
const secondQuestion = 'Graphify를 공개 기록에서 찾아주세요';
const localLiveDisclosure = '로컬 개발용 AI 호출 · ZDR 검증 아님';

test.skip(!live, 'the live suite requires the owned live stack');

async function submit(page: Page, question: string) {
  const box = page.getByRole('searchbox').last();
  await box.fill(question);
  await page.getByRole('button', { name: '질문 보내기' }).last().click();
}

function askRequests(page: Page) {
  const requests: import('@playwright/test').Request[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/public/ask') requests.push(request);
  });
  return requests;
}

function requestDiagnostics(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

async function assertSearchControls(page: Page) {
  const controls = page.locator('.second-brain-search button:visible, .second-brain-search input:visible, .second-brain-search summary:visible, .second-brain-search a:visible, .evidence-modal-layer button:visible, .evidence-modal-layer a:visible');
  const measurements = await controls.evaluateAll((elements) => elements.map((element, index) => {
    const control = element as HTMLElement;
    const box = control.getBoundingClientRect();
    return {
      label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? `${control.tagName}:${String(index)}`,
      width: box.width,
      height: box.height,
    };
  }));
  expect(measurements.length).toBeGreaterThan(0);
  for (const focus of measurements) {
    expect(focus.width, `${focus.label} width`).toBeGreaterThanOrEqual(44);
    expect(focus.height, `${focus.label} height`).toBeGreaterThanOrEqual(44);
  }
}

async function openEvidence(page: Page) {
  const citation = page.locator('.answer-stage__citation').first();
  await citation.focus();
  await citation.press('Enter');
  const dialog = page.getByRole('dialog', { name: '이 답의 근거' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '근거 패널 닫기' })).toBeFocused();
  await expect(dialog.getByRole('link', { name: '원문 보기' })).toHaveAttribute('href', /^\/(?:articles|reviews|thoughts)\/[a-z0-9-]+\/$/u);
  return dialog;
}

function classifyResponse(body: PublicAskResponse): 'answer' | 'search' {
  if (body.kind === 'answer') return 'answer';
  if (body.kind === 'search') return 'search';
  throw new Error('live smoke received an error contract instead of answer or search');
}

test('@live-smoke two independent approved questions traverse the owned live proxy', async ({ page }) => {
  test.setTimeout(180_000);
  expect(proxyOrigin).toMatch(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u);
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests = askRequests(page);
  const diagnostics = requestDiagnostics(page);

  await page.goto('/search/');
  await expect(page.getByText(localLiveDisclosure, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await assertSearchControls(page);

  await submit(page, firstQuestion);
  await expect(page.locator('.answer-stage')).toBeVisible({ timeout: 15_000 });
  const firstDialog = await openEvidence(page);
  await expectNoHorizontalOverflow(page);
  await assertSearchControls(page);
  await page.keyboard.press('Escape');
  await expect(firstDialog).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(localLiveDisclosure, { exact: true })).toBeVisible();
  const mobileDialog = await openEvidence(page);
  await expectNoHorizontalOverflow(page);
  await assertSearchControls(page);
  await page.keyboard.press('Escape');
  await expect(mobileDialog).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await submit(page, secondQuestion);
  await expect(page.locator('.second-brain-search')).not.toHaveAttribute('data-view', 'pending', { timeout: 15_000 });
  await expect(page.locator('.answer-stage, .second-brain-search__notice')).toBeVisible();

  expect(requests).toHaveLength(2);
  const bodies: PublicAskResponse[] = [];
  for (const request of requests) {
    expect(new URL(request.url()).origin).toBe(proxyOrigin);
    expect(request.method()).toBe('POST');
    publicAskRequestSchema.parse(request.postDataJSON());
    const response = await request.response();
    expect(response, 'ask response missing').not.toBeNull();
    expect(response!.status()).not.toBe(405);
    bodies.push(publicAskResponseSchema.parse(await response!.json()));
  }
  const firstBody = publicAskRequestSchema.parse(requests[0]!.postDataJSON());
  const secondBody = publicAskRequestSchema.parse(requests[1]!.postDataJSON());
  expect(Object.keys(secondBody).sort()).toEqual(['answerReleaseId', 'contentReleaseId', 'question', 'version']);
  expect(secondBody.question).toBe(secondQuestion);
  expect(secondBody.question).not.toBe(firstBody.question);
  expect(secondBody.contentReleaseId).toBe(firstBody.contentReleaseId);
  expect(secondBody.answerReleaseId).toBe(firstBody.answerReleaseId);
  expect(secondBody.version).toBe(1);

  const kinds = bodies.map(classifyResponse);
  expect(kinds[0]).toBe('answer');
  expect(kinds.every((kind) => kind === 'answer' || kind === 'search')).toBe(true);
  const answeredQuestions = kinds.filter((kind) => kind === 'answer').length;
  const fallbackQuestions = kinds.filter((kind) => kind === 'search').length;
  expect(answeredQuestions).toBeGreaterThanOrEqual(1);
  expect(answeredQuestions + fallbackQuestions).toBe(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(localLiveDisclosure, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await assertSearchControls(page);

  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors.every((message) => (
    /Failed to load resource: the server responded with a status of (?:409|429|503)/u.test(message)
  ))).toBe(true);

  const evidenceRoot = process.env.FORM_THOUGHT_E2E_EVIDENCE_ROOT ?? 'output/playwright/public-answer-live';
  await mkdir(evidenceRoot, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${evidenceRoot}/live-desktop-1440x900.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidenceRoot}/live-mobile-390x844.png`, fullPage: true });
  const claims: string[] = [];
  const excerpts: string[] = [];
  for (const body of bodies) {
    if (body.kind !== 'answer') continue;
    for (const claim of body.claims) claims.push(claim.text);
    for (const item of body.evidence) excerpts.push(item.excerpt);
  }
  expect(claims.length).toBeGreaterThan(0);
  expect(excerpts.length).toBeGreaterThan(0);
  await writeFile(`${evidenceRoot}/response-sentinels.json`, `${JSON.stringify({ claims, excerpts })}\n`);
  await writeFile(`${evidenceRoot}/browser-receipt.json`, `${JSON.stringify({
    schemaVersion: 1,
    posts: 2,
    answeredQuestions,
    fallbackQuestions,
    viewports: ['1440x900', '390x844'],
    disclosureVisible: true,
    overflowFree: true,
    consoleErrorFree: true,
    evidenceDialogAccessible: true,
    targetsUnclipped: true,
    secondRequestIndependent: true,
    proxyOriginOnly: true,
  }, null, 2)}\n`);
});
