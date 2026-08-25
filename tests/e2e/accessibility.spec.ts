import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  APPROVED_VIEWPORTS,
  canonicalUrl,
  expectNoHorizontalOverflow,
  observeRuntimeIssues,
} from './support';

for (const entry of [
  { name: 'scene desktop', viewport: APPROVED_VIEWPORTS.desktop, path: '/' },
  { name: 'article mobile', viewport: APPROVED_VIEWPORTS.mobile390, path: '/articles/why-i-read-in-the-ai-era/' },
  { name: 'search wide mobile', viewport: APPROVED_VIEWPORTS.mobile426, path: '/search/?q=Graphify' },
] as const) {
  test(`${entry.name} has clean runtime, keyboard focus, serious/critical axe, images, boundary, and overflow`, async ({ page }) => {
    await page.setViewportSize(entry.viewport);
    const runtimeIssues = observeRuntimeIssues(page);
    await page.goto(canonicalUrl(entry.path));
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

test('426px reduced motion starts no geometry or view-transition animation', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.mobile426);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const calls = { animate: 0, viewTransition: 0 };
    Object.defineProperty(window, '__task14MotionCalls', { value: calls });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      calls.animate += 1;
      return animate.apply(this, args);
    };
    if ('startViewTransition' in document) {
      const transition = document.startViewTransition.bind(document);
      document.startViewTransition = ((update) => {
        calls.viewTransition += 1;
        return transition(update);
      }) as typeof document.startViewTransition;
    }
  });
  await page.goto(canonicalUrl('/'));
  await page.locator('[data-scene-object="reading-desk-cobalt"]').click();
  await expect(page.getByRole('link', { name: '글 읽기' })).toBeFocused();
  expect(await page.evaluate(() => (
    window as typeof window & { __task14MotionCalls: { animate: number; viewTransition: number } }
  ).__task14MotionCalls)).toEqual({ animate: 0, viewTransition: 0 });
});
