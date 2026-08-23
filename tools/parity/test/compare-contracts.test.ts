import { describe, expect, it } from 'vitest';
import {
  DECISION_ROUTES,
  VIEWPORTS,
  buildRendererSelectionReport,
  compareRendererContracts,
  type RendererCaptureReport,
  type RendererName,
} from '../src/compare-contracts';
import { selectRenderer } from '../src/select-renderer';

function measurement(viewport: 'desktop' | 'mobile') {
  const size = VIEWPORTS[viewport];
  const sample = {
    lcpMs: 800,
    cls: 0.01,
    jsGzipBytes: 40_000,
    imageBytes: 60_000,
    renderedImages: [{ displayedWidth: 1200, displayedHeight: 800, format: 'image/webp' }],
    consoleErrors: [] as string[],
    hydrationErrors: [] as string[],
    axeSeriousOrCritical: [] as string[],
    overflow: {
      expectedMaxWidth: size.width,
      actualScrollWidth: size.width,
      overflow: false,
    },
    privateBoundaryHits: [] as string[],
  };

  return {
    viewport,
    size,
    warmupDiscarded: 1 as const,
    sampleCount: 5 as const,
    samples: Array.from({ length: 5 }, () => structuredClone(sample)),
    median: {
      lcpMs: sample.lcpMs,
      cls: sample.cls,
      jsGzipBytes: sample.jsGzipBytes,
      imageBytes: sample.imageBytes,
    },
    mad: { lcpMs: 0, cls: 0, jsGzipBytes: 0, imageBytes: 0 },
    consoleErrors: [] as string[],
    hydrationErrors: [] as string[],
    axeSeriousOrCritical: [] as string[],
    overflow: sample.overflow,
    privateBoundaryHits: [] as string[],
  };
}

function report(renderer: RendererName): RendererCaptureReport {
  return {
    version: 1,
    renderer,
    measuredAt: '2026-08-24T00:00:00.000Z',
    captureProtocol: {
      decisionRoutes: [...DECISION_ROUTES],
      viewports: VIEWPORTS,
      warmups: 1,
      samplesPerRouteViewport: 5,
      freshBrowserContextPerSample: true,
      emptyHttpCachePerSample: true,
    },
    browser: {
      package: '@playwright/test',
      packageVersion: '1.62.1',
      chromiumVersion: '151.0.7922.34',
      chromiumRevision: '1234',
    },
    artifactHash: 'sha256:artifact',
    build: {
      samples: [
        { durationMs: 1_000, artifactHash: 'sha256:artifact' },
        { durationMs: 1_010, artifactHash: 'sha256:artifact' },
        { durationMs: 990, artifactHash: 'sha256:artifact' },
      ],
      medianDurationMs: 1_000,
      madDurationMs: 10,
      reproducible: true,
    },
    routes: DECISION_ROUTES.map((path) => ({
      path,
      contract: {
        canonical: path,
        title: `Title ${path}`,
        description: `Description ${path}`,
        openGraph: { 'og:title': `Title ${path}` },
        headings: [{ level: 1, text: `Heading ${path}`, id: 'semantic-heading' }],
        bodyTextHash: `body-${path}`,
        internalHrefs: ['/canonical-target/'],
        externalHrefs: ['https://example.com/provenance'],
        imageAttributes: [],
        stableHtmlHash: `html-${path}`,
      },
      measurements: [measurement('desktop'), measurement('mobile')],
    })),
  };
}

function expectActionableFailure(
  failure: string,
  expected: { renderer: string; route: string; viewport: string; metric: string },
): void {
  expect(failure).toContain(`renderer=${expected.renderer}`);
  expect(failure).toContain(`route=${expected.route}`);
  expect(failure).toContain(`viewport=${expected.viewport}`);
  expect(failure).toContain(`metric=${expected.metric}`);
  expect(failure).toContain('expected=');
  expect(failure).toContain('actual=');
}

