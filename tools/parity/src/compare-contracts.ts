import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  QualityMetric,
  RendererSelectionCandidate,
  RendererSelectionReport,
} from './select-renderer.ts';

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
    displayedWidth: number;
    displayedHeight: number;
    format: string;
  }>;
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
  overflow: OverflowEvidence;
  privateBoundaryHits: string[];
}

export interface RendererRouteCapture {
  path: DecisionRoute;
  contract: StableRouteContract;
  measurements: BrowserMeasurement[];
}

export interface RendererCaptureReport {
  version: 1;
  renderer: RendererName;
  measuredAt: string;
  captureProtocol: {
    decisionRoutes: DecisionRoute[];
    viewports: typeof VIEWPORTS;
    warmups: 1;
    samplesPerRouteViewport: 5;
    freshBrowserContextPerSample: true;
    emptyHttpCachePerSample: true;
  };
  browser: {
    package: '@playwright/test';
    packageVersion: string;
    chromiumVersion: string;
    chromiumRevision: string;
  };
  artifactHash: string;
  build: {
    samples: Array<{ durationMs: number; artifactHash: string }>;
    medianDurationMs: number;
    madDurationMs: number;
    reproducible: boolean;
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

  if (actual.median.cls > MANDATORY_BUDGETS.clsMax) {
    failures.push(failure(renderer, route, viewport, 'cls', `<=${MANDATORY_BUDGETS.clsMax}`, actual.median.cls));
  }

  const lcpMaximum = expected.median.lcpMs * MANDATORY_BUDGETS.lcpAstroMultiplier;
  if (actual.median.lcpMs > lcpMaximum) {
    failures.push(failure(renderer, route, viewport, 'lcp-ms', `<=${lcpMaximum}`, actual.median.lcpMs));
  }

  if (route !== '/' && actual.median.jsGzipBytes > MANDATORY_BUDGETS.detailInitialJsGzipBytesMax) {
    failures.push(failure(
      renderer,
      route,
      viewport,
      'initial-js-gzip-bytes',
      `<=${MANDATORY_BUDGETS.detailInitialJsGzipBytesMax}`,
      actual.median.jsGzipBytes,
    ));
  }

  const zeroIssueMetrics = [
    ['console-errors', actual.consoleErrors],
    ['hydration-errors', actual.hydrationErrors],
    ['axe-serious-critical', actual.axeSeriousOrCritical],
    ['private-path-leak', actual.privateBoundaryHits],
  ] as const;
  for (const [metric, issues] of zeroIssueMetrics) {
    if (issues.length > 0) {
      failures.push(failure(renderer, route, viewport, metric, 0, issues.length));
      if (metric === 'private-path-leak') {
        failures[failures.length - 1] += ` evidence=${actualValue(issues)}`;
      }
    }
  }

  if (actual.overflow.overflow) {
    failures.push(failure(
      renderer,
      route,
      viewport,
      'viewport-overflow',
      actual.overflow.expectedMaxWidth,
      actual.overflow.actualScrollWidth,
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
  const expectedCaptureProtocol = {
    decisionRoutes: [...DECISION_ROUTES],
    viewports: VIEWPORTS,
    warmups: 1,
    samplesPerRouteViewport: 5,
    freshBrowserContextPerSample: true,
    emptyHttpCachePerSample: true,
  };

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
  if (candidate.build.samples.length !== 3 || !candidate.build.reproducible || new Set(buildHashes).size !== 1) {
    failures.push(failure(
      candidate.renderer,
      '/',
      'desktop',
      'build-reproducibility',
      '3 identical artifact hashes',
      { sampleCount: candidate.build.samples.length, reproducible: candidate.build.reproducible, buildHashes },
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
        median: report.build.medianDurationMs,
        mad: report.build.madDurationMs,
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
  const nextComparison = compareRendererContracts(baseline, next);
  const reactRouterComparison = compareRendererContracts(baseline, reactRouter);
  return {
    version: 1,
    synthetic: false,
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

async function readCapture(path: string): Promise<RendererCaptureReport> {
  return JSON.parse(await readFile(path, 'utf8')) as RendererCaptureReport;
}

export async function runComparisonCli(argv: string[]): Promise<string> {
  const paths = cliArguments(argv);
  const report = buildRendererSelectionReport(
    await readCapture(paths.baseline),
    await readCapture(paths.next),
    await readCapture(paths.reactRouter),
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
