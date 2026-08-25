import { expect, test, type Browser } from '@playwright/test';
import { APPROVED_VIEWPORTS, canonicalUrl, expectNoHorizontalOverflow } from './support';

async function noJsPage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  return { context, page: await context.newPage() };
}

test('1440px no-JS scene record remains canonical and detail fallback is usable', async ({ browser }) => {
  const { context, page } = await noJsPage(browser, APPROVED_VIEWPORTS.desktop);
  try {
    await page.goto(canonicalUrl('/'));
    const link = page.locator('[data-scene-object="reading-desk-cobalt"]');
    await expect(link).toHaveAttribute('href', '/articles/why-i-read-in-the-ai-era/');
    await link.click();
    await expect(page).toHaveURL(canonicalUrl('/articles/why-i-read-in-the-ai-era/'));
    await expect(page.getByRole('link', { name: '글 목록으로' })).toHaveAttribute('href', '/articles/');
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});

for (const flow of [
  {
    viewport: APPROVED_VIEWPORTS.mobile390,
    list: '/articles/',
    row: 'record-articles-why-i-read-in-the-ai-era',
    detail: '/articles/why-i-read-in-the-ai-era/',
    fallback: '글 목록으로',
  },
  {
    viewport: APPROVED_VIEWPORTS.mobile426,
    list: '/reviews/',
    row: 'record-reviews-black-swan',
    detail: '/reviews/black-swan/',
    fallback: '책 목록으로',
  },
] as const) {
  test(`${flow.viewport.width}px no-JS collection anchor and fallback remain canonical`, async ({ browser }) => {
    const { context, page } = await noJsPage(browser, flow.viewport);
    try {
      await page.goto(canonicalUrl(flow.list));
      const link = page.locator(`#${flow.row}`).getByRole('link');
      await expect(link).toHaveAttribute('href', flow.detail);
      await link.click();
      await expect(page).toHaveURL(canonicalUrl(flow.detail));
      await expect(page.getByRole('link', { name: flow.fallback })).toHaveAttribute('href', flow.list);
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });
}
