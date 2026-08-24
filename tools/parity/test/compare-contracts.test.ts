import { describe, expect, it } from 'vitest';
import {
  DECISION_ROUTES,
  VIEWPORTS,
  buildRendererSelectionReport,
  compareRendererContracts,
  parseRendererCapture,
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
    renderedImages: [{
      source: '/cover.webp',
      displayedWidth: 1200,
      displayedHeight: 800,
      naturalWidth: 1200,
      naturalHeight: 800,
      declaredWidth: 1200,
      declaredHeight: 800,
      format: 'image/webp',
    }],
    imageFailures: [] as string[],
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
    imageFailures: [] as string[],
    overflow: sample.overflow,
    privateBoundaryHits: [] as string[],
  };
}

function report(renderer: RendererName): RendererCaptureReport {
  const releaseId = '1'.repeat(64);
  const publicRelease = renderer === 'astro' ? null : {
    version: 1 as const,
    verificationPolicyVersion: 1 as const,
    root: 'build/public-releases' as const,
    releaseId,
    rendererVersion: 'mdx-3.1.1-sharp-0.35.3-v2',
    activePointer: { releaseId, path: releaseId },
    activePointerHash: `sha256:${'2'.repeat(64)}`,
    manifestHash: `sha256:${'3'.repeat(64)}`,
    artifactHash: `sha256:${'4'.repeat(64)}`,
  };
  return {
    version: 2,
    renderer,
    provenance: {
      synthetic: true,
      repositoryCommit: 'a'.repeat(40),
      rendererRoot: '.',
      rendererManifest: 'package.json',
      rendererManifestHash: `sha256:${'b'.repeat(64)}`,
      buildCommand: 'npm run test:synthetic',
      outputRoot: 'dist',
      captureToolHash: `sha256:${'c'.repeat(64)}`,
      buildEnvironmentVersion: 1,
      sourceClosureVersion: 2,
      sourceClosureHash: `sha256:${'d'.repeat(64)}`,
      publicRelease,
    },
    measuredAt: '2026-08-24T00:00:00.000Z',
    captureProtocol: {
      decisionRoutes: [...DECISION_ROUTES],
      viewports: VIEWPORTS,
      warmups: 1,
      samplesPerRouteViewport: 5,
      freshBrowserContextPerSample: true,
      emptyHttpCachePerSample: true,
      initialJavaScriptByteProtocol: 'sum-gzip-level-9-inline-and-unique-initial-executable-responses',
    },
    browser: {
      package: '@playwright/test',
      packageVersion: '1.62.1',
      chromiumVersion: '151.0.7922.34',
      chromiumRevision: '1234',
    },
    artifactHash: 'sha256:artifact',
    artifactPrivateBoundaryHits: [],
    build: {
      samples: [
        { durationMs: 1_000, artifactHash: 'sha256:artifact', cleanedPaths: ['dist'] },
        { durationMs: 1_010, artifactHash: 'sha256:artifact', cleanedPaths: ['dist'] },
        { durationMs: 990, artifactHash: 'sha256:artifact', cleanedPaths: ['dist'] },
      ],
      medianDurationMs: 1_000,
      madDurationMs: 10,
      reproducible: true,
      command: 'npm run test:synthetic',
      workingDirectory: '.',
      clean: { strategy: 'remove-recreate', paths: ['dist'], beforeEachBuild: true },
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

function strictSyntheticReport(renderer: RendererName): RendererCaptureReport {
  const fixture = report(renderer);
  const artifactHash = `sha256:${'d'.repeat(64)}`;
  fixture.artifactHash = artifactHash;
  fixture.build.samples = fixture.build.samples.map((sample) => ({ ...sample, artifactHash }));
  const evidence = {
    astro: {
      rendererRoot: '.',
      rendererManifest: 'package.json',
      buildCommand: 'npm run legacy:build',
      outputRoot: 'dist',
      cleanPaths: ['dist', '.astro', 'node_modules/.astro'],
    },
    next: {
      rendererRoot: 'spikes/site-next',
      rendererManifest: 'spikes/site-next/package.json',
      buildCommand: 'npm run build',
      outputRoot: 'spikes/site-next/out',
      cleanPaths: ['spikes/site-next/out', 'spikes/site-next/.next'],
    },
    'react-router': {
      rendererRoot: 'spikes/site-react-router',
      rendererManifest: 'spikes/site-react-router/package.json',
      buildCommand: 'npm run build',
      outputRoot: 'spikes/site-react-router/build/client',
      cleanPaths: [
        'spikes/site-react-router/build',
        'spikes/site-react-router/node_modules/.vite',
        'spikes/site-react-router/.react-router',
      ],
    },
  }[renderer];
  const { cleanPaths, ...provenanceEvidence } = evidence;
  fixture.provenance = {
    ...fixture.provenance,
    ...provenanceEvidence,
  };
  fixture.build.command = evidence.buildCommand;
  fixture.build.workingDirectory = evidence.rendererRoot;
  fixture.build.clean.paths = cleanPaths;
  fixture.build.samples = fixture.build.samples.map((sample) => ({
    ...sample,
    cleanedPaths: cleanPaths,
  }));
  return fixture;
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
    next.build.madDurationMs = 0;
    reactRouter.build.samples = reactRouter.build.samples.map((sample) => ({ ...sample, durationMs: 10_000 }));
    reactRouter.build.medianDurationMs = 10_000;
    reactRouter.build.madDurationMs = 0;

    const selectionReport = buildRendererSelectionReport(baseline, next, reactRouter);

    expect(selectionReport.synthetic).toBe(true);
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

  it('refuses duplicate artifacts presented as two non-synthetic candidates', () => {
    const baseline = report('astro');
    const next = report('next');
    const reactRouter = report('react-router');
    baseline.provenance = { ...baseline.provenance, synthetic: false };
    next.provenance = {
      ...next.provenance,
      synthetic: false,
      rendererRoot: 'spikes/site-next',
      rendererManifest: 'spikes/site-next/package.json',
      buildCommand: 'npm run build',
      outputRoot: 'spikes/site-next/out',
    };
    reactRouter.provenance = {
      ...reactRouter.provenance,
      synthetic: false,
      rendererRoot: 'spikes/site-react-router',
      rendererManifest: 'spikes/site-react-router/package.json',
      buildCommand: 'npm run build',
      outputRoot: 'spikes/site-react-router/build',
    };

    expect(() => buildRendererSelectionReport(baseline, next, reactRouter)).toThrow(/duplicate artifact/iu);
  });

  it('refuses candidates captured from different verified public releases', () => {
    const baseline = report('astro');
    const next = report('next');
    const reactRouter = report('react-router');
    const releaseEvidence = {
      version: 1,
      verificationPolicyVersion: 1,
      root: 'build/public-releases',
      releaseId: '1'.repeat(64),
      rendererVersion: 'mdx-3.1.1-sharp-0.35.3-v2',
      activePointer: { releaseId: '1'.repeat(64), path: '1'.repeat(64) },
      activePointerHash: `sha256:${'2'.repeat(64)}`,
      manifestHash: `sha256:${'3'.repeat(64)}`,
      artifactHash: `sha256:${'4'.repeat(64)}`,
    };
    (baseline.provenance as unknown as { publicRelease: null }).publicRelease = null;
    (next.provenance as unknown as { publicRelease: typeof releaseEvidence }).publicRelease = releaseEvidence;
    (reactRouter.provenance as unknown as { publicRelease: typeof releaseEvidence }).publicRelease = {
      ...releaseEvidence,
      releaseId: '5'.repeat(64),
      activePointer: { releaseId: '5'.repeat(64), path: '5'.repeat(64) },
    };

    expect(() => buildRendererSelectionReport(baseline, next, reactRouter)).toThrow(
      /same verified public release|public release.*differ/iu,
    );
  });

  it('strictly rejects missing cold samples and final artifacts not produced by the clean builds', () => {
    const missingSample = strictSyntheticReport('next');
    missingSample.routes[0].measurements[0].samples.pop();
    const mismatchedArtifact = strictSyntheticReport('react-router');
    mismatchedArtifact.artifactHash = `sha256:${'e'.repeat(64)}`;

    expect(() => parseRendererCapture(missingSample, { allowSynthetic: true })).toThrow(/five cold samples/iu);
    expect(() => parseRendererCapture(mismatchedArtifact, { allowSynthetic: true })).toThrow(/artifact/iu);
  });

  it('strictly rejects closure-v1 evidence and candidates without verified public release evidence', () => {
    const legacyClosure = strictSyntheticReport('astro');
    const unboundCandidate = strictSyntheticReport('next');
    (legacyClosure.provenance as unknown as { sourceClosureVersion: number }).sourceClosureVersion = 1;
    (unboundCandidate.provenance as unknown as { publicRelease: null }).publicRelease = null;

    expect(() => parseRendererCapture(legacyClosure, { allowSynthetic: true })).toThrow(
      /sourceClosureVersion/iu,
    );
    expect(() => parseRendererCapture(unboundCandidate, { allowSynthetic: true })).toThrow(
      /publicRelease/iu,
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

  it('recomputes mandatory metrics and issue unions from raw cold samples', () => {
    const baseline = report('astro');
    const candidate = report('next');
    const route = '/reviews/black-swan/' as const;
    const target = candidate.routes.find((entry) => entry.path === route)!;
    const mobile = target.measurements.find((entry) => entry.viewport === 'mobile')!;
    for (const sample of mobile.samples) sample.cls = 1;
    mobile.samples[0].axeSeriousOrCritical = ['image-alt: serious'];

    const result = compareRendererContracts(baseline, candidate);

    expect(result.failures).toContainEqual(expect.stringContaining('metric=measurement-summary'));
    expect(result.failures).toContainEqual(expect.stringContaining('metric=cls'));
    expect(result.failures).toContainEqual(expect.stringContaining('metric=axe-serious-critical'));
    expect(result.mandatoryPass).toBe(false);
  });

  it('rejects stored build summaries that disagree with the three raw durations', () => {
    const baseline = report('astro');
    const candidate = report('next');
    candidate.build.medianDurationMs = 1;
    candidate.build.madDurationMs = 0;

    const result = compareRendererContracts(baseline, candidate);

    expect(result.failures).toContainEqual(expect.stringContaining('metric=build-summary'));
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
    mobile.samples[0].axeSeriousOrCritical = ['button-name: serious'];
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
    desktop.samples[0].privateBoundaryHits = ['/Users/user/private/memory.md'];
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
