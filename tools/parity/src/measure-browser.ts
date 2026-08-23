import { gzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import {
  VIEWPORTS,
  type BrowserMeasurement,
  type BrowserMetricValues,
  type BrowserSample,
  type OverflowEvidence,
  type ViewportName,
} from './compare-contracts.ts';

export interface BrowserMeasurementOptions {
  warmups: number;
  samples: number;
}

const DEFAULT_OPTIONS: BrowserMeasurementOptions = { warmups: 1, samples: 5 };
const PRIVATE_BOUNDARY_PATTERNS = [
  /\/Users\/[^\s"'<>]+/gu,
  /\/home\/[^\s"'<>]+/gu,
  /[A-Za-z]:\\Users\\[^\s"'<>]+/gu,
  /memory\/thoughts\/[^\s"'<>]+/gu,
];

export function findPrivateBoundaryHits(value: string): string[] {
  return [...new Set(PRIVATE_BOUNDARY_PATTERNS.flatMap((pattern) => value.match(pattern) ?? []))].sort();
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot calculate a median from zero values');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function medianAbsoluteDeviation(values: number[]): number {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function initializePerformanceObservers(): string {
  return `(() => {
    const state = { cls: 0, lcpMs: 0 };
    Object.defineProperty(window, '__bwParityPerformance', { value: state });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.lcpMs = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) state.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  })();`;
}

async function responseBodySize(page: Page): Promise<{
  jsGzipBytes: number;
  imageBytes: number;
  renderedImages: BrowserSample['renderedImages'];
}> {
  const responses = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
    const resource = entry as PerformanceResourceTiming;
    return { name: resource.name, initiatorType: resource.initiatorType };
  }));
  const imageElements = await page.evaluate(() => [...document.images]
    .filter((image) => Boolean(image.currentSrc))
    .map((image) => {
      const bounds = image.getBoundingClientRect();
      return {
        url: new URL(image.currentSrc, location.href).href,
        displayedWidth: Math.round(bounds.width),
        displayedHeight: Math.round(bounds.height),
      };
    })
    .filter((image) => image.displayedWidth > 0 && image.displayedHeight > 0));
  const resources = (await Promise.all(responses.map(async ({ name, initiatorType }) => {
    const response = await page.request.get(name).catch(() => null);
    if (!response || !response.ok()) return null;
    const body = await response.body();
    return {
      name,
      initiatorType,
      body,
      contentType: response.headers()['content-type']?.split(';', 1)[0]?.trim().toLowerCase() ?? 'unknown',
    };
  }))).filter((entry): entry is {
    name: string;
    initiatorType: string;
    body: Buffer;
    contentType: string;
  } => entry !== null);

  let jsGzipBytes = 0;
  let imageBytes = 0;
  for (const entry of resources) {
    if (entry.initiatorType === 'script') jsGzipBytes += gzipSync(entry.body, { level: 9 }).byteLength;
    if (entry.initiatorType === 'img') imageBytes += entry.body.byteLength;
  }
  const formats = new Map(resources
    .filter((entry) => entry.initiatorType === 'img')
    .map((entry) => [entry.name, entry.contentType] as const));
  const renderedImages = imageElements.map(({ url, displayedWidth, displayedHeight }) => ({
    displayedWidth,
    displayedHeight,
    format: formats.get(url) ?? (/^data:([^;,]+)/u.exec(url)?.[1]?.toLowerCase() ?? 'unknown'),
  }));
  return { jsGzipBytes, imageBytes, renderedImages };
}

async function measureSample(
  browser: Browser,
  baseUrl: string,
  route: string,
  viewport: ViewportName,
): Promise<BrowserSample> {
  const size = VIEWPORTS[viewport];
  const context = await browser.newContext({
    viewport: size,
    serviceWorkers: 'block',
  });

  try {
    await context.addInitScript({ content: initializePerformanceObservers() });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');

    const consoleErrors: string[] = [];
    const hydrationErrors: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error') consoleErrors.push(text);
      if (/hydration|did not match|server rendered html/iu.test(text)) hydrationErrors.push(text);
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
      if (/hydration|did not match|server rendered html/iu.test(error.message)) {
        hydrationErrors.push(error.message);
      }
    });

    await page.goto(new URL(route, baseUrl).href, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });

    const performanceMetrics = await page.evaluate(() => {
      const state = (window as Window & {
        __bwParityPerformance?: { cls: number; lcpMs: number };
      }).__bwParityPerformance;
      const largestPaint = performance.getEntriesByType('largest-contentful-paint').at(-1);
      return {
        cls: state?.cls ?? 0,
        lcpMs: Math.max(state?.lcpMs ?? 0, largestPaint?.startTime ?? 0),
      };
    });
    const overflow = await page.evaluate((expectedMaxWidth): OverflowEvidence => ({
      expectedMaxWidth,
      actualScrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > expectedMaxWidth,
    }), size.width);
    const content = await page.content();
    const axe = await new AxeBuilder({ page }).analyze();
    const axeSeriousOrCritical = axe.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.impact}`);
    const bytes = await responseBodySize(page);

    return {
      ...performanceMetrics,
      ...bytes,
      consoleErrors: unique(consoleErrors),
      hydrationErrors: unique(hydrationErrors),
      axeSeriousOrCritical: unique(axeSeriousOrCritical),
      overflow,
      privateBoundaryHits: findPrivateBoundaryHits(content),
    };
  } finally {
    await context.close();
  }
}

function aggregateMetric(samples: BrowserSample[], key: keyof BrowserMetricValues): number[] {
  return samples.map((sample) => sample[key]);
}

export async function measureBrowserPage(
  browser: Browser,
  baseUrl: string,
  route: string,
  viewport: ViewportName,
  options: BrowserMeasurementOptions = DEFAULT_OPTIONS,
): Promise<BrowserMeasurement> {
  if (!Number.isInteger(options.warmups) || options.warmups < 1) {
    throw new Error('At least one discarded warm-up is required');
  }
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    throw new Error('At least one browser sample is required');
  }

  for (let index = 0; index < options.warmups; index += 1) {
    await measureSample(browser, baseUrl, route, viewport);
  }

  const samples: BrowserSample[] = [];
  for (let index = 0; index < options.samples; index += 1) {
    samples.push(await measureSample(browser, baseUrl, route, viewport));
  }

  const metricKeys = ['lcpMs', 'cls', 'jsGzipBytes', 'imageBytes'] as const;
  const medianMetrics = Object.fromEntries(metricKeys.map((key) => [key, median(aggregateMetric(samples, key))]));
  const madMetrics = Object.fromEntries(metricKeys.map((key) => [
    key,
    medianAbsoluteDeviation(aggregateMetric(samples, key)),
  ]));
  const widest = samples.reduce((current, sample) => (
    sample.overflow.actualScrollWidth > current.actualScrollWidth ? sample.overflow : current
  ), samples[0].overflow);

  return {
    viewport,
    size: VIEWPORTS[viewport],
    warmupDiscarded: options.warmups,
    sampleCount: options.samples,
    samples,
    median: medianMetrics as unknown as BrowserMetricValues,
    mad: madMetrics as unknown as BrowserMetricValues,
    consoleErrors: unique(samples.flatMap((sample) => sample.consoleErrors)),
    hydrationErrors: unique(samples.flatMap((sample) => sample.hydrationErrors)),
    axeSeriousOrCritical: unique(samples.flatMap((sample) => sample.axeSeriousOrCritical)),
    overflow: widest,
    privateBoundaryHits: unique(samples.flatMap((sample) => sample.privateBoundaryHits)),
  };
}
