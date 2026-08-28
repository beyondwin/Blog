import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, observeRuntimeIssues } from './support';

const REPRESENTATIVE_SURFACES = [
  { name: 'home desktop', viewport: { width: 1440, height: 900 }, path: '/' },
  { name: 'article index mobile', viewport: { width: 390, height: 844 }, path: '/articles/' },
  {
    name: 'article detail intermediate',
    viewport: { width: 768, height: 900 },
    path: '/articles/graphify-code-knowledge-graph-deep-dive/',
  },
] as const;

for (const entry of REPRESENTATIVE_SURFACES) {
  test(`${entry.name} has clean runtime, visible focus, serious/critical axe, images, boundary, and overflow`, async ({ page }) => {
    await page.setViewportSize(entry.viewport);
    const runtimeIssues = observeRuntimeIssues(page);
    await page.goto(entry.path);
    await page.evaluate(() => document.fonts.ready);
    await page.keyboard.press('Tab');
    const focusEvidence = await page.locator(':focus').evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(focusEvidence.outlineStyle).not.toBe('none');
    expect(focusEvidence.outlineWidth).toBeGreaterThanOrEqual(2);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((violation) => (
      violation.impact === 'serious' || violation.impact === 'critical'
    ))).toEqual([]);
    const brokenImages = await page.evaluate(async () => (await Promise.all([...document.images]
      .filter((image) => image.getBoundingClientRect().width > 0)
      .map(async (image) => ({
        decoded: await image.decode().then(() => true, () => false),
        naturalWidth: image.naturalWidth,
        src: image.currentSrc || image.src,
      })))).filter((image) => !image.decoded || image.naturalWidth <= 0));
    expect(brokenImages).toEqual([]);
    const html = await page.content();
    expect(html).not.toMatch(/\/Users\/|\/home\/|memory\/thoughts\//u);
    expect(runtimeIssues).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
}

test('390px reduced motion leaves the representative Home surface without running animation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === 'running').length)).toBe(0);
});
