import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateRelease,
  buildPublicRelease,
  prepareActiveRelease,
  type BuildPublicReleaseResult,
} from '../../../packages/content/src/release/build-release';
import { readActiveRelease } from '../../../packages/content/src/release/read-release';
import { writeReleaseFixture } from '../../../packages/content/test/helpers/release-fixture';
import { buildStaticExport } from '../build-static-export';
import {
  PUBLIC_RELEASE_BINDING_ENV,
  readBoundActiveRelease,
} from '../release-binding';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function activate(releasesRoot: string, release: BuildPublicReleaseResult): Promise<void> {
  const prepared = await prepareActiveRelease(releasesRoot, {
    releaseId: release.releaseId,
    path: release.releaseId,
  });
  await activateRelease(prepared);
}

async function releasePair() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'beyondwin-next-export-'));
  temporaryRoots.push(repositoryRoot);
  const releasesRoot = join(repositoryRoot, 'build/public-releases');
  const firstSource = join(repositoryRoot, 'first-source');
  const secondSource = join(repositoryRoot, 'second-source');
  const spikeRoot = join(repositoryRoot, 'spikes/site-next');
  await Promise.all([
    writeReleaseFixture(firstSource, { title: 'First bound release' }),
    writeReleaseFixture(secondSource, { title: 'Second swapped release' }),
    mkdir(spikeRoot, { recursive: true }),
  ]);
  const first = await buildPublicRelease({ root: firstSource, releasesRoot, activate: false });
  const second = await buildPublicRelease({ root: secondSource, releasesRoot, activate: false });
  await activate(releasesRoot, first);
  return { repositoryRoot, releasesRoot, spikeRoot, first, second };
}

describe('fail-closed Next static export orchestration', () => {
  it('rejects an active pointer swap inside the prerender instead of accepting mismatched assets', async () => {
    const fixture = await releasePair();

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async ({ environment }) => {
        const binding = environment[PUBLIC_RELEASE_BINDING_ENV];
        if (!binding) throw new Error('build did not bind verified release evidence');
        expect((await readBoundActiveRelease(fixture.releasesRoot, binding)).pointer.releaseId)
          .toBe(fixture.first.releaseId);
        await mkdir(join(fixture.spikeRoot, 'out/assets'), { recursive: true });
        await writeFile(join(fixture.spikeRoot, 'out/assets/mismatched.txt'), 'unbound export asset');
        await activate(fixture.releasesRoot, fixture.second);
      },
    })).rejects.toThrow(/bound public release changed|release evidence mismatch/iu);
    await expect(access(join(fixture.spikeRoot, 'out/assets'))).rejects.toThrow();
  }, 30_000);

  it('rejects an asset mutation after prerender before copying any release assets', async () => {
    const fixture = await releasePair();
    const active = await readActiveRelease(fixture.releasesRoot);
    const asset = Object.values(active.manifest.assets)[0];
    const assetPath = asset?.fallback.src;
    if (!assetPath) throw new Error('fixture has no verified release asset');

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async ({ environment }) => {
        const binding = environment[PUBLIC_RELEASE_BINDING_ENV];
        if (!binding) throw new Error('build did not bind verified release evidence');
        await readBoundActiveRelease(fixture.releasesRoot, binding);
        await mkdir(join(fixture.spikeRoot, 'out'), { recursive: true });
        await writeFile(join(fixture.spikeRoot, 'out/index.html'), '<h1>first release prerender</h1>');
        await writeFile(join(active.releasePath, assetPath.slice(1)), 'mutated after prerender');
      },
    })).rejects.toThrow(/checksum mismatch|release evidence mismatch/iu);
    await expect(access(join(fixture.spikeRoot, 'out/assets'))).rejects.toThrow();
  }, 30_000);
});
