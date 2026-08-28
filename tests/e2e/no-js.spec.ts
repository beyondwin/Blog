import { expect, test, type Browser } from '@playwright/test';
import { expectNoHorizontalOverflow } from './support';

const BASE_URL = 'http://127.0.0.1:4397';
const PRIMARY_HREFS = ['/reviews/', '/articles/', '/thoughts/', '/search/'] as const;

async function noJsPage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport, baseURL: BASE_URL });
  return { context, page: await context.newPage() };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px no-JS Home keeps real editorial selections and canonical navigation`, async ({ browser }) => {
    const { context, page } = await noJsPage(browser, viewport);
    try {
      await page.goto('/');
      const hero = page.getByRole('link', { name: /이 글 읽기/u });
      await expect(hero).toHaveAttribute('href', '/articles/graphify-code-knowledge-graph-deep-dive/');
      await expect(page.getByRole('list', { name: '편집 선택' }).getByRole('link')).toHaveCount(3);
      const fallbackNavigation = viewport.width < 768
        ? page.getByRole('navigation', { name: '모바일 주 탐색' })
        : page.getByRole('navigation', { name: '주 탐색' });
      expect(await fallbackNavigation.getByRole('link').evaluateAll((links) => (
        links.map((link) => link.getAttribute('href'))
      ))).toEqual(PRIMARY_HREFS);
      await hero.click();
      await expect(page).toHaveURL(`${BASE_URL}/articles/graphify-code-knowledge-graph-deep-dive/`);
      await expect(page.getByRole('link', { name: '아티클 전체 보기' })).toHaveAttribute('href', '/articles/');
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });
}

for (const viewport of [{ width: 768, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px no-JS article ledger and detail fallback remain canonical`, async ({ browser }) => {
    const { context, page } = await noJsPage(browser, viewport);
    try {
      await page.goto('/articles/');
      await expect(page.locator('.article-topic-filter a')).toHaveCount(6);
      await expect(page.locator('.article-index__ledger > li')).toHaveCount(17);
      const link = page.locator('#record-articles-graphify-code-knowledge-graph-deep-dive').getByRole('link');
      await expect(link).toHaveAttribute('href', '/articles/graphify-code-knowledge-graph-deep-dive/');
      await link.click();
      await expect(page).toHaveURL(`${BASE_URL}/articles/graphify-code-knowledge-graph-deep-dive/`);
      await expect(page.getByRole('link', { name: '아티클 전체 보기' })).toHaveAttribute('href', '/articles/');
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px no-JS search submits a canonical GET URL while static discovery remains readable`, async ({ browser }) => {
    const { context, page } = await noJsPage(browser, viewport);
    try {
      await page.goto('/search/');
      const form = page.getByRole('search');
      const discovery = page.getByRole('list', { name: '검색 탐색' });
      await expect(form).toHaveAttribute('action', '/search/');
      await expect(form).toHaveAttribute('method', 'get');
      await expect(page.getByRole('searchbox', { name: '검색어' })).toHaveAttribute('maxlength', '120');
      await expect(discovery.getByRole('link')).toHaveCount(3);
      await page.getByRole('searchbox', { name: '검색어' }).fill('Graphify');
      await page.getByRole('button', { name: '검색' }).click();
      await expect(page).toHaveURL(`${BASE_URL}/search/?q=Graphify`);
      await expect(page.getByRole('heading', { level: 1, name: '검색' })).toBeVisible();
      await expect(page.getByRole('search')).toBeVisible();
      await expect(page.getByRole('searchbox', { name: '검색어' })).toHaveValue('');
      await expect(discovery).toBeVisible();
      await expect(discovery.getByRole('link')).toHaveCount(3);
      await expect(page.locator('.search-result-list')).toHaveCount(0);
      await expect(page.locator('.search-page [hidden]')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });
}
