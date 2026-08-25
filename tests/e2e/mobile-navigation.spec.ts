import { expect, test, type Page } from '@playwright/test';
import { APPROVED_VIEWPORTS, canonicalUrl, expectNoHorizontalOverflow } from './support';

const routes = [
  { name: 'scene', path: '/', active: '장면' },
  { name: 'article', path: '/articles/why-i-read-in-the-ai-era/', active: '글' },
  { name: 'review', path: '/reviews/black-swan/', active: '책' },
  { name: 'memory', path: '/memory/agent-harnesses-are-operating-systems/', active: null },
] as const;

function url(path: string): string {
  return canonicalUrl(path);
}

async function gotoCleanPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url(path));
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  await expectNoHorizontalOverflow(page);
}

for (const viewport of [
  APPROVED_VIEWPORTS.desktop,
  APPROVED_VIEWPORTS.mobile390,
  APPROVED_VIEWPORTS.mobile426,
]) {
  test.describe(`${viewport.width}px shared chrome`, () => {
    test.use({ viewport });

    for (const route of routes) {
      test(`${route.name} renders shared navigation`, async ({ page }) => {
        await gotoCleanPage(page, route.path);
        const navigation = page.locator('nav[aria-label="주 탐색"]');
        await expect(navigation).toHaveCount(1);
        if (viewport.width <= 720) {
          await expect(navigation).toBeHidden();
          await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible();
        } else {
          await expect(navigation).toBeVisible();
          await expect(page.getByRole('button', { name: '메뉴' })).toBeHidden();
        }
        await expect(page.getByRole('link', { name: 'beyondwin 홈' })).toBeVisible();
        if (route.active) {
          const activeLink = navigation.locator('a[aria-current="page"]');
          await expect(activeLink).toHaveCount(1);
          await expect(activeLink).toHaveText(route.active);
        } else {
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(0);
        }
        if (process.env.BEYONDWIN_CAPTURE_SCREENSHOTS === '1') {
          await page.screenshot({
            path: `output/playwright/task10/${route.name}-${viewport.width}.png`,
            fullPage: true,
          });
        }
      });
    }
  });
}

for (const viewport of [APPROVED_VIEWPORTS.mobile390, APPROVED_VIEWPORTS.mobile426]) {
  test.describe(`${viewport.width}px mobile navigation behavior`, () => {
    test.use({ viewport });

    test('closes on Escape and restores focus', async ({ page }) => {
      await page.goto(url('/'));
      const button = page.getByRole('button', { name: '메뉴' });
      const navigation = page.getByRole('navigation', { name: '주 탐색' });
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(navigation).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(navigation).toBeHidden();
      await expect(button).toBeFocused();
    });

    test('closes on an outside pointer and restores focus', async ({ page }) => {
      await page.goto(url('/'));
      const button = page.getByRole('button', { name: '메뉴' });
      await button.click();
      await page.locator('main').click({ position: { x: 2, y: 2 } });
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toBeFocused();
    });

    test('closes on current-route selection and restores focus', async ({ page }) => {
      await page.goto(url('/'));
      const button = page.getByRole('button', { name: '메뉴' });
      await button.click();
      await page.getByRole('navigation', { name: '주 탐색' }).getByRole('link', { name: '장면', exact: true }).click();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toBeFocused();
    });
  });
}

test('desktop hides the mobile button and exposes the active route', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.desktop);
  await page.goto(url('/articles/why-i-read-in-the-ai-era/'));
  await expect(page.getByRole('button', { name: '메뉴' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: '주 탐색' }).getByRole('link', { name: '글', exact: true })).toHaveAttribute('aria-current', 'page');
});
