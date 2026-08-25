import { expect, type Page } from '@playwright/test';

export const OFFICIAL_BASE_URL = 'http://127.0.0.1:4391';

export const APPROVED_VIEWPORTS = {
  desktop: { width: 1440, height: 960 },
  mobile390: { width: 390, height: 844 },
  mobile426: { width: 426, height: 926 },
} as const;

export function canonicalUrl(path: string): string {
  return new URL(path, OFFICIAL_BASE_URL).href;
}

export function observeRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  return issues;
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    clientWidth: expect.any(Number),
    scrollWidth: expect.any(Number),
  }));
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);
}
