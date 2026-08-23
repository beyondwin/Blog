import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRendererSelectionReport, readCaptureEvidence } from './compare-contracts.ts';

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

const USAGE = 'Usage: select-renderer.ts --baseline <astro-capture.json> --next <next-capture.json> --react-router <react-router-capture.json>';

function capturePaths(argv: string[]) {
  if (argv.length !== 6) throw new Error(USAGE);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name || !['--baseline', '--next', '--react-router'].includes(name) || !value || values.has(name)) {
      throw new Error(USAGE);
    }
    values.set(name, value);
  }
  if (values.size !== 3) throw new Error(USAGE);
  return {
    baseline: resolve(values.get('--baseline') as string),
    next: resolve(values.get('--next') as string),
    reactRouter: resolve(values.get('--react-router') as string),
  };
}

export async function selectRendererFromCaptures(
  paths: { baseline: string; next: string; reactRouter: string },
  repositoryRoot = process.cwd(),
): Promise<RendererSelection> {
  const [baseline, next, reactRouter] = await Promise.all([
    readCaptureEvidence(paths.baseline, 'astro', { repositoryRoot, requireCommittedCleanEvidence: true }),
    readCaptureEvidence(paths.next, 'next', { repositoryRoot, requireCommittedCleanEvidence: true }),
    readCaptureEvidence(paths.reactRouter, 'react-router', { repositoryRoot, requireCommittedCleanEvidence: true }),
  ]);
  const report = buildRendererSelectionReport(baseline, next, reactRouter);
  if (report.synthetic) throw new Error('Synthetic renderer captures cannot select a renderer');
  return selectRenderer(report);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const selection = await selectRendererFromCaptures(capturePaths(process.argv.slice(2)));
  console.log(JSON.stringify(selection));
  if ('blocked' in selection) process.exitCode = 2;
}
