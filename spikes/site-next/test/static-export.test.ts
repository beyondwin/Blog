import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

async function stagedOutputs(spikeRoot: string): Promise<string[]> {
  const stagingParent = join(spikeRoot, '.next');
  const entries = await readdir(stagingParent, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('export-stage-'))
    .map((entry) => join(stagingParent, entry.name, 'out'))
    .sort();
}

async function firstVerifiedAssetPath(releasesRoot: string): Promise<string> {
  const active = await readActiveRelease(releasesRoot);
  const assetPath = Object.values(active.manifest.assets)[0]?.fallback.src;
  if (!assetPath) throw new Error('fixture has no verified release asset');
  return assetPath.slice(1);
}

describe('fail-closed Next static export orchestration', () => {
  it('rejects a symlinked output root without deleting external assets through it', async () => {
    const fixture = await releasePair();
    const externalRoot = join(fixture.repositoryRoot, 'external-output');
    const victim = join(externalRoot, 'assets/victim.txt');
    const sentinel = Buffer.from('external sentinel must survive cleanup');
    await mkdir(join(externalRoot, 'assets'), { recursive: true });
    await writeFile(victim, sentinel);
    await symlink(externalRoot, join(fixture.spikeRoot, 'out'), 'dir');

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {},
    })).rejects.toThrow(/Next output root must be a real directory/iu);
    expect(await readFile(victim)).toEqual(sentinel);
    expect(await readdir(externalRoot, { recursive: true })).toEqual(['assets', 'assets/victim.txt']);
    expect((await lstat(join(fixture.spikeRoot, 'out'))).isSymbolicLink()).toBe(true);
  }, 30_000);

  it('leaves a symlinked output assets entry and its external target untouched', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    const externalAssets = join(fixture.repositoryRoot, 'external-assets');
    const victim = join(externalAssets, 'victim.txt');
    const sentinel = Buffer.from('external assets symlink target must survive cleanup');
    await Promise.all([
      mkdir(out, { recursive: true }),
      mkdir(externalAssets, { recursive: true }),
    ]);
    await writeFile(victim, sentinel);
    await symlink(externalAssets, join(out, 'assets'), 'dir');

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {},
    })).rejects.toThrow(/Existing exported assets root must be a real directory/iu);
    expect(await readFile(victim)).toEqual(sentinel);
    expect(await readdir(externalAssets)).toEqual(['victim.txt']);
    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect(stagedOutput).toBeDefined();
    expect((await lstat(join(stagedOutput!, 'assets'))).isSymbolicLink()).toBe(true);
  }, 30_000);

  it('does not traverse an output parent replaced between validation and cleanup', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    const parkedOut = join(fixture.spikeRoot, 'parked-out');
    const externalRoot = join(fixture.repositoryRoot, 'replacement-target');
    const victim = join(externalRoot, 'assets/victim.txt');
    const sentinel = Buffer.from('replacement target must survive cleanup');
    await Promise.all([
      mkdir(join(out, 'assets'), { recursive: true }),
      mkdir(join(externalRoot, 'assets'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(out, 'assets/generated.txt'), 'replace this owned output'),
      writeFile(victim, sentinel),
    ]);

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        expect((await lstat(out)).isDirectory()).toBe(true);
        expect(await realpath(out)).toMatch(/\/spikes\/site-next\/out$/u);
        await rename(out, parkedOut);
        await symlink(externalRoot, out, 'dir');
        throw new Error('fake prerender failed after output replacement');
      },
    })).rejects.toThrow('fake prerender failed after output replacement');
    expect(await readFile(victim)).toEqual(sentinel);
    expect(await readdir(externalRoot, { recursive: true })).toEqual(['assets', 'assets/victim.txt']);
    expect((await lstat(out)).isSymbolicLink()).toBe(true);
  }, 30_000);

  it('does not mutate a replacement installed after final failed-stage validation', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    const externalRoot = join(fixture.repositoryRoot, 'post-validation-target');
    const victim = join(externalRoot, 'assets/victim.txt');
    const sentinel = Buffer.from('post-validation replacement must survive cleanup');
    await mkdir(join(externalRoot, 'assets'), { recursive: true });
    await writeFile(victim, sentinel);

    let hookCalls = 0;
    const options = {
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(join(out, 'assets'), { recursive: true });
        await writeFile(join(out, 'assets/mismatched.txt'), 'unverified prerender output');
        await activate(fixture.releasesRoot, fixture.second);
      },
      beforeFailedStagingRetention: async ({ stagedOutput }: { stagedOutput: string }) => {
        hookCalls += 1;
        await rename(stagedOutput, join(stagedOutput, '..', 'parked-after-validation'));
        await symlink(externalRoot, stagedOutput, 'dir');
      },
    } as Parameters<typeof buildStaticExport>[0] & {
      beforeFailedStagingRetention: (context: { stagedOutput: string }) => Promise<void>;
    };

    await expect(buildStaticExport(options)).rejects.toThrow(/bound public release changed|release evidence mismatch/iu);
    expect(hookCalls).toBe(1);
    expect(await readFile(victim)).toEqual(sentinel);
    expect(await readdir(externalRoot, { recursive: true })).toEqual(['assets', 'assets/victim.txt']);
    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect(stagedOutput).toBeDefined();
    expect((await lstat(stagedOutput!)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(stagedOutput!, '..', 'parked-after-validation/assets/mismatched.txt'), 'utf8'))
      .toBe('unverified prerender output');
  }, 30_000);

  it('rejects untrusted pre-existing assets instead of accepting them as this build', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(join(out, 'assets'), { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>candidate output</h1>');
        await writeFile(join(out, 'assets/untrusted.txt'), 'not verified by the active release');
      },
    })).rejects.toThrow(/existing exported assets are untrusted/iu);

    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect(stagedOutput).toBeDefined();
    expect(await readFile(join(stagedOutput!, 'assets/untrusted.txt'), 'utf8'))
      .toBe('not verified by the active release');
  }, 30_000);

  it('publishes only the successfully verified staged output and assets', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    let publicationHookCalls = 0;
    const options = {
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(out, { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedOutput }: { stagedOutput: string }) => {
        publicationHookCalls += 1;
        await expect(access(out)).rejects.toThrow();
        expect(await readFile(join(stagedOutput, 'index.html'), 'utf8'))
          .toBe('<h1>verified candidate output</h1>');
      },
    } as Parameters<typeof buildStaticExport>[0] & {
      beforeVerifiedStagingPublication: (context: { stagedOutput: string }) => Promise<void>;
    };
    await buildStaticExport(options);

    expect(publicationHookCalls).toBe(1);
    expect(await readFile(join(out, 'index.html'), 'utf8')).toBe('<h1>verified candidate output</h1>');
    const active = await readActiveRelease(fixture.releasesRoot);
    const asset = Object.values(active.manifest.assets)[0]?.fallback;
    if (!asset) throw new Error('fixture has no verified release asset');
    expect(await readFile(join(out, asset.src.slice(1))))
      .toEqual(await readFile(join(active.releasePath, asset.src.slice(1))));
    const [publishedStagePath] = await stagedOutputs(fixture.spikeRoot);
    expect(publishedStagePath).toBeDefined();
    await expect(access(publishedStagePath!)).rejects.toThrow();
    expect(await readdir(join(publishedStagePath!, '..'))).toEqual([]);
  }, 30_000);

  it('refuses publication when verified staging gains an extra asset', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(out, { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedOutput }) => {
        await writeFile(join(stagedOutput, 'assets/unverified-extra.bin'), 'not in the verified release');
      },
    })).rejects.toThrow();

    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect(await readFile(join(stagedOutput!, 'assets/unverified-extra.bin'), 'utf8'))
      .toBe('not in the verified release');
  }, 30_000);

  it('refuses publication when verified staging asset bytes change', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    const assetPath = await firstVerifiedAssetPath(fixture.releasesRoot);

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(out, { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedOutput }) => {
        await writeFile(join(stagedOutput, assetPath), 'changed after verification');
      },
    })).rejects.toThrow();

    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect(await readFile(join(stagedOutput!, assetPath), 'utf8')).toBe('changed after verification');
  }, 30_000);

  it('refuses publication when a verified staging asset disappears', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    const assetPath = await firstVerifiedAssetPath(fixture.releasesRoot);

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(out, { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedOutput }) => {
        await rm(join(stagedOutput, assetPath));
      },
    })).rejects.toThrow();

    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    await expect(access(join(stagedOutput!, assetPath))).rejects.toThrow();
  }, 30_000);

  it('refuses publication when a verified staging asset becomes a symlink', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');
    const assetPath = await firstVerifiedAssetPath(fixture.releasesRoot);
    const externalTarget = join(fixture.repositoryRoot, 'external-publication-target');
    const sentinel = Buffer.from('external publication target must stay untouched');
    await writeFile(externalTarget, sentinel);

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(out, { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedOutput }) => {
        const stagedAsset = join(stagedOutput, assetPath);
        await rm(stagedAsset);
        await symlink(externalTarget, stagedAsset, 'file');
      },
    })).rejects.toThrow();

    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect((await lstat(join(stagedOutput!, assetPath))).isSymbolicLink()).toBe(true);
    expect(await readFile(externalTarget)).toEqual(sentinel);
  }, 30_000);

  it('refuses publication if the private staging root loses its restrictive mode', async () => {
    const fixture = await releasePair();
    const out = join(fixture.spikeRoot, 'out');

    await expect(buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runNextBuild: async () => {
        await mkdir(out, { recursive: true });
        await writeFile(join(out, 'index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedOutput }) => {
        await chmod(dirname(stagedOutput), 0o755);
      },
    })).rejects.toThrow();

    await expect(access(out)).rejects.toThrow();
    const [stagedOutput] = await stagedOutputs(fixture.spikeRoot);
    expect((await lstat(dirname(stagedOutput!))).mode & 0o777).toBe(0o755);
  }, 30_000);

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
