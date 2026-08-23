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
  imageFailures: string[];
}> {
  const inlineScripts = await page.evaluate(() => [...document.scripts]
    .filter((script) => !script.src)
    .filter((script) => {
      const type = script.type.trim().toLowerCase();
      return type === ''
        || type === 'module'
        || type === 'text/javascript'
        || type === 'application/javascript';
    })
    .map((script) => script.textContent ?? '')
    .filter((source) => source.length > 0));
  const imageElements = await page.evaluate(async () => Promise.all([...document.images].map(async (image) => {
      const bounds = image.getBoundingClientRect();
      const displayed = bounds.width > 0 && bounds.height > 0;
      if (displayed) image.loading = 'eager';
      const decoded = !displayed || await Promise.race([
          image.decode().then(() => true, () => false),
          new Promise<boolean>((resolve) => setTimeout(resolve, 5_000, false)),
        ]);
      const candidates = [
        image.getAttribute('src'),
        ...[image.getAttribute('srcset'), ...[...(image.closest('picture')?.querySelectorAll('source') ?? [])]
          .map((source) => source.getAttribute('srcset'))]
          .filter((value): value is string => Boolean(value))
          .flatMap((value) => value.split(',').map((entry) => entry.trim().split(/\s+/u)[0])),
      ].filter((value): value is string => Boolean(value)).map((value) => {
        const url = new URL(value, location.href);
        return url.origin === location.origin ? `${url.pathname}${url.search}` : url.href;
      });
      const currentSrc = image.currentSrc || image.src;
      const currentUrl = new URL(currentSrc, location.href);
      const normalizedCurrentSrc = currentUrl.origin === location.origin
        ? `${currentUrl.pathname}${currentUrl.search}`
        : currentUrl.href;
      return {
        url: currentUrl.href,
        source: normalizedCurrentSrc,
        sourceMatched: candidates.includes(normalizedCurrentSrc),
        decoded,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        declaredWidth: Number(image.getAttribute('width') ?? 0),
        declaredHeight: Number(image.getAttribute('height') ?? 0),
        displayedWidth: Math.round(bounds.width),
        displayedHeight: Math.round(bounds.height),
      };
    })));
  const responses = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
    const resource = entry as PerformanceResourceTiming;
    return { name: resource.name, initiatorType: resource.initiatorType };
  }));
  const resourcesByName = new Map(responses.map((entry) => [entry.name, entry] as const));
  for (const image of imageElements) {
    if (image.displayedWidth > 0 && image.displayedHeight > 0 && !resourcesByName.has(image.url)) {
      resourcesByName.set(image.url, { name: image.url, initiatorType: 'img' });
    }
  }
  const resources = (await Promise.all([...resourcesByName.values()].map(async ({ name, initiatorType }) => {
    const response = await page.request.get(name).catch(() => null);
    if (!response) return null;
    const body = await response.body();
    return {
      name,
      initiatorType,
      body,
      ok: response.ok(),
      status: response.status(),
      contentType: response.headers()['content-type']?.split(';', 1)[0]?.trim().toLowerCase() ?? 'unknown',
    };
  }))).filter((entry): entry is {
    name: string;
    initiatorType: string;
    body: Buffer;
    ok: boolean;
    status: number;
    contentType: string;
  } => entry !== null);

  const executableResources = resources.filter((entry) => entry.ok && (
    entry.initiatorType === 'script'
    || /^(?:application|text)\/(?:javascript|ecmascript)$/u.test(entry.contentType)
    || entry.contentType === 'text/x-component'
    || /\.rsc(?:\?|$)/u.test(entry.name)
  ));
  const jsGzipBytes = [
    ...executableResources.map((entry) => entry.body),
    ...inlineScripts.map((source) => Buffer.from(source)),
  ].reduce((total, body) => total + gzipSync(body, { level: 9 }).byteLength, 0);
  const resourcesByUrl = new Map(resources.map((entry) => [entry.name, entry] as const));
  const imageFailures: string[] = [];
  const validVisibleImages = imageElements.flatMap((image) => {
    if (image.displayedWidth <= 0 || image.displayedHeight <= 0) return [];
    const response = resourcesByUrl.get(image.url);
    const failures = [];
    if (!response?.ok) failures.push(`response-status=${response?.status ?? 'missing'}`);
    if (!response?.contentType.startsWith('image/')) failures.push(`response-format=${response?.contentType ?? 'missing'}`);
    if (!image.decoded) failures.push('decode-failed');
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) failures.push('natural-dimensions');
    if (image.declaredWidth <= 0 || image.declaredHeight <= 0) failures.push('declared-dimensions');
    if (image.naturalWidth > 0 && image.naturalHeight > 0 && image.declaredWidth > 0 && image.declaredHeight > 0) {
      const naturalRatio = image.naturalWidth / image.naturalHeight;
      const declaredRatio = image.declaredWidth / image.declaredHeight;
      if (Math.abs(naturalRatio - declaredRatio) > 0.01) failures.push('declared-aspect-ratio');
    }
    if (!image.sourceMatched) failures.push('current-src-not-declared');
    if (failures.length > 0) {
      imageFailures.push(`${image.source} ${failures.join(',')}`);
      return [];
    }
    return [{
      source: image.source,
      displayedWidth: image.displayedWidth,
      displayedHeight: image.displayedHeight,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      declaredWidth: image.declaredWidth,
      declaredHeight: image.declaredHeight,
      format: response?.contentType ?? 'unknown',
    }];
  });
  const comparableUrls = new Set(validVisibleImages.map((image) => image.source));
  const imageBytes = [...resourcesByUrl.values()]
    .filter((entry) => comparableUrls.has(new URL(entry.name).origin === new URL(page.url()).origin
      ? `${new URL(entry.name).pathname}${new URL(entry.name).search}`
      : entry.name))
    .reduce((total, entry) => total + entry.body.byteLength, 0);
  return {
    jsGzipBytes,
    imageBytes,
    renderedImages: validVisibleImages,
    imageFailures: unique(imageFailures),
  };
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
    imageFailures: unique(samples.flatMap((sample) => sample.imageFailures)),
    overflow: widest,
    privateBoundaryHits: unique(samples.flatMap((sample) => sample.privateBoundaryHits)),
  };
}
