import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type {
  QualityMetric,
  RendererSelectionCandidate,
  RendererSelectionReport,
} from './select-renderer.ts';
import { RENDERER_LAYOUTS } from './renderer-layouts.ts';

const execFileAsync = promisify(execFile);

export const DECISION_ROUTES = [
  '/',
  '/articles/why-i-read-in-the-ai-era/',
  '/reviews/black-swan/',
  '/memory/agent-harnesses-are-operating-systems/',
] as const;

export const VIEWPORTS = {
  desktop: { width: 1440, height: 960 },
  mobile: { width: 390, height: 844 },
} as const;

export const MANDATORY_BUDGETS = {
  clsMax: 0.05,
  lcpAstroMultiplier: 1.1,
  detailInitialJsGzipBytesMax: 110 * 1024,
} as const;

export const CAPTURE_PROTOCOL = {
  decisionRoutes: [...DECISION_ROUTES],
  viewports: VIEWPORTS,
  warmups: 1,
  samplesPerRouteViewport: 5,
  freshBrowserContextPerSample: true,
  emptyHttpCachePerSample: true,
  initialJavaScriptByteProtocol: 'sum-gzip-level-9-inline-and-unique-initial-executable-responses',
} as const;

export type DecisionRoute = (typeof DECISION_ROUTES)[number];
export type ViewportName = keyof typeof VIEWPORTS;
export type RendererName = 'astro' | 'next' | 'react-router';

export interface StableRouteContract {
  canonical: string;
  title: string;
  description: string;
  openGraph: Record<string, string>;
  headings: Array<{ level: number; text: string; id?: string }>;
  bodyTextHash: string;
  internalHrefs: string[];
  externalHrefs: string[];
  imageAttributes: Array<Record<string, string>>;
  stableHtmlHash: string;
}

export interface BrowserMetricValues {
  lcpMs: number;
  cls: number;
  jsGzipBytes: number;
  imageBytes: number;
}

export interface OverflowEvidence {
  expectedMaxWidth: number;
  actualScrollWidth: number;
  overflow: boolean;
}

export interface BrowserSample extends BrowserMetricValues {
  renderedImages: Array<{
    source: string;
    displayedWidth: number;
    displayedHeight: number;
    naturalWidth: number;
    naturalHeight: number;
    declaredWidth: number;
    declaredHeight: number;
    format: string;
  }>;
  imageFailures: string[];
  consoleErrors: string[];
  hydrationErrors: string[];
  axeSeriousOrCritical: string[];
  overflow: OverflowEvidence;
  privateBoundaryHits: string[];
}

export interface BrowserMeasurement {
  viewport: ViewportName;
  size: { width: number; height: number };
  warmupDiscarded: number;
  sampleCount: number;
  samples: BrowserSample[];
  median: BrowserMetricValues;
  mad: BrowserMetricValues;
  consoleErrors: string[];
  hydrationErrors: string[];
  axeSeriousOrCritical: string[];
  imageFailures: string[];
  overflow: OverflowEvidence;
  privateBoundaryHits: string[];
}

export interface RendererRouteCapture {
  path: DecisionRoute;
  contract: StableRouteContract;
  measurements: BrowserMeasurement[];
}

export interface RendererCaptureReport {
  version: 2;
  renderer: RendererName;
  provenance: {
    synthetic: boolean;
    repositoryCommit: string;
    rendererRoot: string;
    rendererManifest: string;
    rendererManifestHash: string;
    buildCommand: string;
    outputRoot: string;
    captureToolHash: string;
  };
  measuredAt: string;
  captureProtocol: {
    decisionRoutes: readonly DecisionRoute[];
    viewports: typeof VIEWPORTS;
    warmups: 1;
    samplesPerRouteViewport: 5;
    freshBrowserContextPerSample: true;
    emptyHttpCachePerSample: true;
    initialJavaScriptByteProtocol: 'sum-gzip-level-9-inline-and-unique-initial-executable-responses';
  };
  browser: {
    package: '@playwright/test';
    packageVersion: string;
    chromiumVersion: string;
    chromiumRevision: string;
  };
  artifactHash: string;
  artifactPrivateBoundaryHits: Array<{ path: string; kind: string; marker: string }>;
  build: {
    samples: Array<{ durationMs: number; artifactHash: string; cleanedPaths: string[] }>;
    medianDurationMs: number;
    madDurationMs: number;
    reproducible: boolean;
    command: string;
    workingDirectory: string;
    clean: {
      strategy: 'remove-recreate';
      paths: string[];
      beforeEachBuild: true;
    };
  };
  routes: RendererRouteCapture[];
}

export interface ContractComparisonResult {
  mandatoryPass: boolean;
  failures: string[];
}

function actualValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
}

function failure(
  renderer: RendererName,
  route: DecisionRoute,
  viewport: ViewportName,
  metric: string,
  expected: unknown,
  actual: unknown,
): string {
  return [
    `renderer=${renderer}`,
    `route=${route}`,
    `viewport=${viewport}`,
    `metric=${metric}`,
    `expected=${actualValue(expected)}`,
    `actual=${actualValue(actual)}`,
  ].join(' ');
}

