import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  APPROVED_VIEWPORTS,
  canonicalUrl,
  expectNoHorizontalOverflow,
  waitForFirstFrameImages,
} from './support';

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(`../fixtures/public/${name}`, import.meta.url), 'utf8')) as T;
}

test('320px actual longest article title remains truthful and contained', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(canonicalUrl('/articles/oh-my-pi-deep-review/'));
  const title = page.locator('.editorial-detail-frame__introduction h1');
  await expect(title).toHaveText('oh-my-pi는 진짜 쓸 만한가: 강력한 에이전트 하네스의 구조와 위험');
  expect(await title.evaluate((node) => node.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test('320px actual longest review title and HOLD cover remain text-led and contained', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(canonicalUrl('/reviews/how-adam-smith-can-change-your-life/'));
  await expect(page.locator('.review-detail__introduction h1')).toHaveText('내 안에서 나를 만드는 것들');
  await expectNoHorizontalOverflow(page);

  await page.goto(canonicalUrl('/reviews/devotion-of-suspect-x/'));
  await expect(page.locator('.review-detail')).toHaveClass(/review-detail--text-led/u);
  await expect(page.locator('.review-detail__cover-stage img')).toHaveCount(0);
  await expect(page.getByText('표지 공개 보류', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('320px prose contains real table and code overflow inside their own scroll regions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(canonicalUrl('/articles/postgresql-bm25-pg-search/'));
  await expect(page.locator('.prose table').first()).toBeAttached();
  await expect(page.locator('.prose pre').first()).toBeAttached();
  const regions = await page.locator('.prose :is(table, pre)').evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return {
      right: node.getBoundingClientRect().right,
      parentRight: node.parentElement?.getBoundingClientRect().right ?? 0,
      overflowX: style.overflowX,
    };
  }));
  expect(regions.every((region) => region.right <= region.parentRight + 1)).toBe(true);
  expect(regions.every((region) => ['auto', 'scroll'].includes(region.overflowX))).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test('failed release image remains bounded and truthfully detectable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/assets/content/**', (route) => route.abort('failed'));
  await page.goto(canonicalUrl('/articles/graphify-code-knowledge-graph-deep-dive/'));
  const image = page.locator('.editorial-detail-frame__media img');
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute('alt', /.+/u);
  expect(await waitForFirstFrameImages(page, 250)).toEqual([
    expect.objectContaining({ reason: expect.stringMatching(/decode-rejected|natural-width/u) }),
  ]);
  await expectNoHorizontalOverflow(page);
});

test('426px verified zero-relation record does not synthesize continuation items', async ({ page }) => {
  const value = await fixture<{ route: string; expectedContinuationItems: number }>('no-relations-record.json');
  await page.setViewportSize(APPROVED_VIEWPORTS.mobile426);
  await page.goto(canonicalUrl(value.route));
  await expect(page.locator('.continue-reading li')).toHaveCount(value.expectedContinuationItems);
  await expect(page.getByRole('link', { name: '아티클 전체 보기' })).toHaveAttribute('href', '/articles/');
  await expectNoHorizontalOverflow(page);
});

test('selected app has no current-parity file name, import, or selector residue', () => {
  const content = spawnSync('rg', ['-n', 'current-parity', 'apps/site'], { encoding: 'utf8' });
  expect(content.status).toBe(1);
  expect(content.stdout).toBe('');
  const files = spawnSync('rg', ['--files', 'apps/site'], { encoding: 'utf8' });
  expect(files.status).toBe(0);
  expect(files.stdout.split('\n').filter((path) => path.includes('current-parity'))).toEqual([]);
});
