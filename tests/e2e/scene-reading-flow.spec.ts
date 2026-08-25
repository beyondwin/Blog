import { expect, test, type Browser, type Page } from '@playwright/test';

const baseUrl = process.env.BEYONDWIN_E2E_BASE_URL ?? 'http://127.0.0.1:4391';

function url(path: string): string {
  return new URL(path, baseUrl).href;
}

async function expectCleanPage(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px Storyworld continuity`, () => {
    test.use({ viewport });

    test('focuses, reads, returns through history, and restores the exact scene checkpoint', async ({ page }) => {
      await page.goto(url('/'));
      await expectCleanPage(page);
      const stage = page.locator('.scene-stage__objects');
      const object = page.locator('[data-scene-object="judgment-scale"]');
      if (viewport.width <= 720) await object.scrollIntoViewIfNeeded();
      const before = await stage.evaluate((node) => node.scrollLeft);

      await object.click();
      await expect(page).toHaveURL(/\?focus=judgment-scale$/u);
      await expect(page.getByRole('heading', { name: 'AI 시대에, 나는 왜 책을 읽는가' })).toBeVisible();
      await expect(page.getByRole('link', { name: '글 읽기' })).toBeFocused();

      if (process.env.BEYONDWIN_CAPTURE_SCREENSHOTS === '1') {
        await page.screenshot({ path: `output/playwright/task11/focus-${viewport.width}.png`, fullPage: true });
      }

      await page.getByRole('link', { name: '글 읽기' }).click();
      await expect(page).toHaveURL(/\/articles\/why-i-read-in-the-ai-era\//u);
      await page.goBack();
      await expect(page).toHaveURL(/\?focus=judgment-scale$/u);
      await page.getByRole('button', { name: '장면으로 돌아가기' }).click();
      await expect(page).toHaveURL(url('/'));
      await expect(object).toBeFocused();
      await expect.poll(() => stage.evaluate((node) => node.scrollLeft)).toBeCloseTo(before, 1);
      await expectCleanPage(page);
    });

    test('Escape returns to the triggering object', async ({ page }) => {
      await page.goto(url('/'));
      const object = page.locator('[data-scene-object="black-swan"]');
      if (viewport.width <= 720) await object.scrollIntoViewIfNeeded();
      await object.click();
      await expect(page).toHaveURL(/\?focus=black-swan$/u);
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(url('/'));
      await expect(object).toBeFocused();
    });
  });
}

async function proveNoJsAnchors(browser: Browser, width: number) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: width === 390 ? 844 : 1000 } });
  const page = await context.newPage();
  await page.goto(url('/'));
  const article = page.locator('[data-scene-object="reading-desk-cobalt"]');
  const review = page.locator('[data-scene-object="black-swan"]');
  await expect(article).toHaveAttribute('href', '/articles/why-i-read-in-the-ai-era/');
  await expect(review).toHaveAttribute('href', '/reviews/black-swan/');
  await article.click();
  await expect(page).toHaveURL(url('/articles/why-i-read-in-the-ai-era/'));
  await context.close();
}

test('1440px no-JS scene keeps canonical detail anchors', async ({ browser }) => {
  await proveNoJsAnchors(browser, 1440);
});

test('390px no-JS scene keeps canonical detail anchors', async ({ browser }) => {
  await proveNoJsAnchors(browser, 390);
});

test('390px reduced motion changes scene state without geometry animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const counters = { animate: 0, viewTransition: 0 };
    Object.defineProperty(window, '__sceneMotionCalls', { value: counters });
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      counters.animate += 1;
      return originalAnimate.apply(this, args);
    };
    if ('startViewTransition' in document) {
      const originalTransition = document.startViewTransition.bind(document);
      document.startViewTransition = ((update) => {
        counters.viewTransition += 1;
        return originalTransition(update);
      }) as typeof document.startViewTransition;
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('/'));
  await page.locator('[data-scene-object="reading-desk-cobalt"]').click();
  await expect(page.getByRole('link', { name: '글 읽기' })).toBeFocused();
  expect(await page.evaluate(() => (
    window as typeof window & { __sceneMotionCalls: { animate: number; viewTransition: number } }
  ).__sceneMotionCalls)).toEqual({ animate: 0, viewTransition: 0 });
});

test.describe('390px Storyworld focus hardening', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('deduplicates delayed focus requests and preserves the click-time viewport', async ({ page }) => {
    let releaseStyles = () => {};
    const stylesReleased = new Promise<void>((resolve) => { releaseStyles = resolve; });
    let styleRequests = 0;
    await page.route(/\/(?:assets\/scene-[^/]+|src\/ui\/styles\/scene\.css)(?:\?.*)?$/u, async (route) => {
      styleRequests += 1;
      await stylesReleased;
      await route.continue();
    });

    try {
      await page.goto(url('/'));
      const stage = page.locator('.scene-stage__objects');
      const object = page.locator('[data-scene-object="judgment-scale"]');
      await object.scrollIntoViewIfNeeded();
      const clickTimeScrollLeft = await stage.evaluate((node) => node.scrollLeft);
      const initialHistoryLength = await page.evaluate(() => history.length);

      await object.click();
      await expect.poll(() => styleRequests).toBe(1);
      await object.click({ force: true });
      await page.locator('[data-scene-object="black-swan"]').scrollIntoViewIfNeeded();
      const delayedScrollLeft = await stage.evaluate((node) => node.scrollLeft);
      expect(Math.abs(delayedScrollLeft - clickTimeScrollLeft)).toBeGreaterThan(100);
      releaseStyles();

      await expect(page).toHaveURL(/\?focus=judgment-scale$/u);
      await expect.poll(() => page.evaluate((beforeLength) => ({
        historyDelta: history.length - beforeLength,
        scrollLeft: (history.state as { bwScene?: { scrollLeft?: number } } | null)?.bwScene?.scrollLeft,
      }), initialHistoryLength)).toEqual({ historyDelta: 1, scrollLeft: clickTimeScrollLeft });
    } finally {
      releaseStyles();
    }
  });

  test('centers a direct support focus before restoring its truthful checkpoint', async ({ page }) => {
    await page.goto(url('/?focus=black-swan'));
    const stage = page.locator('.scene-stage__objects');
    const object = page.locator('[data-scene-object="black-swan"]');
    await expect(page.getByRole('link', { name: '책 읽기' })).toBeFocused();

    await page.getByRole('button', { name: '장면으로 돌아가기' }).click();
    await expect(page).toHaveURL(url('/'));
    await expect(object).toBeFocused();
    await expect(object).toBeInViewport();
    await expect.poll(() => stage.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });

  test('uses a geometry FLIP when View Transition is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
      const calls: Array<{ duration?: number; firstTransform?: string; lastTransform?: string }> = [];
      Object.defineProperty(window, '__sceneAnimations', { value: calls });
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        if ((this as HTMLElement).matches?.('[data-scene-object]')) {
          const frames = Array.isArray(keyframes) ? keyframes : [];
          const timing = typeof options === 'number' ? { duration: options } : options;
          calls.push({
            duration: typeof timing?.duration === 'number' ? timing.duration : undefined,
            firstTransform: String((frames[0] as Keyframe | undefined)?.transform),
            lastTransform: String((frames.at(-1) as Keyframe | undefined)?.transform),
          });
        }
        return originalAnimate.call(this, keyframes, options);
      };
    });
    await page.goto(url('/'));

    await page.locator('[data-scene-object="reading-desk-cobalt"]').click();
    await expect(page.getByRole('link', { name: '글 읽기' })).toBeFocused();
    expect(await page.evaluate(() => (
      window as typeof window & { __sceneAnimations: unknown[] }
    ).__sceneAnimations)).toEqual([{
      duration: 480,
      firstTransform: expect.stringMatching(/^translate\(.+px,.+px\) scale\(.+,.+\)$/u),
      lastTransform: 'none',
    }]);
  });

  test('initial CSS hides fresh-load edge echoes for the explored rail state', async ({ page }) => {
    await page.goto(url('/'));
    const scene = page.locator('.public-scene');
    const echoes = page.locator('.scene-edge-echoes');
    await expect(echoes).toHaveCSS('visibility', 'visible');

    await scene.evaluate((node) => { node.dataset.railExplored = 'true'; });
    await expect(scene).toHaveAttribute('data-rail-explored', 'true');
    await expect(echoes).toHaveCSS('visibility', 'hidden');
  });
});
