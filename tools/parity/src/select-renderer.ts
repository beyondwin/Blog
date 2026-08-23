import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface QualityMetric {
  median: number;
  mad: number;
}

export interface RendererSelectionCandidate {
  renderer: 'next' | 'react-router';
  mandatoryFailures: string[];
  quality: {
    lcpMs: QualityMetric;
    jsGzipBytes: QualityMetric;
    imageBytes: QualityMetric;
    buildDurationMs: QualityMetric;
  };
  buildArtifactHashes: string[];
  responsiveImageContract: string[];
  captureEvidence: {
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
    artifactHash: string;
    browser: {
      package: '@playwright/test';
      packageVersion: string;
      chromiumVersion: string;
      chromiumRevision: string;
    };
    captureProtocol: Record<string, unknown>;
  };
}

export interface RendererSelectionReport {
  version: 2;
  synthetic?: boolean;
  candidates: {
    next: RendererSelectionCandidate;
    reactRouter: RendererSelectionCandidate;
  };
}

export type RendererSelection =
  | { winner: 'next' | 'react-router' }
  | { blocked: true; reasons: string[] };

function exceedsVariance(
  improvement: number,
  next: QualityMetric,
  reactRouter: QualityMetric,
): boolean {
  return improvement > 2 * Math.max(next.mad, reactRouter.mad);
}

function winsLcp(next: RendererSelectionCandidate, reactRouter: RendererSelectionCandidate): boolean {
  const improvement = reactRouter.quality.lcpMs.median - next.quality.lcpMs.median;
  return improvement > reactRouter.quality.lcpMs.median * 0.1
    && improvement > 75
    && exceedsVariance(improvement, next.quality.lcpMs, reactRouter.quality.lcpMs);
}

function winsJavaScript(next: RendererSelectionCandidate, reactRouter: RendererSelectionCandidate): boolean {
  const improvement = reactRouter.quality.jsGzipBytes.median - next.quality.jsGzipBytes.median;
  return improvement > reactRouter.quality.jsGzipBytes.median * 0.15
    && improvement > 10 * 1024
    && exceedsVariance(improvement, next.quality.jsGzipBytes, reactRouter.quality.jsGzipBytes);
}

function winsImages(next: RendererSelectionCandidate, reactRouter: RendererSelectionCandidate): boolean {
  const improvement = reactRouter.quality.imageBytes.median - next.quality.imageBytes.median;
  return next.responsiveImageContract.length > 0
    && JSON.stringify(next.responsiveImageContract) === JSON.stringify(reactRouter.responsiveImageContract)
    && next.responsiveImageContract.every((entry) => !entry.includes(':unknown:'))
    && improvement > reactRouter.quality.imageBytes.median * 0.15
    && exceedsVariance(improvement, next.quality.imageBytes, reactRouter.quality.imageBytes);
}

function hasThreeReproducibleBuilds(candidate: RendererSelectionCandidate): boolean {
  return candidate.buildArtifactHashes.length === 3
    && new Set(candidate.buildArtifactHashes).size === 1;
}

function winsBuild(next: RendererSelectionCandidate, reactRouter: RendererSelectionCandidate): boolean {
  const improvement = reactRouter.quality.buildDurationMs.median - next.quality.buildDurationMs.median;
  return hasThreeReproducibleBuilds(next)
    && hasThreeReproducibleBuilds(reactRouter)
    && improvement > reactRouter.quality.buildDurationMs.median * 0.2
    && exceedsVariance(
      improvement,
      next.quality.buildDurationMs,
      reactRouter.quality.buildDurationMs,
    );
}

export function selectRenderer(report: RendererSelectionReport): RendererSelection {
  const { next, reactRouter } = report.candidates;
  const nextPasses = next.mandatoryFailures.length === 0;
  const reactRouterPasses = reactRouter.mandatoryFailures.length === 0;

  if (nextPasses && !reactRouterPasses) return { winner: 'next' };
  if (reactRouterPasses && !nextPasses) return { winner: 'react-router' };

  if (!nextPasses && !reactRouterPasses) {
    return {
      blocked: true,
      reasons: [
        ...next.mandatoryFailures.map((failure) => `next: ${failure}`),
        ...reactRouter.mandatoryFailures.map((failure) => `react-router: ${failure}`),
      ],
    };
  }

  const nextAdvantages = [
    winsLcp(next, reactRouter),
    winsJavaScript(next, reactRouter),
    winsImages(next, reactRouter),
    winsBuild(next, reactRouter),
  ].filter(Boolean).length;

  return nextAdvantages >= 2 ? { winner: 'next' } : { winner: 'react-router' };
}