function compareStaticContract(
  renderer: RendererName,
  route: DecisionRoute,
  viewport: ViewportName,
  expected: StableRouteContract,
  actual: StableRouteContract,
): string[] {
  const failures: string[] = [];
  const scalarFields = [
    'canonical',
    'title',
    'description',
    'openGraph',
    'headings',
    'bodyTextHash',
  ] as const;

  for (const field of scalarFields) {
    if (JSON.stringify(expected[field]) !== JSON.stringify(actual[field])) {
      failures.push(failure(renderer, route, viewport, field, expected[field], actual[field]));
    }
  }

  for (const href of expected.internalHrefs) {
    if (!actual.internalHrefs.includes(href)) {
      failures.push(failure(renderer, route, viewport, 'no-js-href', href, 'missing'));
    }
  }

  const unexpectedHrefs = actual.internalHrefs.filter((href) => !expected.internalHrefs.includes(href));
  for (const href of unexpectedHrefs) {
    failures.push(failure(renderer, route, viewport, 'semantic-href', 'absent', href));
  }

  for (const href of expected.externalHrefs) {
    if (!actual.externalHrefs.includes(href)) {
      failures.push(failure(renderer, route, viewport, 'provenance-href', href, 'missing'));
    }
  }

  const unexpectedExternalHrefs = actual.externalHrefs.filter((href) => !expected.externalHrefs.includes(href));
  for (const href of unexpectedExternalHrefs) {
    failures.push(failure(renderer, route, viewport, 'provenance-href', 'absent', href));
  }

  if (expected.imageAttributes.length !== actual.imageAttributes.length) {
    failures.push(failure(
      renderer,
      route,
      viewport,
      'image-count',
      expected.imageAttributes.length,
      actual.imageAttributes.length,
    ));
  }
  for (let index = 0; index < Math.min(expected.imageAttributes.length, actual.imageAttributes.length); index += 1) {
    const expectedImage = expected.imageAttributes[index];
    const actualImage = actual.imageAttributes[index];
    const expectedIdentity = {
      alt: expectedImage.alt ?? 'missing',
      width: expectedImage.width ?? 'missing',
      height: expectedImage.height ?? 'missing',
    };
    const actualIdentity = {
      alt: actualImage.alt ?? 'missing',
      width: actualImage.width ?? 'missing',
      height: actualImage.height ?? 'missing',
    };
    if (JSON.stringify(expectedIdentity) !== JSON.stringify(actualIdentity)) {
      failures.push(failure(renderer, route, viewport, 'image-dimensions', expectedIdentity, actualIdentity));
    }
    const responsiveContract = {
      src: Boolean(actualImage.src),
      srcset: Boolean(actualImage.srcset),
      sizes: Boolean(actualImage.sizes),
      alt: Object.hasOwn(actualImage, 'alt'),
      width: Boolean(actualImage.width),
      height: Boolean(actualImage.height),
    };
    if (Object.values(responsiveContract).some((present) => !present)) {
      failures.push(failure(
        renderer,
        route,
        viewport,
        'image-responsive-contract',
        { src: true, srcset: true, sizes: true, alt: true, width: true, height: true },
        responsiveContract,
      ));
    }
  }

  return failures;
}

function compareBrowserMeasurement(
  renderer: RendererName,
  route: DecisionRoute,
  expected: BrowserMeasurement,
  actual: BrowserMeasurement,
): string[] {
  const failures: string[] = [];
  const viewport = actual.viewport;
  const expectedProtocol = {
    warmupDiscarded: 1,
    sampleCount: 5,
    sampleArrayLength: 5,
    size: VIEWPORTS[viewport],
  };
  const actualProtocol = {
    warmupDiscarded: actual.warmupDiscarded,
    sampleCount: actual.sampleCount,
    sampleArrayLength: actual.samples.length,
    size: actual.size,
  };
  if (JSON.stringify(actualProtocol) !== JSON.stringify(expectedProtocol)) {
    failures.push(failure(renderer, route, viewport, 'sampling-protocol', expectedProtocol, actualProtocol));
  }

  const summarize = (measurement: BrowserMeasurement) => {
    const metricKeys = ['lcpMs', 'cls', 'jsGzipBytes', 'imageBytes'] as const;
    const summarizedMetric = (key: keyof BrowserMetricValues) => metric(
      measurement.samples.map((sample) => sample[key]),
    );
    const widest = measurement.samples.reduce<OverflowEvidence | undefined>((current, sample) => (
      !current || sample.overflow.actualScrollWidth > current.actualScrollWidth ? sample.overflow : current
    ), undefined);
    return {
      median: Object.fromEntries(metricKeys.map((key) => [key, summarizedMetric(key).median])),
      mad: Object.fromEntries(metricKeys.map((key) => [key, summarizedMetric(key).mad])),
      consoleErrors: [...new Set(measurement.samples.flatMap((sample) => sample.consoleErrors))].sort(),
      hydrationErrors: [...new Set(measurement.samples.flatMap((sample) => sample.hydrationErrors))].sort(),
      axeSeriousOrCritical: [...new Set(
        measurement.samples.flatMap((sample) => sample.axeSeriousOrCritical),
      )].sort(),
      imageFailures: [...new Set(measurement.samples.flatMap((sample) => sample.imageFailures))].sort(),
      overflow: widest,
      privateBoundaryHits: [...new Set(
        measurement.samples.flatMap((sample) => sample.privateBoundaryHits),
      )].sort(),
    };
  };
  if (actual.samples.length === 0 || expected.samples.length === 0) return failures;
  const actualDerived = summarize(actual);
  const expectedDerived = summarize(expected);
  const actualStored = {
    median: actual.median,
    mad: actual.mad,
    consoleErrors: actual.consoleErrors,
    hydrationErrors: actual.hydrationErrors,
    axeSeriousOrCritical: actual.axeSeriousOrCritical,
    imageFailures: actual.imageFailures,
    overflow: actual.overflow,
    privateBoundaryHits: actual.privateBoundaryHits,
  };
  const expectedStored = {
    median: expected.median,
    mad: expected.mad,
    consoleErrors: expected.consoleErrors,
    hydrationErrors: expected.hydrationErrors,
    axeSeriousOrCritical: expected.axeSeriousOrCritical,
    imageFailures: expected.imageFailures,
    overflow: expected.overflow,
    privateBoundaryHits: expected.privateBoundaryHits,
  };
  if (JSON.stringify(actualStored) !== JSON.stringify(actualDerived)) {
    failures.push(failure(renderer, route, viewport, 'measurement-summary', actualDerived, actualStored));
  }
  if (JSON.stringify(expectedStored) !== JSON.stringify(expectedDerived)) {
    failures.push(failure(renderer, route, viewport, 'baseline-measurement-summary', expectedDerived, expectedStored));
  }

  if (actualDerived.median.cls > MANDATORY_BUDGETS.clsMax) {
    failures.push(failure(
      renderer,
      route,
      viewport,
      'cls',
      `<=${MANDATORY_BUDGETS.clsMax}`,
      actualDerived.median.cls,
    ));
  }

  const lcpMaximum = expectedDerived.median.lcpMs * MANDATORY_BUDGETS.lcpAstroMultiplier;
  if (actualDerived.median.lcpMs > lcpMaximum) {
    failures.push(failure(renderer, route, viewport, 'lcp-ms', `<=${lcpMaximum}`, actualDerived.median.lcpMs));
  }

  if (route !== '/' && actualDerived.median.jsGzipBytes > MANDATORY_BUDGETS.detailInitialJsGzipBytesMax) {
    failures.push(failure(
      renderer,
      route,
      viewport,
      'initial-js-gzip-bytes',
      `<=${MANDATORY_BUDGETS.detailInitialJsGzipBytesMax}`,
      actualDerived.median.jsGzipBytes,
    ));
  }

  const zeroIssueMetrics = [
    ['console-errors', actualDerived.consoleErrors],
    ['hydration-errors', actualDerived.hydrationErrors],
    ['axe-serious-critical', actualDerived.axeSeriousOrCritical],
    ['image-failures', actualDerived.imageFailures],
    ['private-path-leak', actualDerived.privateBoundaryHits],
  ] as const;
  for (const [metric, issues] of zeroIssueMetrics) {
    if (issues.length > 0) {
      failures.push(failure(renderer, route, viewport, metric, 0, issues.length));
      if (metric === 'private-path-leak') {
        failures[failures.length - 1] += ` evidence=${actualValue(issues)}`;
      }
    }
  }

  if (actualDerived.overflow?.overflow) {
    failures.push(failure(
      renderer,
      route,
      viewport,
      'viewport-overflow',
      actualDerived.overflow.expectedMaxWidth,
      actualDerived.overflow.actualScrollWidth,
    ));
  }

  return failures;
}

