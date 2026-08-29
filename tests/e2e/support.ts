import { expect, type Page } from '@playwright/test';

export const OFFICIAL_BASE_URL = process.env.FORM_THOUGHT_E2E_BASE_URL ?? 'http://127.0.0.1:4391';

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

export interface FirstFrameImageFailure {
  eager: boolean;
  id: string;
  reason: 'decode-rejected' | 'natural-width' | 'timeout';
  src: string;
  visible: boolean;
}

export async function waitForFirstFrameImages(
  page: Page,
  timeoutMs = 5_000,
): Promise<FirstFrameImageFailure[]> {
  return page.evaluate(async ({ boundedTimeoutMs }) => {
    const readiness = [...document.images].map((image) => {
      const rect = image.getBoundingClientRect();
      const visible = rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth;
      const eager = image.loading === 'eager' || image.fetchPriority === 'high';
      return { eager, image, visible };
    }).filter(({ eager, visible }) => eager || visible);

    const results = await Promise.all(readiness.map(async ({ eager, image, visible }) => {
      let timer: number | undefined;
      const outcome = await Promise.race([
        Promise.resolve().then(() => image.decode()).then(
          () => 'decoded' as const,
          () => 'decode-rejected' as const,
        ),
        new Promise<'timeout'>((resolve) => {
          timer = window.setTimeout(resolve, boundedTimeoutMs, 'timeout');
        }),
      ]);
      if (timer !== undefined) window.clearTimeout(timer);
      const reason = outcome === 'decoded'
        ? image.naturalWidth > 0 ? null : 'natural-width' as const
        : outcome;
      return reason === null ? null : {
        eager,
        id: image.id,
        reason,
        src: image.currentSrc || image.src,
        visible,
      };
    }));

    return results.filter((failure): failure is NonNullable<typeof failure> => failure !== null);
  }, { boundedTimeoutMs: timeoutMs });
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
