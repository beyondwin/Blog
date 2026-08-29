import { gzipSync } from 'node:zlib';
import type { Browser, Page } from '@playwright/test';

export const PERFORMANCE_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type PerformanceViewport = keyof typeof PERFORMANCE_VIEWPORTS;

export interface PerformanceValues {
  lcpMs: number;
  cls: number;
  initialJsGzipBytes: number;
  fontBytes: number;
  firstFrameImageBytes: number;
}

export interface PerformanceSample extends PerformanceValues {
  consoleErrors: string[];
  hydrationErrors: string[];
  imageFailures: string[];
  privateBoundaryHits: string[];
  overflow: { expectedMaxWidth: number; actualScrollWidth: number; overflow: boolean };
}

export interface PerformanceMeasurement {
  viewport: PerformanceViewport;
  size: { width: number; height: number };
  warmupDiscarded: number;
  sampleCount: number;
  samples: PerformanceSample[];
  median: PerformanceValues;
  mad: PerformanceValues;
  consoleErrors: string[];
  hydrationErrors: string[];
  imageFailures: string[];
  privateBoundaryHits: string[];
  overflow: PerformanceSample['overflow'];
}

const PRIVATE_BOUNDARY_PATTERNS = [
  /\/Users\/[^\s"'<>]+/gu,
  /\/home\/[^\s"'<>]+/gu,
  /[A-Za-z]:\\Users\\[^\s"'<>]+/gu,
  /memory\/thoughts\/[^\s"'<>]+/gu,
];

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
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

export function findPrivateBoundaryHits(value: string): string[] {
  return unique(PRIVATE_BOUNDARY_PATTERNS.flatMap((pattern) => value.match(pattern) ?? []));
}

function initializePerformanceObservers(): string {
  return `(() => {
    const state = { cls: 0, lcpMs: 0 };
    Object.defineProperty(window, '__formThoughtPerformance', { value: state });
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

async function resourceBytes(page: Page): Promise<{
  initialJsGzipBytes: number;
  fontBytes: number;
  firstFrameImageBytes: number;
  imageFailures: string[];
}> {
  const snapshot = await page.evaluate(() => ({
    inlineScripts: [...document.scripts]
      .filter((script) => !script.src && (script.type === '' || script.type === 'module'))
      .map((script) => script.textContent ?? '')
      .filter(Boolean),
    resources: performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      initiatorType: (entry as PerformanceResourceTiming).initiatorType,
    })),
    visibleImages: [...document.images]
      .filter((image) => {
        const bounds = image.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0
          && bounds.top < innerHeight && bounds.bottom > 0
          && bounds.left < innerWidth && bounds.right > 0;
      })
      .map((image) => ({
        url: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      })),
  }));
  const uniqueResources = [...new Map(snapshot.resources.map((entry) => [entry.url, entry])).values()];
  const fetched = (await Promise.all(uniqueResources.map(async (entry) => {
    const response = await page.request.get(entry.url).catch(() => null);
    if (!response) return null;
    return {
      ...entry,
      ok: response.ok(),
      contentType: response.headers()['content-type']?.split(';', 1)[0]?.trim().toLowerCase() ?? '',
      body: await response.body(),
    };
  }))).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const byUrl = new Map(fetched.map((entry) => [entry.url, entry]));
  const scripts = fetched.filter((entry) => entry.ok && (
    entry.initiatorType === 'script'
    || /^(?:application|text)\/(?:javascript|ecmascript)$/u.test(entry.contentType)
  ));
  const fonts = fetched.filter((entry) => entry.ok && (
    entry.initiatorType === 'font'
    || entry.contentType.startsWith('font/')
    || /\.(?:woff2?|ttf)(?:\?|$)/u.test(entry.url)
  ));
  const visibleUrls = new Set(snapshot.visibleImages.map((image) => image.url));
  const imageFailures = snapshot.visibleImages.flatMap((image) => {
    const response = byUrl.get(image.url);
    const failures: string[] = [];
    if (!image.complete || image.naturalWidth <= 0) failures.push('decode-failed');
    if (!response?.ok) failures.push(`response-status=${response ? 'non-ok' : 'missing'}`);
    if (response && !response.contentType.startsWith('image/')) failures.push(`response-format=${response.contentType}`);
    return failures.length > 0 ? [`${new URL(image.url).pathname} ${failures.join(',')}`] : [];
  });

  return {
    initialJsGzipBytes: [
      ...scripts.map((entry) => entry.body),
      ...snapshot.inlineScripts.map((source) => Buffer.from(source)),
    ].reduce((total, body) => total + gzipSync(body, { level: 9 }).byteLength, 0),
    fontBytes: fonts.reduce((total, entry) => total + entry.body.byteLength, 0),
    firstFrameImageBytes: fetched
      .filter((entry) => entry.ok && visibleUrls.has(entry.url) && entry.contentType.startsWith('image/'))
      .reduce((total, entry) => total + entry.body.byteLength, 0),
    imageFailures: unique(imageFailures),
  };
}

async function measureSample(
  browser: Browser,
  baseUrl: string,
  route: string,
  viewport: PerformanceViewport,
): Promise<PerformanceSample> {
  const size = PERFORMANCE_VIEWPORTS[viewport];
  const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
  try {
    await context.addInitScript({ content: initializePerformanceObservers() });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    const consoleErrors: string[] = [];
    const hydrationErrors: string[] = [];
    page.on('console', (message) => {
      const value = message.text();
      if (message.type() === 'error') consoleErrors.push(value);
      if (/hydration|did not match|server rendered html/iu.test(value)) hydrationErrors.push(value);
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
      if (/hydration|did not match|server rendered html/iu.test(error.message)) hydrationErrors.push(error.message);
    });
    const response = await page.goto(new URL(route, baseUrl).href, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`${route} returned HTTP ${response?.status() ?? 'no-response'}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const values = await page.evaluate(() => {
      const state = (window as Window & {
        __formThoughtPerformance?: { cls: number; lcpMs: number };
      }).__formThoughtPerformance;
      const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
      return { cls: state?.cls ?? 0, lcpMs: Math.max(state?.lcpMs ?? 0, lcp?.startTime ?? 0) };
    });
    const resources = await resourceBytes(page);
    const overflow = await page.evaluate((expectedMaxWidth) => ({
      expectedMaxWidth,
      actualScrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > expectedMaxWidth,
    }), size.width);
    const html = await page.content();
    return {
      ...values,
      ...resources,
      consoleErrors: unique(consoleErrors),
      hydrationErrors: unique(hydrationErrors),
      privateBoundaryHits: findPrivateBoundaryHits(html),
      overflow,
    };
  } finally {
    await context.close();
  }
}

export async function measurePerformance(
  browser: Browser,
  baseUrl: string,
  route: string,
  viewport: PerformanceViewport,
  options: { warmups: number; samples: number } = { warmups: 1, samples: 5 },
): Promise<PerformanceMeasurement> {
  if (!Number.isInteger(options.warmups) || options.warmups < 1) throw new Error('At least one warmup is required');
  if (!Number.isInteger(options.samples) || options.samples < 1) throw new Error('At least one sample is required');
  for (let index = 0; index < options.warmups; index += 1) {
    await measureSample(browser, baseUrl, route, viewport);
  }
  const samples: PerformanceSample[] = [];
  for (let index = 0; index < options.samples; index += 1) {
    samples.push(await measureSample(browser, baseUrl, route, viewport));
  }
  const keys = ['lcpMs', 'cls', 'initialJsGzipBytes', 'fontBytes', 'firstFrameImageBytes'] as const;
  const aggregate = (key: (typeof keys)[number]) => samples.map((sample) => sample[key]);
  const medianValues = Object.fromEntries(keys.map((key) => [key, median(aggregate(key))])) as unknown as PerformanceValues;
  const madValues = Object.fromEntries(keys.map((key) => [key, medianAbsoluteDeviation(aggregate(key))])) as unknown as PerformanceValues;
  const widest = samples.reduce((current, sample) => (
    sample.overflow.actualScrollWidth > current.actualScrollWidth ? sample.overflow : current
  ), samples[0].overflow);
  return {
    viewport,
    size: PERFORMANCE_VIEWPORTS[viewport],
    warmupDiscarded: options.warmups,
    sampleCount: options.samples,
    samples,
    median: medianValues,
    mad: madValues,
    consoleErrors: unique(samples.flatMap((sample) => sample.consoleErrors)),
    hydrationErrors: unique(samples.flatMap((sample) => sample.hydrationErrors)),
    imageFailures: unique(samples.flatMap((sample) => sample.imageFailures)),
    privateBoundaryHits: unique(samples.flatMap((sample) => sample.privateBoundaryHits)),
    overflow: widest,
  };
}