export function compareRendererContracts(
  baseline: RendererCaptureReport,
  candidate: RendererCaptureReport,
): ContractComparisonResult {
  const failures: string[] = [];
  const baselineByPath = new Map(baseline.routes.map((route) => [route.path, route]));
  const candidateByPath = new Map(candidate.routes.map((route) => [route.path, route]));
  const expectedCaptureProtocol = CAPTURE_PROTOCOL;

  if (JSON.stringify(candidate.captureProtocol) !== JSON.stringify(expectedCaptureProtocol)) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'capture-protocol',
      expectedCaptureProtocol,
      candidate.captureProtocol,
    ));
  }
  if (candidate.browser.chromiumVersion !== baseline.browser.chromiumVersion) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'chromium-version',
      baseline.browser.chromiumVersion,
      candidate.browser.chromiumVersion,
    ));
  }
  if (candidate.browser.chromiumRevision !== baseline.browser.chromiumRevision) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'chromium-revision',
      baseline.browser.chromiumRevision,
      candidate.browser.chromiumRevision,
    ));
  }
  if (candidate.browser.packageVersion !== baseline.browser.packageVersion) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'playwright-version',
      baseline.browser.packageVersion,
      candidate.browser.packageVersion,
    ));
  }
  const buildHashes = candidate.build.samples.map((sample) => sample.artifactHash);
  const buildDurations = candidate.build.samples.map((sample) => sample.durationMs);
  const derivedBuildMetric = buildDurations.length > 0 ? metric(buildDurations) : null;
  const derivedReproducible = buildHashes.length === 3 && new Set(buildHashes).size === 1;
  if (derivedBuildMetric && (
    candidate.build.medianDurationMs !== derivedBuildMetric.median
    || candidate.build.madDurationMs !== derivedBuildMetric.mad
    || candidate.build.reproducible !== derivedReproducible
  )) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'build-summary',
      { ...derivedBuildMetric, reproducible: derivedReproducible },
      {
        median: candidate.build.medianDurationMs,
        mad: candidate.build.madDurationMs,
        reproducible: candidate.build.reproducible,
      },
    ));
  }
  if (candidate.build.samples.length !== 3 || !derivedReproducible) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'build-reproducibility',
      '3 identical artifact hashes',
      { sampleCount: candidate.build.samples.length, reproducible: derivedReproducible, buildHashes },
    ));
  }
  if (candidate.artifactPrivateBoundaryHits.length > 0) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'artifact-private-boundary',
      0,
      candidate.artifactPrivateBoundaryHits,
    ));
  }

  for (const route of DECISION_ROUTES) {
    const expectedRoute = baselineByPath.get(route);
    const actualRoute = candidateByPath.get(route);

    for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
      if (!expectedRoute || !actualRoute) {
        failures.push(failure(
          candidate.renderer,
          route,
          viewport,
          'route',
          expectedRoute ? 'present' : 'baseline-present',
          actualRoute ? 'present' : 'missing',
        ));
        continue;
      }

      failures.push(...compareStaticContract(
        candidate.renderer,
        route,
        viewport,
        expectedRoute.contract,
        actualRoute.contract,
      ));

      const expectedMeasurement = expectedRoute.measurements.find((entry) => entry.viewport === viewport);
      const actualMeasurement = actualRoute.measurements.find((entry) => entry.viewport === viewport);
      if (!expectedMeasurement || !actualMeasurement) {
        failures.push(failure(
          candidate.renderer,
          route,
          viewport,
          'browser-measurement',
          'present',
          actualMeasurement ? 'present' : 'missing',
        ));
        continue;
      }

      failures.push(...compareBrowserMeasurement(
        candidate.renderer,
        route,
        expectedMeasurement,
        actualMeasurement,
      ));
    }
  }

  return { mandatoryPass: failures.length === 0, failures };
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error('Renderer report has no browser samples');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function metric(values: number[]): QualityMetric {
  const center = median(values);
  return {
    median: center,
    mad: median(values.map((value) => Math.abs(value - center))),
  };
}

