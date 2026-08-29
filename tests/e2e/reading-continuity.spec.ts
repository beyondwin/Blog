import { expect, test, type Page } from '@playwright/test';
import { APPROVED_VIEWPORTS, canonicalUrl, expectNoHorizontalOverflow } from './support';

const articlePath = '/articles/graphify-code-knowledge-graph-deep-dive/';
const reviewPath = '/reviews/black-swan/';

function url(path: string): string {
  return canonicalUrl(path);
}

async function expectCleanReadingPage(page: Page, path: string, errors: string[]) {
  await expect(page).toHaveURL(url(path));
  expect(errors).toEqual([]);
  await expectNoHorizontalOverflow(page);
}

async function gotoReadingPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url(path));
  await page.waitForLoadState('networkidle');
  await expectCleanReadingPage(page, path, errors);
  return errors;
}

type TestOrigin =
  | { kind: 'articles'; anchorId: string }
  | { kind: 'search'; query: string; anchorId: string };

async function gotoWithStoredOrigin(
  page: Page,
  path: string,
  origin: TestOrigin,
  ageMs = 0,
) {
  const token = '101112131415161718191a1b1c1d1e1f';
  await page.goto(url('/'));
  await page.evaluate(({ originValue, targetPath, tokenValue, age }) => {
    sessionStorage.setItem(`bw:origin:${tokenValue}`, JSON.stringify({
      origin: originValue,
      targetPath,
      issuedAt: Date.now() - age,
    }));
  }, { originValue: origin, targetPath: path, tokenValue: token, age: ageMs });
  const destination = new URL(path, canonicalUrl('/'));
  destination.searchParams.set('__bw_from', origin.kind);
  if (origin.kind === 'articles' || origin.kind === 'search') {
    destination.searchParams.set('__bw_anchor', origin.anchorId);
  }
  if (origin.kind === 'search') destination.searchParams.set('__bw_query', origin.query);
  destination.searchParams.set('__bw_token', token);
  await page.goto(destination.href);
  await page.waitForLoadState('networkidle');
}

for (const viewport of [
  APPROVED_VIEWPORTS.desktop,
  APPROVED_VIEWPORTS.mobile390,
]) {
  test.describe(`${viewport.width}px quiet reading`, () => {
    test.use({ viewport });

    test('direct article keeps canonical return, resolved media, and the reading measure', async ({ page }) => {
      const errors = await gotoReadingPage(page, articlePath);
      await expect(page.getByRole('link', { name: '아티클 목록으로' })).toHaveAttribute('href', '/articles/');
      await expect(page.locator('.editorial-detail-frame__media img')).toHaveCount(1);
      const metrics = await page.locator('.editorial-detail-frame__prose .prose').evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          width: node.getBoundingClientRect().width,
        };
      });
      expect(metrics.fontSize).toBe(viewport.width === 390 ? 16 : 17);
      expect(metrics.lineHeight / metrics.fontSize).toBeCloseTo(1.9, 1);
      expect(metrics.width).toBeLessThanOrEqual(715);
      expect(errors).toEqual([]);
      if (process.env.BEYONDWIN_CAPTURE_SCREENSHOTS === '1') {
        await page.screenshot({ path: `output/playwright/task12/article-${viewport.width}.png`, fullPage: true });
      }
    });

    test('direct review truthfully remains text-led when the public release has no approved cover', async ({ page }) => {
      const errors = await gotoReadingPage(page, reviewPath);
      await expect(page.getByRole('link', { name: '서평 목록으로' })).toHaveAttribute('href', '/reviews/');
      await expect(page.locator('.review-detail')).toHaveClass(/review-detail--text-led/u);
      await expect(page.locator('.review-detail__cover-stage img')).toHaveCount(0);
      await expect(page.getByText('판본 확인 · 표지 공개 권리 미확인', { exact: true })).toBeVisible();
      await expect(page.locator('.review-detail')).toHaveCSS('box-shadow', 'none');
      expect(errors).toEqual([]);
      if (process.env.BEYONDWIN_CAPTURE_SCREENSHOTS === '1') {
        await page.screenshot({ path: `output/playwright/task12/review-${viewport.width}.png`, fullPage: true });
      }
    });

    test('valid list and search origins upgrade to bounded labels and clean safe hrefs', async ({ page }) => {
      await gotoWithStoredOrigin(page, articlePath, { kind: 'articles', anchorId: 'article-2' });
      await expect(page).toHaveURL(url(articlePath));
      await expect(page.getByRole('link', { name: '아티클 목록으로' })).toHaveAttribute('href', '/articles/#article-2');

      await gotoWithStoredOrigin(page, articlePath, { kind: 'search', query: 'AI 판단', anchorId: 'result-2' });
      await expect(page).toHaveURL(url(articlePath));
      await expect(page.getByRole('link', { name: '“AI 판단” 결과로' }))
        .toHaveAttribute('href', '/search/?q=AI+%ED%8C%90%EB%8B%A8#result-2');
    });

    test('stale origin is scrubbed and remains the direct collection fallback', async ({ page }) => {
      await gotoWithStoredOrigin(
        page,
        articlePath,
        { kind: 'articles', anchorId: 'record-articles-graphify-code-knowledge-graph-deep-dive' },
        600_001,
      );
      await expect(page).toHaveURL(url(articlePath));
      await expect(page.getByRole('link', { name: '아티클 목록으로' })).toHaveAttribute('href', '/articles/');
      expect(page.url()).not.toContain('__bw_');
    });
  });
}

test('copy-link writes the exact absolute canonical metadata on every primary detail lane', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  for (const path of [
    articlePath,
    reviewPath,
    '/thoughts/why-i-read-in-the-ai-era/',
  ]) {
    await page.goto(url(path));
    const canonical = await page.locator('link[rel="canonical"]').evaluate((link) => (
      link as HTMLLinkElement
    ).href);
    expect(canonical).toMatch(/^https:\/\//u);

    await page.getByRole('button', { name: '링크 복사' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(canonical);
  }
});

for (const flow of [
  {
    name: 'article',
    viewport: APPROVED_VIEWPORTS.desktop,
    listPath: '/articles/',
    detailPath: articlePath,
    anchorId: 'record-articles-graphify-code-knowledge-graph-deep-dive',
  },
  {
    name: 'review',
    viewport: APPROVED_VIEWPORTS.mobile390,
    listPath: '/reviews/',
    detailPath: '/reviews/siddhartha/',
    anchorId: 'record-reviews-siddhartha',
  },
] as const) {
  test(`${flow.name} native history returns to the exact anchored reading position`, async ({ page }) => {
    await page.setViewportSize(flow.viewport);
    await page.goto(url(flow.listPath));
    const row = page.locator(`#${flow.anchorId}`);
    await row.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -96));
    const before = await row.evaluate((node) => ({
      scrollY: window.scrollY,
      top: node.getBoundingClientRect().top,
    }));

    await row.getByRole('link').click();
    await expect(page).toHaveURL(url(flow.detailPath));
    await page.goBack();

    await expect(page).toHaveURL(url(flow.listPath));
    await expect(row).toBeVisible();
    const after = await row.evaluate((node) => ({
      scrollY: window.scrollY,
      top: node.getBoundingClientRect().top,
    }));
    expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);
  });
}
