import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { RendererCaptureReport } from '../src/compare-contracts';
import type { RendererSelectionReport } from '../src/select-renderer';

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'beyondwin-renderer-cli-test-'));
  temporaryRoots.push(root);
  return root;
}

describe('renderer harness CLIs', () => {
  it('refuses unproven capture JSON instead of laundering it into a real selection report', async () => {
    const root = await createRoot();
    const baselinePath = join(process.cwd(), 'tests/fixtures/parity/astro-renderer-baseline.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as RendererCaptureReport;
    const next = structuredClone(baseline);
    const reactRouter = structuredClone(baseline);
    next.renderer = 'next';
    reactRouter.renderer = 'react-router';
    next.artifactHash = `sha256:${'1'.repeat(64)}`;
    reactRouter.artifactHash = `sha256:${'2'.repeat(64)}`;
    next.build.samples = next.build.samples.map((sample) => ({ ...sample, artifactHash: next.artifactHash }));
    reactRouter.build.samples = reactRouter.build.samples.map((sample) => ({
      ...sample,
      artifactHash: reactRouter.artifactHash,
    }));
    const nextPath = join(root, 'next.json');
    const reactRouterPath = join(root, 'react-router.json');
    const outputPath = join(root, 'comparison.json');
    await writeFile(nextPath, JSON.stringify(next));
    await writeFile(reactRouterPath, JSON.stringify(reactRouter));

    await expect(execFileAsync('npx', [
      'tsx',
      'tools/parity/src/compare-contracts.ts',
      '--baseline', baselinePath,
      '--next', nextPath,
      '--react-router', reactRouterPath,
      '--output', outputPath,
    ], { cwd: process.cwd() })).rejects.toMatchObject({
      stderr: expect.stringContaining('provenance'),
    });
  });

  it('refuses to select a renderer from clearly synthetic fixtures', async () => {
    const reportPath = join(process.cwd(), 'tests/fixtures/parity/renderer-report-pass.json');

    await expect(execFileAsync('npx', [
      'tsx',
      'tools/parity/src/select-renderer.ts',
      '--report', reportPath,
    ], { cwd: process.cwd() })).rejects.toMatchObject({
      stderr: expect.stringContaining('Synthetic renderer reports cannot select a renderer'),
    });
  });

  it('requires an explicit comparison-generated real-report marker', async () => {
    const root = await createRoot();
    const fixture = JSON.parse(await readFile(
      join(process.cwd(), 'tests/fixtures/parity/renderer-report-pass.json'),
      'utf8',
    )) as RendererSelectionReport;
    delete fixture.synthetic;
    const reportPath = join(root, 'unmarked.json');
    await writeFile(reportPath, JSON.stringify(fixture));

    await expect(execFileAsync('npx', [
      'tsx',
      'tools/parity/src/select-renderer.ts',
      '--report', reportPath,
    ], { cwd: process.cwd() })).rejects.toMatchObject({
      stderr: expect.stringContaining('Only comparison-generated real renderer reports can select a renderer'),
    });
  });

  it('refuses a real-marked report with no three-build artifact evidence', async () => {
    const root = await createRoot();
    const fixture = JSON.parse(await readFile(
      join(process.cwd(), 'tests/fixtures/parity/renderer-report-pass.json'),
      'utf8',
    )) as RendererSelectionReport;
    fixture.synthetic = false;
    fixture.candidates.next.captureEvidence.provenance.synthetic = false;
    fixture.candidates.reactRouter.captureEvidence.provenance.synthetic = false;
    fixture.candidates.next.buildArtifactHashes = [];
    fixture.candidates.reactRouter.buildArtifactHashes = [];
    const reportPath = join(root, 'missing-build-evidence.json');
    await writeFile(reportPath, JSON.stringify(fixture));

    await expect(execFileAsync('npx', [
      'tsx',
      'tools/parity/src/select-renderer.ts',
      '--report', reportPath,
    ], { cwd: process.cwd() })).rejects.toMatchObject({
      stderr: expect.stringContaining('three clean builds'),
    });
  });
});