function reportSampleValues(
  report: RendererCaptureReport,
  key: keyof BrowserMetricValues,
  aggregation: 'median' | 'sum',
): number[] {
  const measurements = report.routes.flatMap((route) => route.measurements);
  const sampleCounts = new Set(measurements.map((measurement) => measurement.samples.length));
  if (sampleCounts.size !== 1) throw new Error('Renderer measurements must use one sample count');
  const [sampleCount] = sampleCounts;
  if (!sampleCount) throw new Error('Renderer report has no browser samples');

  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const values = measurements.map((measurement) => measurement.samples[sampleIndex][key]);
    return aggregation === 'sum'
      ? values.reduce((total, value) => total + value, 0)
      : median(values);
  });
}

function selectionCandidate(
  report: RendererCaptureReport,
  mandatoryFailures: string[],
): RendererSelectionCandidate {
  if (report.renderer !== 'next' && report.renderer !== 'react-router') {
    throw new Error(`Selection candidate must be next or react-router, got ${report.renderer}`);
  }
  return {
    renderer: report.renderer,
    mandatoryFailures,
    quality: {
      lcpMs: metric(reportSampleValues(report, 'lcpMs', 'median')),
      jsGzipBytes: metric(reportSampleValues(report, 'jsGzipBytes', 'sum')),
      imageBytes: metric(reportSampleValues(report, 'imageBytes', 'sum')),
      buildDurationMs: {
        ...metric(report.build.samples.map((sample) => sample.durationMs)),
      },
    },
    buildArtifactHashes: report.build.samples.map((sample) => sample.artifactHash),
    responsiveImageContract: report.routes.flatMap((route) => route.measurements.flatMap((measurement) => {
      const contracts = measurement.samples.map((sample) => JSON.stringify(sample.renderedImages));
      if (contracts.some((contract) => contract !== contracts[0])) {
        throw new Error(`Rendered image contract varied across samples: ${route.path} ${measurement.viewport}`);
      }
      return measurement.samples[0].renderedImages.map((image) => [
        route.path,
        measurement.viewport,
        image.format,
        `${image.displayedWidth}x${image.displayedHeight}`,
      ].join(':'));
    })),
    captureEvidence: {
      provenance: report.provenance,
      artifactHash: report.artifactHash,
      browser: report.browser,
      captureProtocol: report.captureProtocol,
    },
  };
}

export function buildRendererSelectionReport(
  baseline: RendererCaptureReport,
  next: RendererCaptureReport,
  reactRouter: RendererCaptureReport,
): RendererSelectionReport {
  if (baseline.renderer !== 'astro') throw new Error(`Expected Astro baseline report, got ${baseline.renderer}`);
  if (next.renderer !== 'next') throw new Error(`Expected next candidate report, got ${next.renderer}`);
  if (reactRouter.renderer !== 'react-router') {
    throw new Error(`Expected react-router candidate report, got ${reactRouter.renderer}`);
  }
  const syntheticStates = new Set([
    baseline.provenance.synthetic,
    next.provenance.synthetic,
    reactRouter.provenance.synthetic,
  ]);
  if (syntheticStates.size !== 1) throw new Error('Cannot mix synthetic and real renderer capture reports');
  const synthetic = baseline.provenance.synthetic;
  if (!synthetic && next.artifactHash === reactRouter.artifactHash) {
    throw new Error(`Duplicate artifact presented as both candidates: ${next.artifactHash}`);
  }
  const nextComparison = compareRendererContracts(baseline, next);
  const reactRouterComparison = compareRendererContracts(baseline, reactRouter);
  return {
    version: 2,
    synthetic,
    candidates: {
      next: selectionCandidate(next, nextComparison.failures),
      reactRouter: selectionCandidate(reactRouter, reactRouterComparison.failures),
    },
  };
}

function cliArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${name ?? '<end>'}`);
    values.set(name.slice(2), value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return resolve(value);
  };
  return {
    baseline: required('baseline'),
    next: required('next'),
    reactRouter: required('react-router'),
    output: required('output'),
  };
}

type UnknownObject = Record<string, unknown>;

function strictObject(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): UnknownObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const object = value as UnknownObject;
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(object).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${path} has unknown field ${unknown[0]}`);
  const missing = required.filter((key) => !Object.hasOwn(object, key));
  if (missing.length > 0) throw new Error(`${path} is missing ${missing[0]}`);
  return object;
}

function strictArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function strictString(value: unknown, path: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || (pattern && !pattern.test(value))) {
    throw new Error(`${path} must be a valid string`);
  }
  return value;
}

function strictNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${path} must be a finite number >= ${minimum}`);
  }
  return value;
}

function strictBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`);
  return value;
}

function strictStringArray(value: unknown, path: string): string[] {
  return strictArray(value, path).map((item, index) => strictString(item, `${path}[${index}]`));
}

function strictStringRecord(value: unknown, path: string): void {
  const object = strictObject(value, path, [], Object.keys((value ?? {}) as UnknownObject));
  for (const [key, child] of Object.entries(object)) strictString(child, `${path}.${key}`);
}

function validateMetricValues(value: unknown, path: string, exact = true): void {
  const metric = exact
    ? strictObject(value, path, ['lcpMs', 'cls', 'jsGzipBytes', 'imageBytes'])
    : value as UnknownObject;
  for (const key of ['lcpMs', 'cls', 'jsGzipBytes', 'imageBytes']) strictNumber(metric[key], `${path}.${key}`);
}

function validateOverflow(value: unknown, path: string): void {
  const overflow = strictObject(value, path, ['expectedMaxWidth', 'actualScrollWidth', 'overflow']);
  strictNumber(overflow.expectedMaxWidth, `${path}.expectedMaxWidth`, 1);
  strictNumber(overflow.actualScrollWidth, `${path}.actualScrollWidth`, 1);
  strictBoolean(overflow.overflow, `${path}.overflow`);
}

