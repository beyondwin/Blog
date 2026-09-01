import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  APPROVED_VIEWPORTS,
  expectNoHorizontalOverflow,
  observeRuntimeIssues,
  OFFICIAL_BASE_URL,
} from './support';

const query = 'Graphify';
const resultAnchor = 'record-articles-graphify-code-knowledge-graph-deep-dive';
const detailPath = '/articles/graphify-code-knowledge-graph-deep-dive/';
function localUrl(path: string): string {
  return new URL(path, OFFICIAL_BASE_URL).href;
}

test('desktop search opens on the question-led composer without a discovery-card grid', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.desktop);
  const runtimeIssues = observeRuntimeIssues(page);
  await page.goto('/search/');

  await expect(page.getByRole('heading', { level: 1, name: '공개 기록에 무엇을 묻고 싶나요?' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: '기록에 묻기' })).toHaveAttribute('maxlength', '120');
  await expect(page.locator('.search-discovery-card, .search-keywords')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(runtimeIssues).toEqual([]);

  const accessibility = await new AxeBuilder({ page }).include('.second-brain-search').analyze();
  expect(accessibility.violations).toEqual([]);
});

test('mobile location-restored search renders one relevance list and bounds hostile-length queries', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.mobile390);
  await page.goto(`/search/?q=${query}`);
  await expect(page.locator('.search-result-list')).toHaveCount(1);
  await expect(page.locator(`#${resultAnchor} .search-result__kind`)).toHaveText('아티클');
  await expectNoHorizontalOverflow(page);

  await page.goto('/search/?q=존재하지않는검색어');
  await expect(page.getByRole('heading', { name: '일치하는 결과가 없습니다.' })).toBeVisible();
  await expect(page.getByRole('list', { name: '추천 검색어' }).getByRole('link')).toHaveCount(8);
  await expect(page.locator('.search-discovery-card')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto(`/search/?q=${'가'.repeat(121)}`);
  await expect(page.getByRole('searchbox', { name: '기록에 묻기' })).toHaveValue('AI 시대에도 왜 계속 책을 읽나요?');
  await expect(page.locator('.search-discovery-card, .search-keywords')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('426px search returns to the same bounded query and exact result', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.mobile426);
  await page.goto(`/search/?q=${query}`);
  const input = page.getByRole('searchbox', { name: '기록에 묻기' });
  await expect(input).toHaveValue(query);
  const result = page.locator(`#${resultAnchor}`);
  await result.scrollIntoViewIfNeeded();
  const before = await result.evaluate((node) => ({
    scrollY: window.scrollY,
    top: node.getBoundingClientRect().top,
  }));

  await result.getByRole('link').click();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://form-thought.local.invalid/articles/graphify-code-knowledge-graph-deep-dive/',
  );
  expect(new URL(page.url()).pathname).toBe(detailPath);
  await page.goBack();

  await expect(page).toHaveURL(localUrl(`/search/?q=${query}`));
  await expect(input).toHaveValue(query);
  await expect(result).toBeVisible();
  const after = await result.evaluate((node) => ({
    scrollY: window.scrollY,
    top: node.getBoundingClientRect().top,
  }));
  expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);
  await expectNoHorizontalOverflow(page);
});

test('360px stale search anchor keeps its bounded query without forced scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/search/?q=${query}#record-articles-stale-anchor`);
  await expect(page.getByRole('searchbox', { name: '기록에 묻기' })).toHaveValue(query);
  await expect(page.locator(`#${resultAnchor}`)).toBeAttached();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(new URL(page.url()).searchParams.get('q')).toBe(query);
  await expectNoHorizontalOverflow(page);
});
