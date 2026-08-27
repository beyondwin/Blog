import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { RendererCaptureReport } from '../src/compare-contracts';
import { hashOutputArtifact } from '../src/capture-renderer';
import { RENDERER_LAYOUTS, rendererSourceClosureHashAtCommit } from '../src/renderer-layouts';
import { selectRendererFromCaptures } from '../src/select-renderer';
import type { RendererSelectionReport } from '../src/select-renderer';
import {
  activateRelease,
  buildPublicRelease,
  prepareActiveRelease,
} from '../../../packages/content/src/release/build-release';
import { writeReleaseFixture } from '../../../packages/content/test/helpers/release-fixture';

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

async function gitCommit(root: string, message: string): Promise<string> {
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', [
    '-c', 'user.name=Renderer Test',
    '-c', 'user.email=renderer@example.invalid',
    'commit', '-m', message,
  ], { cwd: root });
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
}

async function fileHash(path: string): Promise<string> {
  return `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
}

async function harnessHash(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of [
    'tools/parity/src/capture-renderer.ts',
    'tools/parity/src/compare-contracts.ts',
    'tools/parity/src/measure-browser.ts',
    'tools/parity/src/renderer-layouts.ts',
    'tools/parity/src/select-renderer.ts',
    'tools/parity/src/serve-static.ts',
  ]) {
    const bytes = await readFile(join(root, path));
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
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

    await execFileAsync('npx', [
      'tsx',
      'tools/parity/src/compare-contracts.ts',
      '--baseline', baselinePath,
      '--next', nextPath,
      '--react-router', reactRouterPath,
      '--output', outputPath,
    ], { cwd: process.cwd() }).then(
      () => { throw new Error('Comparison unexpectedly accepted unproven captures'); },
      (error: { stderr?: string }) => {
        expect(error.stderr).toMatch(
          /provenance is missing|renderer manifest hash|outside the repository evidence root|ENOENT|no such file or directory/iu,
        );
      },
    );
  }, 30_000);

  it('refuses a forged real-marked summary and requires all three strict raw captures', async () => {
    const root = await createRoot();
    const fixture = JSON.parse(await readFile(
      join(process.cwd(), 'tests/fixtures/parity/renderer-report-pass.json'),
      'utf8',
    )) as RendererSelectionReport;
    fixture.synthetic = false;
    fixture.candidates.next.captureEvidence.provenance.synthetic = false;
    fixture.candidates.reactRouter.captureEvidence.provenance.synthetic = false;
    const reportPath = join(root, 'forged-real-summary.json');
    await writeFile(reportPath, JSON.stringify(fixture));

    await expect(execFileAsync('npx', [
      'tsx',
      'tools/parity/src/select-renderer.ts',
      '--report', reportPath,
    ], { cwd: process.cwd() })).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Usage: select-renderer.ts --baseline <astro-capture.json> --next <next-capture.json> --react-router <react-router-capture.json>',
      ),
    });
  }, 30_000);

  it('recomputes from committed raw captures and rejects dirty or stale current evidence', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'tools/parity'), { recursive: true });
    await cp(join(process.cwd(), 'tools/parity/src'), join(root, 'tools/parity/src'), { recursive: true });
    for (const renderer of ['astro', 'next', 'react-router'] as const) {
      const layout = RENDERER_LAYOUTS[renderer];
      await mkdir(join(root, layout.rendererRoot), { recursive: true });
      await writeFile(join(root, layout.rendererManifest), JSON.stringify({
        private: true,
        scripts: { [layout.buildScript]: 'node build.mjs' },
      }));
      await mkdir(join(root, layout.outputRoot), { recursive: true });
      await writeFile(join(root, layout.outputRoot, 'index.html'), `<h1>${renderer}</h1>`);
    }
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src/page.astro'), '<h1>captured Astro source</h1>');
    await writeReleaseFixture(root);
    await writeFile(join(root, 'astro.config.mjs'), 'export default {};\n');
    await writeFile(join(root, 'package-lock.json'), '{}\n');
    await mkdir(join(root, 'packages/content/src'), { recursive: true });
    await writeFile(join(root, 'packages/content/package.json'), '{"private":true}\n');
    await writeFile(join(root, 'packages/content/src/shared.ts'), 'export const shared = 1;\n');
    await writeFile(join(root, '.gitignore'), [
      '/dist/',
      '/spikes/site-next/out/',
      '/spikes/site-next/.next/',
      '/spikes/site-react-router/build/',
      '/spikes/site-react-router/node_modules/.vite/',
      '/spikes/site-react-router/.react-router/',
      '/build/public-releases/',
      '',
    ].join('\n'));
    const initialRelease = await buildPublicRelease({ root });
    await execFileAsync('git', ['init'], { cwd: root });
    const sourceCommit = await gitCommit(root, 'source');
    const captureToolHash = await harnessHash(root);
    const baseline = JSON.parse(await readFile(
      join(process.cwd(), 'tests/fixtures/parity/astro-renderer-baseline.json'),
      'utf8',
    )) as RendererCaptureReport;
    const paths = {
      baseline: join(root, 'evidence/astro.json'),
      next: join(root, 'evidence/next.json'),
      reactRouter: join(root, 'evidence/react-router.json'),
    };
    await mkdir(join(root, 'evidence'));
    for (const [renderer, path] of [
      ['astro', paths.baseline],
      ['next', paths.next],
      ['react-router', paths.reactRouter],
    ] as const) {
      const layout = RENDERER_LAYOUTS[renderer];
      const report = structuredClone(baseline);
      const artifactHash = await hashOutputArtifact(join(root, layout.outputRoot));
      report.renderer = renderer;
      report.artifactHash = artifactHash;
      report.provenance = {
        synthetic: false,
        repositoryCommit: sourceCommit,
        rendererRoot: layout.rendererRoot,
        rendererManifest: layout.rendererManifest,
        rendererManifestHash: await fileHash(join(root, layout.rendererManifest)),
        buildCommand: `npm run ${layout.buildScript}`,
        outputRoot: layout.outputRoot,
        captureToolHash,
        buildEnvironmentVersion: 1,
        sourceClosureVersion: layout.sourceClosureVersion,
        sourceClosureHash: await rendererSourceClosureHashAtCommit(root, renderer, sourceCommit),
        publicRelease: renderer === 'astro'
          ? null
          : await import('../src/renderer-layouts').then(({ verifyRendererPublicReleaseInput }) => (
            verifyRendererPublicReleaseInput(root, renderer)
          )),
      };
      report.build.command = `npm run ${layout.buildScript}`;
      report.build.workingDirectory = layout.rendererRoot;
      report.build.clean.paths = [...layout.cleanRoots];
      report.build.samples = report.build.samples.map((sample) => ({
        ...sample,
        artifactHash,
        cleanedPaths: [...layout.cleanRoots],
      }));
      await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    }
    await gitCommit(root, 'evidence');

    await expect(selectRendererFromCaptures(paths, root)).resolves.toMatchObject({ blocked: true });

    const replacementSource = await createRoot();
    await writeReleaseFixture(replacementSource, { title: 'Replacement release' });
    await buildPublicRelease({
      root: replacementSource,
      releasesRoot: join(root, 'build/public-releases'),
    });
    await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(
      /verified public release.*changed|public release.*stale/iu,
    );
    await activateRelease(await prepareActiveRelease(join(root, 'build/public-releases'), {
      releaseId: initialRelease.releaseId,
      path: initialRelease.releaseId,
    }));

    await chmod(join(root, 'src/page.astro'), 0o755);
    await gitCommit(root, 'change Astro source mode');
    await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(/source closure|stale.*source/iu);
    await chmod(join(root, 'src/page.astro'), 0o644);
    await gitCommit(root, 'restore Astro source mode');

    for (const [relativePath, changed] of [
      ['src/page.astro', '<h1>changed after capture</h1>'],
      ['package-lock.json', '{"changed":true}\n'],
      ['astro.config.mjs', 'export default { changed: true };\n'],
      ['packages/content/src/shared.ts', 'export const shared = 2;\n'],
    ] as const) {
      const original = await readFile(join(root, relativePath), 'utf8');
      await writeFile(join(root, relativePath), changed);
      await gitCommit(root, `change ${relativePath}`);
      await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(/source closure|stale.*source/iu);
      await writeFile(join(root, relativePath), original);
      await gitCommit(root, `restore ${relativePath}`);
    }

    await writeFile(join(root, 'spikes/site-next/candidate-only.ts'), 'export const candidate = true;\n');
    await gitCommit(root, 'candidate-only follow-up');
    await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(/next.*source.*changed|stale.*source/iu);
    await rm(join(root, 'spikes/site-next/candidate-only.ts'));
    await gitCommit(root, 'restore candidate-only follow-up');

    await writeFile(join(root, 'dirty.txt'), 'uncommitted');
    await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(/clean committed evidence tree/iu);
    await rm(join(root, 'dirty.txt'));

    const changedSource = join(root, RENDERER_LAYOUTS.next.rendererRoot, 'source.ts');
    await writeFile(changedSource, 'export const changedAfterCapture = true;\n');
    await gitCommit(root, 'change candidate source');
    await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(/source.*changed|stale.*source/iu);
    await rm(changedSource);
    await gitCommit(root, 'restore candidate source');

    await writeFile(join(root, RENDERER_LAYOUTS.next.outputRoot, 'index.html'), '<h1>stale Next output</h1>');
    await expect(selectRendererFromCaptures(paths, root)).rejects.toThrow(/artifact hash no longer matches/iu);
  }, 90_000);

});
