import { expect, test } from '@playwright/test';
import { APPROVED_VIEWPORTS, canonicalUrl, expectNoHorizontalOverflow } from './support';

const query = 'Graphify';
const resultAnchor = 'record-articles-graphify-code-knowledge-graph-deep-dive';
const detailPath = '/articles/graphify-code-knowledge-graph-deep-dive/';

test('426px search returns to the same bounded query and exact result', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.mobile426);
  await page.goto(canonicalUrl(`/search/?q=${query}`));
  const input = page.getByRole('searchbox', { name: '찾기' });
  await expect(input).toHaveValue(query);
  const result = page.locator(`#${resultAnchor}`);
  await result.scrollIntoViewIfNeeded();
  const before = await result.evaluate((node) => ({
    scrollY: window.scrollY,
    top: node.getBoundingClientRect().top,
  }));

  await result.getByRole('link').click();
  await expect(page).toHaveURL(canonicalUrl(detailPath));
  const contextualReturn = page.getByRole('link', { name: `“${query}” 결과로` });
  await expect(contextualReturn).toHaveAttribute('href', `/search/?q=${query}#${resultAnchor}`);
  await contextualReturn.click();

  await expect(page).toHaveURL(canonicalUrl(`/search/?q=${query}`));
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
  await page.goto(canonicalUrl(`/search/?q=${query}#record-articles-stale-anchor`));
  await expect(page.getByRole('searchbox', { name: '찾기' })).toHaveValue(query);
  await expect(page.locator(`#${resultAnchor}`)).toBeAttached();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(new URL(page.url()).searchParams.get('q')).toBe(query);
  await expectNoHorizontalOverflow(page);
});
