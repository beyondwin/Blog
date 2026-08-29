import { PERFORMANCE_BUDGETS, PERFORMANCE_ROUTES } from '../../tests/e2e/performance-selection.ts';
import { median, medianAbsoluteDeviation } from '../../tests/e2e/performance-metrics.ts';

type UnknownRecord = Record<string, unknown>;
const COMMIT = /^[a-f0-9]{40}$/u;
const RELEASE = /^[a-f0-9]{64}$/u;
const METRICS = ['lcpMs', 'cls', 'initialJsGzipBytes', 'fontBytes', 'firstFrameImageBytes'] as const;
const VIEWPORTS = ['desktop', 'mobile'] as const;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as UnknownRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function emptyStrings(value: unknown, label: string): void {
  const values = array(value, label);
  if (values.some((entry) => typeof entry !== 'string') || values.length > 0) throw new Error(`${label} must contain no failures`);
}

function numeric(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number`);
  return value;
}

function exactJson(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} drifted`);
}

function values(value: unknown, label: string): Record<(typeof METRICS)[number], number> {
  const object = record(value, label);
  return Object.fromEntries(METRICS.map((metric) => [metric, numeric(object[metric], `${label}.${metric}`)])) as Record<(typeof METRICS)[number], number>;
}

export function assertReactPerformanceReceipt(input: unknown): { routeCount: 8; cellCount: 16 } {
  const root = record(input, 'performance receipt');
  if (root.version !== 3 || root.renderer !== 'react-router' || root.baseline !== null) {
    throw new Error('performance receipt must be React-only schema version 3');
  }
  if (root.productionCanonicalOrigin !== 'not_measured') throw new Error('production canonical origin must remain not_measured');
  if (!RELEASE.test(String(root.releaseId)) || !COMMIT.test(String(root.repositoryHead))) throw new Error('performance release/commit binding is invalid');
  exactJson(root.budgets, PERFORMANCE_BUDGETS, 'performance budgets');
  const protocol = record(root.protocol, 'performance protocol');
  exactJson(protocol.fullRoutes, PERFORMANCE_ROUTES, 'performance route inventory');
  exactJson(protocol.viewports, VIEWPORTS, 'performance viewports');
  if (protocol.warmups !== 1 || protocol.coldSamplesPerCell !== 5) throw new Error('performance sample protocol drifted');
  emptyStrings(root.failures, 'performance failures');
  const measurements = array(root.measurements, 'performance measurements');
  if (measurements.length !== 16) throw new Error('performance evidence requires exactly 16 route/viewport cells');
  const expectedCells = PERFORMANCE_ROUTES.flatMap((path) => VIEWPORTS.map((viewport) => `${path}|${viewport}`)).sort();
  const actualCells: string[] = [];
  for (const rawCell of measurements) {
    const cell = record(rawCell, 'performance cell');
    const path = String(cell.path);
    const viewport = String(cell.viewport);
    actualCells.push(`${path}|${viewport}`);
    const measurement = record(cell.measurement, 'performance measurement');
    if (measurement.viewport !== viewport || measurement.warmupDiscarded !== 1 || measurement.sampleCount !== 5) {
      throw new Error('performance cell protocol drifted');
    }
    const samples = array(measurement.samples, 'performance samples').map((entry) => record(entry, 'performance sample'));
    if (samples.length !== 5) throw new Error('performance evidence requires five raw samples per cell');
    const sampleValues = samples.map((sample, index) => {
      for (const key of ['consoleErrors', 'hydrationErrors', 'imageFailures', 'privateBoundaryHits']) {
        emptyStrings(sample[key], `performance sample ${index} ${key}`);
      }
      const overflow = record(sample.overflow, 'performance sample overflow');
      if (overflow.overflow !== false) throw new Error('performance sample has horizontal overflow');
      return values(sample, `performance sample ${index}`);
    });
    for (const key of ['consoleErrors', 'hydrationErrors', 'imageFailures', 'privateBoundaryHits']) {
      emptyStrings(measurement[key], `performance measurement ${key}`);
    }
    const summaryMedian = values(measurement.median, 'performance median');
    const summaryMad = values(measurement.mad, 'performance MAD');
    for (const metric of METRICS) {
      const raw = sampleValues.map((sample) => sample[metric]);
      if (summaryMedian[metric] !== median(raw)) throw new Error(`performance median ${metric} is forged`);
      if (summaryMad[metric] !== medianAbsoluteDeviation(raw)) throw new Error(`performance MAD ${metric} is forged`);
    }
    if (summaryMedian.lcpMs > PERFORMANCE_BUDGETS.lcpMsMax
      || summaryMedian.cls > PERFORMANCE_BUDGETS.clsMax
      || summaryMedian.initialJsGzipBytes > PERFORMANCE_BUDGETS.initialJsGzipBytesMax
      || summaryMedian.fontBytes > PERFORMANCE_BUDGETS.fontBytesMax
      || summaryMedian.firstFrameImageBytes > PERFORMANCE_BUDGETS.firstFrameImageBytesMax) {
      throw new Error('performance median exceeds the sealed budget');
    }
  }
  exactJson(actualCells.sort(), expectedCells, 'performance 16-cell inventory');
  return { routeCount: 8, cellCount: 16 };
}

export function assertReactPublicSiteReceipt(input: unknown): UnknownRecord {
  const root = record(input, 'public-site receipt');
  if (root.schemaVersion !== 3 || root.renderer !== 'react-router') throw new Error('public-site receipt must be React-only schema version 3');
  if (!COMMIT.test(String(root.implementationCommit)) || !RELEASE.test(String(root.releaseId))) throw new Error('public-site commit/release binding is invalid');
  if (root.routeCount !== 93) throw new Error('public-site receipt must bind the exact 93-route inventory');
  if (root.productionCanonicalOrigin !== 'not_measured' || root.productionHost !== null) throw new Error('production origin must remain unset/not_measured');
  if (root.production_cutover_authorized !== false) throw new Error('production cutover must remain unauthorized');
  emptyStrings(root.errors, 'public-site errors');
  return root;
}

export function assertReactCleanHostReceipt(input: unknown): UnknownRecord {
  const root = record(input, 'clean-host receipt');
  if (root.schemaVersion !== 3 || root.renderer !== 'react-router') throw new Error('clean-host receipt must be React-only schema version 3');
  if (!COMMIT.test(String(root.implementationCommit)) || !RELEASE.test(String(root.releaseId))) throw new Error('clean-host commit/release binding is invalid');
  if (root.routeCount !== 93 || root.smokeCount !== 93) throw new Error('clean-host receipt requires the exact 93-route smoke');
  exactJson(root.commands, [
    'npm ci',
    'npm run public-release:build',
    'npm run public-release:verify',
    'npm run site:build',
  ], 'clean-host commands');
  if (root.eligible !== true) throw new Error('clean-host receipt is not eligible');
  emptyStrings(root.errors, 'clean-host errors');
  return root;
}