function validateBrowserSample(value: unknown, path: string): void {
  const sample = strictObject(value, path, [
    'lcpMs', 'cls', 'jsGzipBytes', 'imageBytes', 'renderedImages', 'imageFailures',
    'consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'overflow', 'privateBoundaryHits',
  ]);
  validateMetricValues(sample, path, false);
  strictStringArray(sample.imageFailures, `${path}.imageFailures`);
  strictStringArray(sample.consoleErrors, `${path}.consoleErrors`);
  strictStringArray(sample.hydrationErrors, `${path}.hydrationErrors`);
  strictStringArray(sample.axeSeriousOrCritical, `${path}.axeSeriousOrCritical`);
  strictStringArray(sample.privateBoundaryHits, `${path}.privateBoundaryHits`);
  validateOverflow(sample.overflow, `${path}.overflow`);
  strictArray(sample.renderedImages, `${path}.renderedImages`).forEach((image, index) => {
    const imagePath = `${path}.renderedImages[${index}]`;
    const evidence = strictObject(image, imagePath, [
      'source', 'displayedWidth', 'displayedHeight', 'naturalWidth', 'naturalHeight',
      'declaredWidth', 'declaredHeight', 'format',
    ]);
    strictString(evidence.source, `${imagePath}.source`);
    strictString(evidence.format, `${imagePath}.format`, /^image\/[a-z0-9.+-]+$/u);
    for (const key of [
      'displayedWidth', 'displayedHeight', 'naturalWidth', 'naturalHeight', 'declaredWidth', 'declaredHeight',
    ]) strictNumber(evidence[key], `${imagePath}.${key}`, 1);
  });
}

function validateBrowserMeasurement(value: unknown, path: string): void {
  const measurement = strictObject(value, path, [
    'viewport', 'size', 'warmupDiscarded', 'sampleCount', 'samples', 'median', 'mad',
    'consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'overflow',
    'privateBoundaryHits',
  ]);
  const viewport = strictString(measurement.viewport, `${path}.viewport`);
  if (viewport !== 'desktop' && viewport !== 'mobile') throw new Error(`${path}.viewport is invalid`);
  const size = strictObject(measurement.size, `${path}.size`, ['width', 'height']);
  strictNumber(size.width, `${path}.size.width`, 1);
  strictNumber(size.height, `${path}.size.height`, 1);
  strictNumber(measurement.warmupDiscarded, `${path}.warmupDiscarded`, 1);
  strictNumber(measurement.sampleCount, `${path}.sampleCount`, 1);
  strictArray(measurement.samples, `${path}.samples`).forEach((sample, index) => (
    validateBrowserSample(sample, `${path}.samples[${index}]`)
  ));
  validateMetricValues(measurement.median, `${path}.median`);
  validateMetricValues(measurement.mad, `${path}.mad`);
  strictStringArray(measurement.consoleErrors, `${path}.consoleErrors`);
  strictStringArray(measurement.hydrationErrors, `${path}.hydrationErrors`);
  strictStringArray(measurement.axeSeriousOrCritical, `${path}.axeSeriousOrCritical`);
  strictStringArray(measurement.imageFailures, `${path}.imageFailures`);
  strictStringArray(measurement.privateBoundaryHits, `${path}.privateBoundaryHits`);
  validateOverflow(measurement.overflow, `${path}.overflow`);
}

