import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRawSampleReference,
  verifyDeterministicComparisonRuns,
  verifyPromotedRendererWorkspace,
  verifyRendererPromotionReport,
} from '../src/promotion-contract';
import type { RendererCaptureReport } from '../src/compare-contracts';
import type { RendererSelectionReport } from '../src/select-renderer';

const repositoryRoot = process.cwd();

async function comparisonFixture(): Promise<RendererSelectionReport> {
  return JSON.parse(await readFile(
    join(repositoryRoot, 'tests/fixtures/parity/renderer-report-next-one-win.json'),
    'utf8',
  )) as RendererSelectionReport;
}

describe('renderer promotion contract', () => {
  it('derives the promoted renderer only from three byte-identical comparison runs', async () => {
    const report = await comparisonFixture();
    report.candidates.next.mandatoryFailures = [
      'renderer=next route=/ viewport=desktop metric=mandatory expected=0 actual=1',
    ];
    const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);

    expect(verifyDeterministicComparisonRuns([bytes, bytes, bytes])).toMatchObject({
      selectedRenderer: 'react-router',
      rejectedRenderer: 'next',
      comparisonRunHashes: [
        expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      ],
      noPreferenceOverride: true,
    });
  });

  it('rejects a changed comparison run instead of accepting a manual winner override', async () => {
    const report = await comparisonFixture();
    report.candidates.next.mandatoryFailures = ['mandatory failure'];
    const first = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    const changed = structuredClone(report);
    changed.candidates.next.mandatoryFailures = [];
    changed.candidates.reactRouter.mandatoryFailures = ['manual loser failure'];
    const third = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);

    expect(() => verifyDeterministicComparisonRuns([first, first, third])).toThrow(
      /three byte-identical comparison runs/iu,
    );
  });

  it('references every sealed raw sample by path, hash, route, viewport, and JSON pointer', async () => {
    const capturePath = 'tests/fixtures/parity/astro-renderer-baseline.json';
    const capture = JSON.parse(await readFile(
      join(repositoryRoot, capturePath),
      'utf8',
    )) as RendererCaptureReport;
    const reference = buildRawSampleReference(
      capturePath,
      `sha256:${'a'.repeat(64)}`,
      capture,
    );

    expect(reference.path).toBe(capturePath);
    expect(reference.hash).toBe(`sha256:${'a'.repeat(64)}`);
    expect(reference.routes).toHaveLength(4);
    for (const route of reference.routes) {
      expect(route.measurements.map((measurement) => measurement.viewport)).toEqual([
        'desktop',
        'mobile',
      ]);
      for (const measurement of route.measurements) {
        expect(measurement.samplePointers).toHaveLength(5);
        expect(measurement.samplePointers[0]).toMatch(/^\/routes\/\d+\/measurements\/\d+\/samples\/0$/u);
        expect(measurement.samplePointers[4]).toMatch(/^\/routes\/\d+\/measurements\/\d+\/samples\/4$/u);
      }
    }
  });

  it('promotes only apps/site, excludes rejected evidence, and leaves no active Next dependency', async () => {
    await expect(verifyPromotedRendererWorkspace(repositoryRoot)).resolves.toMatchObject({
      selectedPackage: '@beyondwin/site',
      selectedPath: 'apps/site',
      rejectedPath: 'spikes/rejected/site-next',
      activeNextDependencies: [],
    });
  });

  it('recomputes the selected renderer from the durable machine report and sealed raw inputs', async () => {
    await expect(verifyRendererPromotionReport(
      repositoryRoot,
      'docs/notes/project/evidence/public-renderer-report.json',
    )).resolves.toMatchObject({
      selectedRenderer: 'react-router',
      rejectedRenderer: 'next',
      comparisonRunHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      rejectedSourceHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    });
  }, 30_000);
});
