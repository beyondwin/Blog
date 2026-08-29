import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_ROUTES,
  PERFORMANCE_ROUTE_SELECTOR_ENV,
  selectPerformanceRoutes,
} from './e2e/performance-selection';

describe('Task 14 performance route selection', () => {
  it('keeps the no-selector command on the complete sixteen-cell React-only matrix', () => {
    expect(selectPerformanceRoutes(undefined)).toEqual({
      selector: null,
      routeNames: [
        'home',
        'articles',
        'reviews',
        'thoughts',
        'search',
        'article-detail',
        'review-detail',
        'thought-detail',
      ],
      routes: [...PERFORMANCE_ROUTES],
      exactCommand: 'PATH=/opt/homebrew/opt/node@24/bin:$PATH npx playwright test tests/e2e/performance.spec.ts --project=chromium-151',
      outputPath: 'output/playwright/task14/performance-matrix.json',
    });
  });

  it('seals absolute React-only budgets before any browser capture', () => {
    expect(PERFORMANCE_BUDGETS).toEqual({
      lcpMsMax: 2_500,
      clsMax: 0.05,
      initialJsGzipBytesMax: 128 * 1024,
      fontBytesMax: 250 * 1024,
      firstFrameImageBytesMax: 512 * 1024,
    });
  });

  it('selects the allowlisted home route while retaining both protocol viewports', () => {
    expect(selectPerformanceRoutes('home')).toEqual({
      selector: 'home',
      routeNames: ['home'],
      routes: ['/'],
      exactCommand: `PATH=/opt/homebrew/opt/node@24/bin:$PATH ${PERFORMANCE_ROUTE_SELECTOR_ENV}=home npx playwright test tests/e2e/performance.spec.ts --project=chromium-151`,
      outputPath: 'output/playwright/task14/performance-home.json',
    });
  });

  it.each([
    ['', 'empty'],
    [' ', 'empty'],
    [',', 'empty'],
    ['home,', 'empty'],
    ['unknown', 'unknown'],
    ['home,home', 'duplicate'],
  ])('rejects %j as an %s selector', (selector, reason) => {
    expect(() => selectPerformanceRoutes(selector)).toThrow(reason);
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'rejects inherited Object prototype selector %j as unknown',
    (selector) => {
      expect(() => selectPerformanceRoutes(selector)).toThrow('unknown selector');
    },
  );
});
