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
}

export interface RendererSelectionReport {
  version: 1;
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
  const report = JSON.parse(await readFile(path, 'utf8')) as RendererSelectionReport;
  if (report.synthetic) throw new Error('Synthetic renderer reports cannot select a renderer');
  if (report.synthetic !== false) {
    throw new Error('Only comparison-generated real renderer reports can select a renderer');
  }
  return selectRenderer(report);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const selection = await selectRendererFromFile(reportPath(process.argv.slice(2)));
  console.log(JSON.stringify(selection));
  if ('blocked' in selection) process.exitCode = 2;
}
