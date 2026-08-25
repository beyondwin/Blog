import { describe, expect, it } from 'vitest';
import { DECISION_ROUTES } from '../tools/parity/src/compare-contracts';
import {
  PERFORMANCE_ROUTE_SELECTOR_ENV,
  selectPerformanceRoutes,
} from './e2e/performance-selection';

describe('Task 14 performance route selection', () => {
  it('keeps the no-selector command on the complete eight-cell matrix', () => {
    expect(selectPerformanceRoutes(undefined)).toEqual({
      selector: null,
      routeNames: ['home', 'article', 'review', 'memory'],
      routes: [...DECISION_ROUTES],
      exactCommand: 'PATH=/opt/homebrew/opt/node@24/bin:$PATH npx playwright test tests/e2e/performance.spec.ts --project=chromium-151',
      outputPath: 'output/playwright/task14/performance-matrix.json',
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
});