describe('renderer contract comparison', () => {
  it('builds the selector input from real samples and comparison failures', () => {
    const baseline = report('astro');
    const next = report('next');
    const reactRouter = report('react-router');

    for (const route of baseline.routes) {
      for (const measurement of route.measurements) {
        measurement.median.lcpMs = 1_200;
        for (const sample of measurement.samples) sample.lcpMs = 1_200;
      }
    }
    for (const route of reactRouter.routes) {
      for (const measurement of route.measurements) {
        measurement.median.lcpMs = 1_000;
        measurement.median.jsGzipBytes = 100_000;
        for (const sample of measurement.samples) {
          sample.lcpMs = 1_000;
          sample.jsGzipBytes = 100_000;
        }
      }
    }
    next.build.samples = next.build.samples.map((sample) => ({ ...sample, durationMs: 9_000 }));
    next.build.medianDurationMs = 9_000;
    reactRouter.build.samples = reactRouter.build.samples.map((sample) => ({ ...sample, durationMs: 10_000 }));
    reactRouter.build.medianDurationMs = 10_000;

    const selectionReport = buildRendererSelectionReport(baseline, next, reactRouter);

    expect(selectionReport.synthetic).toBe(false);
    expect(selectionReport.candidates.next.mandatoryFailures).toEqual([]);
    expect(selectionReport.candidates.reactRouter.mandatoryFailures).toEqual([]);
    expect(selectionReport.candidates.next.quality.lcpMs).toEqual({ median: 800, mad: 0 });
    expect(selectionReport.candidates.reactRouter.quality.lcpMs).toEqual({ median: 1000, mad: 0 });
    expect(selectionReport.candidates.next.quality.jsGzipBytes).toEqual({ median: 320_000, mad: 0 });
    expect(selectionReport.candidates.reactRouter.quality.jsGzipBytes).toEqual({ median: 800_000, mad: 0 });
    expect(selectRenderer(selectionReport)).toEqual({ winner: 'next' });
  });

  it('refuses swapped candidate report identities', () => {
    const baseline = report('astro');
    const next = report('react-router');
    const reactRouter = report('next');

    expect(() => buildRendererSelectionReport(baseline, next, reactRouter)).toThrow(
      'Expected next candidate report, got react-router',
    );
  });

  it('names a title mismatch by renderer, route, viewport, metric, expected, and actual', () => {
    const baseline = report('astro');
    const candidate = report('next');
    candidate.routes[0].contract.title = 'Wrong title';

    const result = compareRendererContracts(baseline, candidate);
    const failure = result.failures.find((entry) => entry.includes('metric=title')) ?? '';

    expectActionableFailure(failure, {
      renderer: 'next',
      route: '/',
      viewport: 'desktop',
      metric: 'title',
    });
  });

  it('blocks a non-reproducible three-build contract with actionable evidence', () => {
    const baseline = report('astro');
    const candidate = report('next');
    candidate.build.reproducible = false;
    candidate.build.samples[2].artifactHash = 'sha256:different';

    const result = compareRendererContracts(baseline, candidate);
    const failure = result.failures.find((entry) => entry.includes('metric=build-reproducibility')) ?? '';

    expectActionableFailure(failure, {
      renderer: 'next',
      route: '/',
      viewport: 'desktop',
      metric: 'build-reproducibility',
    });
    expect(result.mandatoryPass).toBe(false);
  });

  it('blocks browser-pin and cold-sample protocol drift', () => {
    const baseline = report('astro');
    const candidate = report('next');
    candidate.browser.chromiumVersion = '999.0.0.0';
    candidate.browser.chromiumRevision = '9999';
    const article = candidate.routes.find((entry) => entry.path === '/articles/why-i-read-in-the-ai-era/')!;
    const mobile = article.measurements.find((entry) => entry.viewport === 'mobile')!;
    mobile.samples.pop();
    mobile.sampleCount = 4;

    const result = compareRendererContracts(baseline, candidate);

    expect(result.failures).toContainEqual(expect.stringContaining('metric=chromium-version'));
    expect(result.failures).toContainEqual(expect.stringContaining('metric=chromium-revision'));
    expect(result.failures).toContainEqual(expect.stringContaining('metric=sampling-protocol'));
    expect(result.mandatoryPass).toBe(false);
  });

  it('ignores framework image attributes and asset roots while retaining responsive dimensions', () => {
    const baseline = report('astro');
    const candidate = report('next');
    const expectedRoute = baseline.routes.find((entry) => entry.path === '/')!;
    const actualRoute = candidate.routes.find((entry) => entry.path === '/')!;
    expectedRoute.contract.imageAttributes = [{
      alt: 'Cover',
      'data-astro-cid-example': 'true',
      height: '800',
      src: '/_astro/cover.Ab12Cd34.webp',
      width: '1200',
    }];
    actualRoute.contract.imageAttributes = [{
      alt: 'Cover',
      height: '800',
      sizes: '(max-width: 760px) 100vw, 1200px',
      src: '/assets/content/articles/example/cover.webp',
      srcset: '/assets/content/articles/example/cover-600.webp 600w, /assets/content/articles/example/cover.webp 1200w',
      width: '1200',
    }];

    const matching = compareRendererContracts(baseline, candidate);
    expect(matching.mandatoryPass).toBe(true);
    expect(matching.failures.filter((entry) => entry.includes('metric=image-'))).toEqual([]);

    actualRoute.contract.imageAttributes[0].width = '1199';
    const mismatch = compareRendererContracts(baseline, candidate);
    expect(mismatch.failures).toContainEqual(expect.stringContaining('metric=image-dimensions'));
  });

  it('names a missing no-JS href with the exact expected destination', () => {
    const baseline = report('astro');
    const candidate = report('next');
    const route = '/articles/why-i-read-in-the-ai-era/' as const;
    const target = candidate.routes.find((entry) => entry.path === route)!;
    target.contract.internalHrefs = [];

    const result = compareRendererContracts(baseline, candidate);
    const failure = result.failures.find((entry) => entry.includes('metric=no-js-href')) ?? '';

    expectActionableFailure(failure, {
      renderer: 'next',
      route,
      viewport: 'desktop',
      metric: 'no-js-href',
    });
    expect(failure).toContain('expected="/canonical-target/"');
    expect(failure).toContain('actual="missing"');
  });

  it('retains external provenance hrefs as semantic contract evidence', () => {
    const baseline = report('astro');
    const candidate = report('next');
    const route = '/articles/why-i-read-in-the-ai-era/' as const;
    const target = candidate.routes.find((entry) => entry.path === route)!;
    target.contract.externalHrefs = [];

    const result = compareRendererContracts(baseline, candidate);
    const failure = result.failures.find((entry) => entry.includes('metric=provenance-href')) ?? '';

    expectActionableFailure(failure, {
      renderer: 'next',
      route,
      viewport: 'desktop',
      metric: 'provenance-href',
    });
  });

  it('names one serious axe issue at its exact route and viewport', () => {
    const baseline = report('astro');
    const candidate = report('next');
    const route = '/reviews/black-swan/' as const;
    const target = candidate.routes.find((entry) => entry.path === route)!;
    const mobile = target.measurements.find((entry) => entry.viewport === 'mobile')!;
    mobile.axeSeriousOrCritical = ['button-name: serious'];

    const result = compareRendererContracts(baseline, candidate);
    const failure = result.failures.find((entry) => entry.includes('metric=axe-serious-critical')) ?? '';

    expectActionableFailure(failure, {
      renderer: 'next',
      route,
      viewport: 'mobile',
      metric: 'axe-serious-critical',
    });
    expect(failure).toContain('expected=0');
    expect(failure).toContain('actual=1');
  });

  it('retains and names a private path leak from the unnormalized evidence', () => {
    const baseline = report('astro');
    const candidate = report('next');
    const route = '/memory/agent-harnesses-are-operating-systems/' as const;
    const target = candidate.routes.find((entry) => entry.path === route)!;
    const desktop = target.measurements.find((entry) => entry.viewport === 'desktop')!;
    desktop.privateBoundaryHits = ['/Users/user/private/memory.md'];

    const result = compareRendererContracts(baseline, candidate);
    const failure = result.failures.find((entry) => entry.includes('metric=private-path-leak')) ?? '';

    expectActionableFailure(failure, {
      renderer: 'next',
      route,
      viewport: 'desktop',
      metric: 'private-path-leak',
    });
    expect(failure).toContain('/Users/user/private/memory.md');
  });
});
