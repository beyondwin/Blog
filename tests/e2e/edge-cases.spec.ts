import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { APPROVED_VIEWPORTS, canonicalUrl, expectNoHorizontalOverflow } from './support';

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(`../fixtures/public/${name}`, import.meta.url), 'utf8')) as T;
}

test('360px test-only settled-DOM long title mutation remains truthful and contained', async ({ page }) => {
  const value = await fixture<{ route: string; testTitle: string; releaseRecordModified: boolean }>('long-title-record.json');
  expect(value.releaseRecordModified).toBe(false);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(canonicalUrl(value.route));
  const title = page.locator('.editorial-detail-frame__introduction h1');
  await title.evaluate((node, text) => { node.textContent = text; }, value.testTitle);
  await expect(title).toHaveText(value.testTitle);
  expect(await title.evaluate((node) => node.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
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
