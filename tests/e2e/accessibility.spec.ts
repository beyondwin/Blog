import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, observeRuntimeIssues, waitForFirstFrameImages } from './support';

const REPRESENTATIVE_SURFACES = [
  { name: 'home desktop', viewport: { width: 1440, height: 900 }, path: '/' },
  { name: 'reviews desktop', viewport: { width: 1440, height: 900 }, path: '/reviews/' },
  { name: 'articles calibrated', viewport: { width: 1080, height: 1440 }, path: '/articles/' },
  { name: 'thoughts intermediate', viewport: { width: 768, height: 900 }, path: '/thoughts/' },
  { name: 'search mobile', viewport: { width: 390, height: 844 }, path: '/search/' },
  { name: 'article index mobile', viewport: { width: 390, height: 844 }, path: '/articles/' },
  {
    name: 'article detail calibrated',
    viewport: { width: 1120, height: 1400 },
    path: '/articles/graphify-code-knowledge-graph-deep-dive/',
  },
  { name: 'review detail intermediate', viewport: { width: 768, height: 900 }, path: '/reviews/black-swan/' },
  {
    name: 'thought detail mobile',
    viewport: { width: 390, height: 844 },
    path: '/thoughts/why-i-read-in-the-ai-era/',
  },
  { name: 'secondary memory minimum reflow', viewport: { width: 320, height: 844 }, path: '/memory/' },
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
        decoded: await Promise.race([
          (image.loading = 'eager', image.decode()).then(() => true, () => false),
          new Promise<boolean>((resolve) => setTimeout(resolve, 5_000, false)),
        ]),
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

test('first-frame readiness skips below-fold lazy images and bounds visible or eager failures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 100 });
  const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  await page.setContent(`
    <style>body { margin: 0; } img { display: block; width: 10px; height: 10px; } .spacer { height: 500px; }</style>
    <img id="visible-fail" src="${pixel}" alt="">
    <div class="spacer"></div>
    <img id="lazy-below-fold" loading="lazy" src="${pixel}" alt="">
    <img id="eager-below-fold" loading="eager" src="${pixel}" alt="">
  `);
  await page.evaluate(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__firstFrameDecodeCalls', { value: calls, configurable: true });
    HTMLImageElement.prototype.decode = function decode() {
      calls.push(this.id);
      if (this.id === 'visible-fail') return Promise.reject(new Error('visible decode failed'));
      return new Promise<void>(() => undefined);
    };
  });

  const startedAt = Date.now();
  const failures = await waitForFirstFrameImages(page, 25);
  expect(Date.now() - startedAt).toBeLessThan(500);
  expect(failures).toEqual([
    expect.objectContaining({ id: 'visible-fail', reason: 'decode-rejected', visible: true, eager: false }),
    expect.objectContaining({ id: 'eager-below-fold', reason: 'timeout', visible: false, eager: true }),
  ]);
  expect(await page.evaluate(() => (
    (window as typeof window & { __firstFrameDecodeCalls: string[] }).__firstFrameDecodeCalls
  ))).toEqual(['visible-fail', 'eager-below-fold']);
});
