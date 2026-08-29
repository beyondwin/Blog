import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from './support';

const ROUTES = [
  { name: 'home', path: '/', active: null },
  { name: 'review index', path: '/reviews/', active: '서평' },
  { name: 'review detail', path: '/reviews/black-swan/', active: '서평' },
  { name: 'article index', path: '/articles/', active: '아티클' },
  {
    name: 'article detail',
    path: '/articles/graphify-code-knowledge-graph-deep-dive/',
    active: '아티클',
  },
  { name: 'thought index', path: '/thoughts/', active: '생각' },
  { name: 'thought detail', path: '/thoughts/why-i-read-in-the-ai-era/', active: '생각' },
  { name: 'search', path: '/search/', active: '검색' },
] as const;
const PRIMARY_LABELS = ['서평', '아티클', '생각', '검색'] as const;

async function gotoCleanPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  await expectNoHorizontalOverflow(page);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 844 },
] as const) {
  test.describe(`${viewport.width}px FORM & THOUGHT chrome`, () => {
    test.use({ viewport });

    for (const route of ROUTES) {
      test(`${route.name} renders the approved shared navigation`, async ({ page }) => {
        await gotoCleanPage(page, route.path);
        const navigation = page.locator('nav.primary-navigation');
        await expect(navigation).toHaveCount(1);
        const menuButton = page.getByRole('button', { name: '메뉴 열기' });
        await expect(page.getByRole('link', { name: 'FORM & THOUGHT 홈' })).toBeVisible();
        if (viewport.width < 768) {
          await expect(navigation).toBeHidden();
          await expect(menuButton).toBeVisible();
        } else {
          await expect(navigation).toBeVisible();
          await expect(menuButton).toBeVisible();
          await menuButton.click();
          await expect(page.getByRole('navigation', { name: '메뉴 탐색' })).toBeVisible();
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await page.keyboard.press('Escape');
        }
        expect(await navigation.locator('a').allTextContents()).toEqual(PRIMARY_LABELS);
        if (route.active) {
          await expect(navigation.locator('a[aria-current="page"]')).toHaveText(route.active);
        } else {
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(0);
        }
      });
    }
  });
}

test.describe('390px modal navigation behavior', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens as a modal, contains focus, closes on Escape, and restores focus', async ({ page }) => {
    await page.goto('/articles/');
    const button = page.locator('button[aria-controls="site-navigation-menu"]');
    await button.click();
    const dialog = page.getByRole('dialog', { name: '주 탐색 메뉴' });
    await expect(dialog).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('link', { name: '검색' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('link', { name: '서평' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('closes on an outside pointer and restores focus', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: '메뉴 열기' });
    await button.click();
    await page.locator('.navigation-backdrop').click({ position: { x: 2, y: 2 }, force: true });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('keeps the canonical current route in the modal menu', async ({ page }) => {
    await page.goto('/articles/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const menu = page.getByRole('navigation', { name: '메뉴 탐색' });
    await expect(menu.locator('a[aria-current="page"]')).toHaveText('아티클');
    expect(await menu.getByRole('link').allTextContents()).toEqual(PRIMARY_LABELS);
  });
});
