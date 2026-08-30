import { describe, expect, it } from 'vitest';
import { PERFORMANCE_BUDGETS, PERFORMANCE_ROUTES } from '../../tests/e2e/performance-selection';
import {
  assertReactCleanHostReceipt,
  assertReactPerformanceReceipt,
  assertReactPublicSiteReceipt,
} from './evidence-contracts.mts';

const COMMIT = 'a'.repeat(40);
const RELEASE = 'b'.repeat(64);

function performanceReceipt(): Record<string, unknown> {
  const sample = {
    lcpMs: 300,
    cls: 0,
    initialJsGzipBytes: 90_000,
    fontBytes: 247_368,
    firstFrameImageBytes: 200_000,
    consoleErrors: [],
    hydrationErrors: [],
    imageFailures: [],
    privateBoundaryHits: [],
    overflow: { expectedMaxWidth: 1440, actualScrollWidth: 1440, overflow: false },
  };
  return {
    version: 3,
    renderer: 'react-router',
    baseline: null,
    productionCanonicalOrigin: 'not_measured',
    releaseId: RELEASE,
    repositoryHead: COMMIT,
    selection: { selectedRoutes: PERFORMANCE_ROUTES },
    protocol: { fullRoutes: PERFORMANCE_ROUTES, viewports: ['desktop', 'mobile'], warmups: 1, coldSamplesPerCell: 5 },
    budgets: PERFORMANCE_BUDGETS,
    measurements: PERFORMANCE_ROUTES.flatMap((path) => ['desktop', 'mobile'].map((viewport) => ({
      path,
      viewport,
      measurement: {
        viewport,
        size: viewport === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
        warmupDiscarded: 1,
        sampleCount: 5,
        samples: Array.from({ length: 5 }, () => structuredClone(sample)),
        median: {
          lcpMs: 300,
          cls: 0,
          initialJsGzipBytes: 90_000,
          fontBytes: 247_368,
          firstFrameImageBytes: 200_000,
        },
        mad: { lcpMs: 0, cls: 0, initialJsGzipBytes: 0, fontBytes: 0, firstFrameImageBytes: 0 },
        consoleErrors: [],
        hydrationErrors: [],
        imageFailures: [],
        privateBoundaryHits: [],
        overflow: sample.overflow,
      },
    }))),
    failures: [],
  };
}

describe('React-only cutover evidence contracts', () => {
  it('accepts the exact 16-cell performance matrix and rejects forged aggregates or budgets', () => {
    const receipt = performanceReceipt();
    expect(assertReactPerformanceReceipt(receipt)).toMatchObject({ routeCount: 8, cellCount: 16 });
    const forgedMedian = structuredClone(receipt) as any;
    forgedMedian.measurements[0].measurement.median.lcpMs = 1;
    expect(() => assertReactPerformanceReceipt(forgedMedian)).toThrow(/median/iu);
    const forgedBudget = structuredClone(receipt) as any;
    forgedBudget.budgets.lcpMsMax = 9_999;
    expect(() => assertReactPerformanceReceipt(forgedBudget)).toThrow(/budget/iu);
  });

  it('rejects missing route cells, browser failures, and private-boundary evidence', () => {
    const missing = performanceReceipt() as any;
    missing.measurements.pop();
    expect(() => assertReactPerformanceReceipt(missing)).toThrow(/16/iu);
    const failed = performanceReceipt() as any;
    failed.failures.push('budget exceeded');
    expect(() => assertReactPerformanceReceipt(failed)).toThrow(/failure/iu);
    const privateLeak = performanceReceipt() as any;
    privateLeak.measurements[0].measurement.privateBoundaryHits.push('/Users/user/private');
    expect(() => assertReactPerformanceReceipt(privateLeak)).toThrow(/private/iu);
  });

  it('keeps public-site evidence local and production unauthorized', () => {
    const receipt = {
      schemaVersion: 3,
      renderer: 'react-router',
      implementationCommit: COMMIT,
      releaseId: RELEASE,
      routeCount: 93,
      productionCanonicalOrigin: 'not_measured',
      production_cutover_authorized: false,
      productionHost: null,
      errors: [],
    };
    expect(assertReactPublicSiteReceipt(receipt)).toEqual(receipt);
    expect(() => assertReactPublicSiteReceipt({ ...receipt, production_cutover_authorized: true }))
      .toThrow(/authorized/iu);
  });

  it('requires the exact release-derived clean-host smoke count and ordered commands', () => {
    const receipt = {
      schemaVersion: 3,
      renderer: 'react-router',
      implementationCommit: COMMIT,
      releaseId: RELEASE,
      routeCount: 93,
      smokeCount: 93,
      commands: ['npm ci', 'npm run public-release:build', 'npm run public-release:verify', 'npm run site:build'],
      eligible: true,
      errors: [],
    };
    expect(assertReactCleanHostReceipt(receipt)).toEqual(receipt);
    expect(() => assertReactCleanHostReceipt({ ...receipt, smokeCount: 80 })).toThrow(/93/iu);
    expect(() => assertReactCleanHostReceipt({ ...receipt, commands: [...receipt.commands].reverse() }))
      .toThrow(/commands/iu);
  });
});
