import { expect, test, type Page } from '@playwright/test';

const baseUrl = process.env.BEYONDWIN_E2E_BASE_URL ?? 'http://127.0.0.1:4392';
const articlePath = '/articles/why-i-read-in-the-ai-era/';
const textOnlyArticlePath = '/articles/ai-design-references/';
const reviewPath = '/reviews/black-swan/';

function url(path: string): string {
  return new URL(path, baseUrl).href;
}

async function expectCleanReadingPage(page: Page, path: string, errors: string[]) {
  await expect(page).toHaveURL(url(path));
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
  | { kind: 'scene'; focusId: string }
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
  const destination = new URL(path, baseUrl);
  destination.searchParams.set('__bw_from', origin.kind);
  if (origin.kind === 'scene') destination.searchParams.set('__bw_focus', origin.focusId);
  if (origin.kind === 'articles' || origin.kind === 'search') {
    destination.searchParams.set('__bw_anchor', origin.anchorId);
  }
  if (origin.kind === 'search') destination.searchParams.set('__bw_query', origin.query);
  destination.searchParams.set('__bw_token', token);
  await page.goto(destination.href);
  await page.waitForLoadState('networkidle');
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px quiet reading`, () => {
    test.use({ viewport });

    test('direct article is text-only when no threshold media resolves and keeps the reading measure', async ({ page }) => {
      const errors = await gotoReadingPage(page, textOnlyArticlePath);
      await expect(page.getByRole('link', { name: '글 목록으로' })).toHaveAttribute('href', '/articles/');
      await expect(page.locator('.reading-threshold img')).toHaveCount(0);
      await expect(page.locator('.reading-threshold__marker')).toHaveCount(1);
      const metrics = await page.locator('.reading-detail__body .prose').evaluate((node) => {
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

    test('direct review renders the resolved cover as the only shadowed object', async ({ page }) => {
      const errors = await gotoReadingPage(page, reviewPath);
      await expect(page.getByRole('link', { name: '책 목록으로' })).toHaveAttribute('href', '/reviews/');
      const cover = page.locator('.reading-threshold__media-image--review');
      await expect(cover).toHaveCount(1);
      expect(await cover.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none');
      await expect(page.locator('.reading-sheet')).toHaveCSS('box-shadow', 'none');
      expect(errors).toEqual([]);
      if (process.env.BEYONDWIN_CAPTURE_SCREENSHOTS === '1') {
        await page.screenshot({ path: `output/playwright/task12/review-${viewport.width}.png`, fullPage: true });
      }
    });

    test('valid list and search origins upgrade to bounded labels and clean safe hrefs', async ({ page }) => {
      await gotoWithStoredOrigin(page, articlePath, { kind: 'articles', anchorId: 'article-2' });
      await expect(page).toHaveURL(url(articlePath));
      await expect(page.getByRole('link', { name: '글 목록으로' })).toHaveAttribute('href', '/articles/#article-2');

      await gotoWithStoredOrigin(page, articlePath, { kind: 'search', query: 'AI 판단', anchorId: 'result-2' });
      await expect(page).toHaveURL(url(articlePath));
      await expect(page.getByRole('link', { name: '“AI 판단” 결과로' }))
        .toHaveAttribute('href', '/search/?q=AI+%ED%8C%90%EB%8B%A8#result-2');
    });

    test('stale origin is scrubbed and remains the direct collection fallback', async ({ page }) => {
      await gotoWithStoredOrigin(
        page,
        articlePath,
        { kind: 'scene', focusId: 'reading-desk-cobalt' },
        600_001,
      );
      await expect(page).toHaveURL(url(articlePath));
      await expect(page.getByRole('link', { name: '글 목록으로' })).toHaveAttribute('href', '/articles/');
      expect(page.url()).not.toContain('__bw_');
    });
  });
}

test('eligible scene origin returns through browser history and keeps clean continuation anchors', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url('/'));
  await page.locator('[data-scene-object="reading-desk-cobalt"]').click();
  await expect(page).toHaveURL(/\?focus=reading-desk-cobalt$/u);
  await page.getByRole('link', { name: '글 읽기' }).click();
  await expect(page).toHaveURL(url(articlePath));
  const contextualReturn = page.getByRole('link', { name: '장면으로 돌아가기' });
  await expect(contextualReturn).toHaveAttribute('href', '/?focus=reading-desk-cobalt');
  await contextualReturn.focus();
  await expect(contextualReturn).toBeFocused();
  await expect(contextualReturn).toHaveCSS('outline-color', 'rgb(43, 99, 232)');
  await expect(page.locator('.continue-reading li')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '글 전체 보기' })).toHaveAttribute('href', '/articles/');
  expect(await page.getByRole('link', { name: '글 전체 보기' }).getAttribute('href')).not.toContain('__bw_');
  await contextualReturn.click();
  await expect(page).toHaveURL(/\?focus=reading-desk-cobalt$/u);
});