export function parseRendererCapture(
  value: unknown,
  options: { expectedRenderer?: RendererName; allowSynthetic?: boolean } = {},
): RendererCaptureReport {
  const root = strictObject(value, 'capture', [
    'version', 'renderer', 'provenance', 'measuredAt', 'captureProtocol', 'browser',
    'artifactHash', 'artifactPrivateBoundaryHits', 'build', 'routes',
  ]);
  if (root.version !== 2) throw new Error('capture.version must be 2');
  const renderer = strictString(root.renderer, 'capture.renderer');
  if (!['astro', 'next', 'react-router'].includes(renderer)) throw new Error('capture.renderer is invalid');
  if (options.expectedRenderer && renderer !== options.expectedRenderer) {
    throw new Error(`Expected ${options.expectedRenderer} capture, got ${renderer}`);
  }
  strictString(root.measuredAt, 'capture.measuredAt', /^\d{4}-\d{2}-\d{2}T/u);
  const provenance = strictObject(root.provenance, 'capture.provenance', [
    'synthetic', 'repositoryCommit', 'rendererRoot', 'rendererManifest', 'rendererManifestHash',
    'buildCommand', 'outputRoot', 'captureToolHash',
  ]);
  const synthetic = strictBoolean(provenance.synthetic, 'capture.provenance.synthetic');
  if (synthetic && !options.allowSynthetic) throw new Error('capture.provenance synthetic reports are not real evidence');
  strictString(provenance.repositoryCommit, 'capture.provenance.repositoryCommit', /^[a-f0-9]{40}$/u);
  for (const key of ['rendererRoot', 'rendererManifest', 'buildCommand', 'outputRoot']) {
    strictString(provenance[key], `capture.provenance.${key}`);
  }
  for (const key of ['rendererManifestHash', 'captureToolHash']) {
    strictString(provenance[key], `capture.provenance.${key}`, /^sha256:[a-f0-9]{64}$/u);
  }
  const protocol = strictObject(root.captureProtocol, 'capture.captureProtocol', [
    'decisionRoutes', 'viewports', 'warmups', 'samplesPerRouteViewport',
    'freshBrowserContextPerSample', 'emptyHttpCachePerSample', 'initialJavaScriptByteProtocol',
  ]);
  strictStringArray(protocol.decisionRoutes, 'capture.captureProtocol.decisionRoutes');
  const protocolViewports = strictObject(protocol.viewports, 'capture.captureProtocol.viewports', [
    'desktop', 'mobile',
  ]);
  for (const viewport of ['desktop', 'mobile']) {
    const size = strictObject(protocolViewports[viewport], `capture.captureProtocol.viewports.${viewport}`, [
      'width', 'height',
    ]);
    strictNumber(size.width, `capture.captureProtocol.viewports.${viewport}.width`, 1);
    strictNumber(size.height, `capture.captureProtocol.viewports.${viewport}.height`, 1);
  }
  strictNumber(protocol.warmups, 'capture.captureProtocol.warmups', 1);
  strictNumber(protocol.samplesPerRouteViewport, 'capture.captureProtocol.samplesPerRouteViewport', 1);
  strictBoolean(protocol.freshBrowserContextPerSample, 'capture.captureProtocol.freshBrowserContextPerSample');
  strictBoolean(protocol.emptyHttpCachePerSample, 'capture.captureProtocol.emptyHttpCachePerSample');
  strictString(protocol.initialJavaScriptByteProtocol, 'capture.captureProtocol.initialJavaScriptByteProtocol');
  if (JSON.stringify(protocol) !== JSON.stringify(CAPTURE_PROTOCOL)) {
    throw new Error('capture.captureProtocol does not match the accepted protocol');
  }
  const browser = strictObject(root.browser, 'capture.browser', [
    'package', 'packageVersion', 'chromiumVersion', 'chromiumRevision',
  ]);
  if (browser.package !== '@playwright/test') throw new Error('capture.browser.package is invalid');
  for (const key of ['packageVersion', 'chromiumVersion', 'chromiumRevision']) {
    strictString(browser[key], `capture.browser.${key}`);
  }
  const hashPattern = /^sha256:[a-f0-9]{64}$/u;
  strictString(root.artifactHash, 'capture.artifactHash', hashPattern);
  strictArray(root.artifactPrivateBoundaryHits, 'capture.artifactPrivateBoundaryHits').forEach((hit, index) => {
    const hitPath = `capture.artifactPrivateBoundaryHits[${index}]`;
    const evidence = strictObject(hit, hitPath, ['path', 'kind', 'marker']);
    strictString(evidence.path, `${hitPath}.path`);
    strictString(evidence.kind, `${hitPath}.kind`);
    strictString(evidence.marker, `${hitPath}.marker`);
  });
  const build = strictObject(root.build, 'capture.build', [
    'samples', 'medianDurationMs', 'madDurationMs', 'reproducible', 'command',
    'workingDirectory', 'clean',
  ]);
  strictArray(build.samples, 'capture.build.samples').forEach((sample, index) => {
    const samplePath = `capture.build.samples[${index}]`;
    const evidence = strictObject(sample, samplePath, ['durationMs', 'artifactHash', 'cleanedPaths']);
    strictNumber(evidence.durationMs, `${samplePath}.durationMs`);
    strictString(evidence.artifactHash, `${samplePath}.artifactHash`, hashPattern);
    strictStringArray(evidence.cleanedPaths, `${samplePath}.cleanedPaths`);
  });
  strictNumber(build.medianDurationMs, 'capture.build.medianDurationMs');
  strictNumber(build.madDurationMs, 'capture.build.madDurationMs');
  strictBoolean(build.reproducible, 'capture.build.reproducible');
  strictString(build.command, 'capture.build.command');
  strictString(build.workingDirectory, 'capture.build.workingDirectory');
  const clean = strictObject(build.clean, 'capture.build.clean', [
    'strategy', 'paths', 'beforeEachBuild',
  ]);
  if (clean.strategy !== 'remove-recreate' || clean.beforeEachBuild !== true) {
    throw new Error('capture.build.clean does not prove remove-recreate before every build');
  }
  strictStringArray(clean.paths, 'capture.build.clean.paths');
  strictArray(root.routes, 'capture.routes').forEach((route, routeIndex) => {
    const routePath = `capture.routes[${routeIndex}]`;
    const evidence = strictObject(route, routePath, ['path', 'contract', 'measurements']);
    strictString(evidence.path, `${routePath}.path`);
    const contract = strictObject(evidence.contract, `${routePath}.contract`, [
      'canonical', 'title', 'description', 'openGraph', 'headings', 'bodyTextHash',
      'internalHrefs', 'externalHrefs', 'imageAttributes', 'stableHtmlHash',
    ]);
    for (const key of ['canonical', 'title', 'description', 'bodyTextHash', 'stableHtmlHash']) {
      strictString(contract[key], `${routePath}.contract.${key}`);
    }
    strictStringRecord(contract.openGraph, `${routePath}.contract.openGraph`);
    strictStringArray(contract.internalHrefs, `${routePath}.contract.internalHrefs`);
    strictStringArray(contract.externalHrefs, `${routePath}.contract.externalHrefs`);
    strictArray(contract.headings, `${routePath}.contract.headings`).forEach((heading, index) => {
      const headingPath = `${routePath}.contract.headings[${index}]`;
      const item = strictObject(heading, headingPath, ['level', 'text'], ['id']);
      strictNumber(item.level, `${headingPath}.level`, 1);
      strictString(item.text, `${headingPath}.text`);
      if (item.id !== undefined) strictString(item.id, `${headingPath}.id`);
    });
    strictArray(contract.imageAttributes, `${routePath}.contract.imageAttributes`).forEach((image, index) => (
      strictStringRecord(image, `${routePath}.contract.imageAttributes[${index}]`)
    ));
    strictArray(evidence.measurements, `${routePath}.measurements`).forEach((measurement, index) => (
      validateBrowserMeasurement(measurement, `${routePath}.measurements[${index}]`)
    ));
  });

  const report = root as unknown as RendererCaptureReport;
  const expectedEvidence = RENDERER_LAYOUTS[report.renderer];
  const expectedCommand = `npm run ${expectedEvidence.buildScript}`;
  if (report.provenance.rendererRoot !== expectedEvidence.rendererRoot
    || report.provenance.rendererManifest !== expectedEvidence.rendererManifest
    || report.provenance.buildCommand !== expectedCommand
    || report.provenance.outputRoot !== expectedEvidence.outputRoot
    || report.build.command !== expectedCommand
    || report.build.workingDirectory !== expectedEvidence.rendererRoot) {
    throw new Error(`capture.provenance is not renderer-specific for ${report.renderer}`);
  }
  if (JSON.stringify(report.build.clean.paths) !== JSON.stringify(expectedEvidence.cleanRoots)) {
    throw new Error(`capture.build.clean.paths must equal canonical ${report.renderer} clean roots`);
  }
  if (report.build.samples.length !== 3) throw new Error('capture.build must contain exactly three clean samples');
  for (const sample of report.build.samples) {
    if (JSON.stringify(sample.cleanedPaths) !== JSON.stringify(report.build.clean.paths)) {
      throw new Error('capture.build sample cleaning provenance does not match the clean protocol');
    }
  }
  if (report.build.samples.at(-1)?.artifactHash !== report.artifactHash) {
    throw new Error('capture.artifactHash does not match the final clean build artifact');
  }
  const buildDurations = report.build.samples.map((sample) => sample.durationMs);
  const buildMetric = metric(buildDurations);
  const buildReproducible = new Set(report.build.samples.map((sample) => sample.artifactHash)).size === 1;
  if (report.build.medianDurationMs !== buildMetric.median
    || report.build.madDurationMs !== buildMetric.mad
    || report.build.reproducible !== buildReproducible) {
    throw new Error('capture.build stored summary does not match the raw clean samples');
  }
  if (JSON.stringify(report.routes.map((route) => route.path)) !== JSON.stringify(DECISION_ROUTES)) {
    throw new Error('capture.routes does not match the exact decision route order');
  }
  for (const route of report.routes) {
    if (JSON.stringify(route.measurements.map((measurement) => measurement.viewport)) !== JSON.stringify([
      'desktop', 'mobile',
    ])) throw new Error(`capture route ${route.path} does not contain exact viewport evidence`);
    for (const measurement of route.measurements) {
      const expectedSize = VIEWPORTS[measurement.viewport];
      if (measurement.warmupDiscarded !== 1
        || measurement.sampleCount !== 5
        || measurement.samples.length !== 5
        || JSON.stringify(measurement.size) !== JSON.stringify(expectedSize)) {
        throw new Error(`capture route ${route.path} ${measurement.viewport} must contain five cold samples`);
      }
    }
  }
  return report;
}