function reportPath(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== '--report' || !argv[1]) {
    throw new Error('Usage: select-renderer.ts --report <renderer-selection-report.json>');
  }
  return resolve(argv[1]);
}

export async function selectRendererFromFile(path: string): Promise<RendererSelection> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Renderer selection report must be an object');
  }
  const root = value as Record<string, unknown>;
  if (!Object.hasOwn(root, 'synthetic')) {
    throw new Error('Only comparison-generated real renderer reports can select a renderer');
  }
  const assertKeys = (object: Record<string, unknown>, keys: string[], name: string): void => {
    const actual = Object.keys(object);
    const unknown = actual.filter((key) => !keys.includes(key));
    const missing = keys.filter((key) => !Object.hasOwn(object, key));
    if (unknown.length > 0 || missing.length > 0) {
      throw new Error(`${name} has invalid fields: unknown=${unknown.join(',')} missing=${missing.join(',')}`);
    }
  };
  const object = (input: unknown, name: string): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${name} must be an object`);
    return input as Record<string, unknown>;
  };
  const finiteMetric = (input: unknown, name: string): void => {
    const metric = object(input, name);
    assertKeys(metric, ['median', 'mad'], name);
    if (typeof metric.median !== 'number' || !Number.isFinite(metric.median) || metric.median < 0
      || typeof metric.mad !== 'number' || !Number.isFinite(metric.mad) || metric.mad < 0) {
      throw new Error(`${name} must contain non-negative finite values`);
    }
  };
  assertKeys(root, ['version', 'synthetic', 'candidates'], 'report');
  if (root.version !== 2 || typeof root.synthetic !== 'boolean') throw new Error('Renderer selection schema is invalid');
  const candidates = object(root.candidates, 'report.candidates');
  assertKeys(candidates, ['next', 'reactRouter'], 'report.candidates');
  const artifactHashes: string[] = [];
  for (const [key, renderer] of [['next', 'next'], ['reactRouter', 'react-router']] as const) {
    const candidate = object(candidates[key], `report.candidates.${key}`);
    assertKeys(candidate, [
      'renderer', 'mandatoryFailures', 'quality', 'buildArtifactHashes',
      'responsiveImageContract', 'captureEvidence',
    ], `report.candidates.${key}`);
    if (candidate.renderer !== renderer) throw new Error(`report.candidates.${key}.renderer is invalid`);
    for (const [arrayKey, pattern] of [
      ['mandatoryFailures', null],
      ['responsiveImageContract', null],
      ['buildArtifactHashes', /^sha256:[a-f0-9]{64}$/u],
    ] as const) {
      if (!Array.isArray(candidate[arrayKey]) || !(candidate[arrayKey] as unknown[]).every((entry) => (
        typeof entry === 'string' && (!pattern || pattern.test(entry))
      ))) throw new Error(`report.candidates.${key}.${arrayKey} is invalid`);
    }
    const buildArtifactHashes = candidate.buildArtifactHashes as string[];
    if (buildArtifactHashes.length !== 3 || new Set(buildArtifactHashes).size !== 1) {
      throw new Error(`report.candidates.${key} must contain three clean builds of one artifact`);
    }
    const quality = object(candidate.quality, `report.candidates.${key}.quality`);
    assertKeys(quality, ['lcpMs', 'jsGzipBytes', 'imageBytes', 'buildDurationMs'], `report.candidates.${key}.quality`);
    for (const metric of ['lcpMs', 'jsGzipBytes', 'imageBytes', 'buildDurationMs']) {
      finiteMetric(quality[metric], `report.candidates.${key}.quality.${metric}`);
    }
    const evidence = object(candidate.captureEvidence, `report.candidates.${key}.captureEvidence`);
    assertKeys(evidence, ['provenance', 'artifactHash', 'browser', 'captureProtocol'], `report.candidates.${key}.captureEvidence`);
    const provenance = object(evidence.provenance, `report.candidates.${key}.captureEvidence.provenance`);
    assertKeys(provenance, [
      'synthetic', 'repositoryCommit', 'rendererRoot', 'rendererManifest', 'rendererManifestHash',
      'buildCommand', 'outputRoot', 'captureToolHash',
    ], `report.candidates.${key}.captureEvidence.provenance`);
    if (provenance.synthetic !== root.synthetic) throw new Error('Selection and capture synthetic provenance disagree');
    const expectedRoot = renderer === 'next' ? 'spikes/site-next' : 'spikes/site-react-router';
    if (provenance.rendererRoot !== expectedRoot
      || provenance.rendererManifest !== `${expectedRoot}/package.json`
      || provenance.buildCommand !== 'npm run build'
      || typeof provenance.outputRoot !== 'string'
      || !provenance.outputRoot.startsWith(`${expectedRoot}/`)
      || typeof provenance.repositoryCommit !== 'string'
      || !/^[a-f0-9]{40}$/u.test(provenance.repositoryCommit)
      || typeof provenance.rendererManifestHash !== 'string'
      || !/^sha256:[a-f0-9]{64}$/u.test(provenance.rendererManifestHash)
      || typeof provenance.captureToolHash !== 'string'
      || !/^sha256:[a-f0-9]{64}$/u.test(provenance.captureToolHash)) {
      throw new Error(`report.candidates.${key} has invalid renderer-specific provenance`);
    }
    if (typeof evidence.artifactHash !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(evidence.artifactHash)) {
      throw new Error(`report.candidates.${key}.captureEvidence.artifactHash is invalid`);
    }
    if (!buildArtifactHashes.every((hash) => hash === evidence.artifactHash)) {
      throw new Error(`report.candidates.${key} artifact evidence does not match its clean builds`);
    }
    const browser = object(evidence.browser, `report.candidates.${key}.captureEvidence.browser`);
    assertKeys(browser, ['package', 'packageVersion', 'chromiumVersion', 'chromiumRevision'], `report.candidates.${key}.captureEvidence.browser`);
    if (browser.package !== '@playwright/test' || ['packageVersion', 'chromiumVersion', 'chromiumRevision'].some(
      (browserKey) => typeof browser[browserKey] !== 'string',
    )) throw new Error(`report.candidates.${key}.captureEvidence.browser is invalid`);
    const protocol = object(evidence.captureProtocol, `report.candidates.${key}.captureEvidence.captureProtocol`);
    const expectedProtocol = {
      decisionRoutes: [
        '/',
        '/articles/why-i-read-in-the-ai-era/',
        '/reviews/black-swan/',
        '/memory/agent-harnesses-are-operating-systems/',
      ],
      viewports: { desktop: { width: 1440, height: 960 }, mobile: { width: 390, height: 844 } },
      warmups: 1,
      samplesPerRouteViewport: 5,
      freshBrowserContextPerSample: true,
      emptyHttpCachePerSample: true,
      initialJavaScriptByteProtocol: 'sum-gzip-level-9-inline-and-unique-initial-executable-responses',
    };
    if (JSON.stringify(protocol) !== JSON.stringify(expectedProtocol)) {
      throw new Error(`report.candidates.${key}.captureEvidence.captureProtocol is invalid`);
    }
    artifactHashes.push(evidence.artifactHash);
  }
  if (artifactHashes[0] === artifactHashes[1]) throw new Error('Duplicate artifact evidence cannot select a renderer');
  const report = root as unknown as RendererSelectionReport;
  if (report.synthetic) throw new Error('Synthetic renderer reports cannot select a renderer');
  return selectRenderer(report);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const selection = await selectRendererFromFile(reportPath(process.argv.slice(2)));
  console.log(JSON.stringify(selection));
  if ('blocked' in selection) process.exitCode = 2;
}