export async function readCaptureEvidence(
  path: string,
  expectedRenderer: RendererName,
  options: { repositoryRoot?: string; requireCommittedCleanEvidence?: boolean } = {},
): Promise<RendererCaptureReport> {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const capturePath = resolve(repositoryRoot, path);
  const captureRelative = relative(repositoryRoot, capturePath);
  if (captureRelative === '' || captureRelative === '..'
    || captureRelative.startsWith(`..${sep}`) || isAbsolute(captureRelative)) {
    throw new Error(`${expectedRenderer} capture file is outside the repository evidence root`);
  }
  const repositoryState = await lstat(repositoryRoot);
  const captureState = await lstat(capturePath);
  if (repositoryState.isSymbolicLink() || !repositoryState.isDirectory()
    || captureState.isSymbolicLink() || !captureState.isFile()) {
    throw new Error(`${expectedRenderer} capture evidence must be a real repository-contained file`);
  }
  const realRepositoryRoot = await realpath(repositoryRoot);
  const realCapturePath = await realpath(capturePath);
  const isWithinEvidenceRoot = (root: string, candidate: string): boolean => {
    const fromRoot = relative(root, candidate);
    return fromRoot === ''
      || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
  };
  const realCaptureRelative = relative(realRepositoryRoot, realCapturePath);
  if (realCaptureRelative === '' || realCaptureRelative === '..'
    || realCaptureRelative.startsWith(`..${sep}`) || isAbsolute(realCaptureRelative)) {
    throw new Error(`${expectedRenderer} capture file resolves outside the repository evidence root`);
  }
  const report = parseRendererCapture(JSON.parse(await readFile(capturePath, 'utf8')), { expectedRenderer });
  if (options.requireCommittedCleanEvidence) {
    const status = (await execFileAsync('git', [
      'status', '--porcelain=v1', '--untracked-files=all',
    ], { cwd: repositoryRoot })).stdout.trim();
    if (status) throw new Error(`Renderer selection requires a clean committed evidence tree; dirty paths:\n${status}`);
    await execFileAsync('git', ['ls-files', '--error-unmatch', '--', captureRelative], {
      cwd: repositoryRoot,
    }).catch(() => {
      throw new Error(`${expectedRenderer} capture file is not committed evidence: ${captureRelative}`);
    });
  }
  const contained = (artifactPath: string, label: string): string => {
    const resolved = resolve(repositoryRoot, artifactPath);
    const fromRoot = relative(repositoryRoot, resolved);
    if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`${label} is outside the repository evidence root`);
    }
    return resolved;
  };
  const fileHash = async (file: string): Promise<string> => (
    `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`
  );
  const rendererHarnessHash = async (): Promise<string> => {
    const hash = createHash('sha256');
    for (const harnessPath of [
      'tools/parity/src/capture-renderer.ts',
      'tools/parity/src/compare-contracts.ts',
      'tools/parity/src/measure-browser.ts',
      'tools/parity/src/renderer-layouts.ts',
      'tools/parity/src/select-renderer.ts',
      'tools/parity/src/serve-static.ts',
    ]) {
      const harnessFile = contained(harnessPath, 'Renderer harness file');
      const state = await lstat(harnessFile);
      if (state.isSymbolicLink() || !state.isFile()) {
        throw new Error(`Renderer harness file must be a real file: ${harnessPath}`);
      }
      const bytes = await readFile(harnessFile);
      hash.update(`${Buffer.byteLength(harnessPath)}:${harnessPath}:${bytes.byteLength}:`);
      hash.update(bytes);
    }
    return `sha256:${hash.digest('hex')}`;
  };
  const rendererHarnessHashAtCommit = async (commit: string): Promise<string> => {
    const hash = createHash('sha256');
    for (const harnessPath of [
      'tools/parity/src/capture-renderer.ts',
      'tools/parity/src/compare-contracts.ts',
      'tools/parity/src/measure-browser.ts',
      'tools/parity/src/renderer-layouts.ts',
      'tools/parity/src/select-renderer.ts',
      'tools/parity/src/serve-static.ts',
    ]) {
      const bytes = Buffer.from((await execFileAsync('git', [
        'show', `${commit}:${harnessPath}`,
      ], { cwd: repositoryRoot, maxBuffer: 20 * 1024 * 1024 })).stdout);
      hash.update(`${Buffer.byteLength(harnessPath)}:${harnessPath}:${bytes.byteLength}:`);
      hash.update(bytes);
    }
    return `sha256:${hash.digest('hex')}`;
  };
  const walk = async (root: string, directory = root): Promise<string[]> => {
    const files: string[] = [];
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const child = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Capture artifact may not contain symlinks: ${child}`);
      if (entry.isDirectory()) files.push(...await walk(root, child));
      if (entry.isFile()) files.push(child);
    }
    return files;
  };
  const artifactHash = async (root: string): Promise<string> => {
    const stats = await lstat(root);
    if (!stats.isDirectory()) throw new Error(`Capture output is not a directory: ${root}`);
    const hash = createHash('sha256');
    for (const file of await walk(root)) {
      const filePath = relative(root, file).split(sep).join('/');
      const bytes = await readFile(file);
      hash.update(`${Buffer.byteLength(filePath)}:${filePath}:${bytes.byteLength}:`);
      hash.update(bytes);
    }
    return `sha256:${hash.digest('hex')}`;
  };
  const manifest = contained(report.provenance.rendererManifest, 'Renderer manifest');
  const output = contained(report.provenance.outputRoot, 'Renderer output');
  const manifestState = await lstat(manifest);
  if (manifestState.isSymbolicLink() || !manifestState.isFile()) {
    throw new Error(`${expectedRenderer} renderer manifest must be a real file`);
  }
  const realManifest = await realpath(manifest);
  const realOutput = await realpath(output);
  if (!isWithinEvidenceRoot(realRepositoryRoot, realManifest)
    || !isWithinEvidenceRoot(realRepositoryRoot, realOutput)) {
    throw new Error(`${expectedRenderer} current evidence resolves outside the repository root`);
  }
  if (await fileHash(manifest) !== report.provenance.rendererManifestHash) {
    throw new Error(`${expectedRenderer} renderer manifest hash no longer matches capture evidence`);
  }
  if (await rendererHarnessHash() !== report.provenance.captureToolHash) {
    throw new Error(`${expectedRenderer} renderer harness hash no longer matches capture evidence`);
  }
  if (await artifactHash(output) !== report.artifactHash) {
    throw new Error(`${expectedRenderer} output artifact hash no longer matches capture evidence`);
  }
  await execFileAsync('git', ['cat-file', '-e', `${report.provenance.repositoryCommit}^{commit}`], {
    cwd: repositoryRoot,
  });
  await execFileAsync('git', [
    'merge-base', '--is-ancestor', report.provenance.repositoryCommit, 'HEAD',
  ], { cwd: repositoryRoot }).catch(() => {
    throw new Error(`${expectedRenderer} capture commit is not an ancestor of the current evidence tree`);
  });
  const layout = RENDERER_LAYOUTS[expectedRenderer];
  if (layout.rendererRoot !== '.') {
    await execFileAsync('git', [
      'diff', '--quiet', report.provenance.repositoryCommit, 'HEAD', '--', layout.rendererRoot,
    ], { cwd: repositoryRoot }).catch(() => {
      throw new Error(`${expectedRenderer} renderer source changed after capture; evidence is stale`);
    });
  }
  const manifestAtCommit = Buffer.from((await execFileAsync('git', [
    'show', `${report.provenance.repositoryCommit}:${report.provenance.rendererManifest}`,
  ], { cwd: repositoryRoot, maxBuffer: 20 * 1024 * 1024 })).stdout);
  const manifestCommitHash = `sha256:${createHash('sha256').update(manifestAtCommit).digest('hex')}`;
  if (manifestCommitHash !== report.provenance.rendererManifestHash) {
    throw new Error(`${expectedRenderer} renderer manifest was not captured from its recorded commit`);
  }
  if (await rendererHarnessHashAtCommit(report.provenance.repositoryCommit)
    !== report.provenance.captureToolHash) {
    throw new Error(`${expectedRenderer} renderer harness was not captured from its recorded commit`);
  }
  await execFileAsync('git', [
    'cat-file', '-e', layout.rendererRoot === '.'
      ? `${report.provenance.repositoryCommit}^{tree}`
      : `${report.provenance.repositoryCommit}:${layout.rendererRoot}`,
  ], { cwd: repositoryRoot }).catch(() => {
    throw new Error(`${expectedRenderer} renderer source root is absent from its recorded commit`);
  });
  return report;
}

export async function runComparisonCli(argv: string[]): Promise<string> {
  const paths = cliArguments(argv);
  const report = buildRendererSelectionReport(
    await readCaptureEvidence(paths.baseline, 'astro'),
    await readCaptureEvidence(paths.next, 'next'),
    await readCaptureEvidence(paths.reactRouter, 'react-router'),
  );
  await mkdir(dirname(paths.output), { recursive: true });
  await writeFile(paths.output, `${JSON.stringify(report, null, 2)}\n`);
  return paths.output;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const output = await runComparisonCli(process.argv.slice(2));
  console.log(`Wrote renderer comparison report to ${output}`);
}
