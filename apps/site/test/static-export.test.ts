import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateRelease,
  buildPublicRelease,
  prepareActiveRelease,
  type BuildPublicReleaseResult,
} from '../../../packages/content/src/release/build-release';
import { readActiveRelease } from '../../../packages/content/src/release/read-release';
import { writeReleaseFixture } from '../../../packages/content/test/helpers/release-fixture';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function candidateModule<T>(relativePath: string): Promise<T> {
  const moduleUrl = pathToFileURL(join(import.meta.dirname, '..', relativePath)).href;
  return import(/* @vite-ignore */ moduleUrl) as Promise<T>;
}

async function activate(releasesRoot: string, release: BuildPublicReleaseResult): Promise<void> {
  const prepared = await prepareActiveRelease(releasesRoot, {
    releaseId: release.releaseId,
    path: release.releaseId,
  });
  await activateRelease(prepared);
}

async function releasePair() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'beyondwin-react-router-export-'));
  temporaryRoots.push(repositoryRoot);
  const releasesRoot = join(repositoryRoot, 'build/public-releases');
  const firstSource = join(repositoryRoot, 'first-source');
  const secondSource = join(repositoryRoot, 'second-source');
  const spikeRoot = join(repositoryRoot, 'spikes/site-react-router');
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

async function retainedBuilds(spikeRoot: string): Promise<string[]> {
  const root = join(spikeRoot, '.react-router');
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('export-stage-'))
    .map((entry) => join(root, entry.name, 'build'))
    .sort();
}

describe('fail-closed React Router static export orchestration', () => {
  it('binds prerender to one verified Task-4 release and refuses an active pointer swap', async () => {
    const fixture = await releasePair();
    const buildModule = await candidateModule<any>('build-static-export.ts');
    const bindingModule = await candidateModule<any>('release-binding.ts');

    await expect(buildModule.buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runReactRouterBuild: async ({ environment }: { environment: NodeJS.ProcessEnv }) => {
        const binding = environment[bindingModule.PUBLIC_RELEASE_BINDING_ENV];
        await bindingModule.readBoundActiveRelease(fixture.releasesRoot, binding);
        await mkdir(join(fixture.spikeRoot, 'build/client'), { recursive: true });
        await writeFile(join(fixture.spikeRoot, 'build/client/index.html'), '<h1>first release prerender</h1>');
        await activate(fixture.releasesRoot, fixture.second);
      },
    })).rejects.toThrow(/bound public release changed|release evidence mismatch/iu);
    await expect(access(join(fixture.spikeRoot, 'build/client'))).rejects.toThrow();
  }, 30_000);

  it('publishes only manifest-inventory assets while retaining framework-prerendered canonical documents', async () => {
    const fixture = await releasePair();
    const buildModule = await candidateModule<any>('build-static-export.ts');

    await buildModule.buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runReactRouterBuild: async () => {
      await mkdir(join(fixture.spikeRoot, 'build/client/assets'), { recursive: true });
      await mkdir(join(fixture.spikeRoot, 'build/client/thoughts/why-i-read-in-the-ai-era'), { recursive: true });
      await mkdir(join(fixture.spikeRoot, 'build/client/memory/map'), { recursive: true });
      await mkdir(join(fixture.spikeRoot, 'build/client/search'), { recursive: true });
      await writeFile(join(fixture.spikeRoot, 'build/client/index.html'), '<h1>verified candidate output</h1>');
      await writeFile(
        join(fixture.spikeRoot, 'build/client/thoughts/why-i-read-in-the-ai-era/index.html'),
        '<a href="/thoughts/why-i-read-in-the-ai-era/">canonical thought</a>',
      );
        await writeFile(
          join(fixture.spikeRoot, 'build/client/memory/map/index.html'),
          '<!doctype html><meta http-equiv="refresh" content="2;url=/memory/"><a href="/memory/">Redirect</a>',
        );
        await writeFile(join(fixture.spikeRoot, 'build/client/__spa-fallback.html'), '<h1>static fallback</h1>');
        await writeFile(join(fixture.spikeRoot, 'build/client/assets/root-generated.js'), 'framework asset');
        await writeFile(
          join(fixture.spikeRoot, 'build/client/search/index.html'),
          '<main><form action="/search/" method="get"><input name="q" maxlength="120"></form></main>',
        );
        await writeFile(
          join(fixture.spikeRoot, 'build/client/search/_.data'),
          JSON.stringify({ contentReleaseId: 'content-id', answerReleaseId: 'answer-id' }),
        );
      },
    });

    const active = await readActiveRelease(fixture.releasesRoot);
    const asset = Object.values(active.manifest.assets)[0]?.fallback;
    if (!asset) throw new Error('fixture has no verified release asset');
    expect(await readFile(join(fixture.spikeRoot, 'build/client', asset.src.slice(1))))
      .toEqual(await readFile(join(active.releasePath, asset.src.slice(1))));
    expect(await readFile(join(fixture.spikeRoot, 'build/client/__spa-fallback.html'), 'utf8'))
      .toContain('static fallback');
    expect(await readFile(join(fixture.spikeRoot, 'build/client/assets/root-generated.js'), 'utf8'))
      .toBe('framework asset');
    const searchData = await readFile(join(fixture.spikeRoot, 'build/client/search/_.data'), 'utf8');
    expect(JSON.parse(searchData)).toEqual({
      contentReleaseId: 'content-id',
      answerReleaseId: 'answer-id',
    });
    expect(searchData).not.toMatch(/fixture|rollback|claims|evidence|memory\/|\/Users\//iu);
    expect(await readFile(
      join(fixture.spikeRoot, 'build/client/thoughts/why-i-read-in-the-ai-era/index.html'),
      'utf8',
    )).toContain('canonical thought');
    const memoryMap = await readFile(
      join(fixture.spikeRoot, 'build/client/memory/map/index.html'),
      'utf8',
    );
    expect(memoryMap).toContain('<link rel="canonical" href="https://form-thought.local.invalid/memory/">');
    expect(memoryMap).toContain('<meta property="og:url" content="https://form-thought.local.invalid/memory/">');
    const sitemap = await readFile(join(fixture.spikeRoot, 'build/client/sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://form-thought.local.invalid/</loc>');
    expect(sitemap).toContain('<loc>https://form-thought.local.invalid/articles/public-fixture/</loc>');
    expect(sitemap).not.toContain('thoughts/why-i-read-in-the-ai-era');
    expect(await readFile(join(fixture.spikeRoot, 'build/client/robots.txt'), 'utf8'))
      .toContain('Sitemap: https://form-thought.local.invalid/sitemap.xml');
    expect(await readFile(join(fixture.spikeRoot, 'build/client/404.html'), 'utf8'))
      .toMatch(/FORM &amp; THOUGHT|FORM & THOUGHT/u);
    expect(await readFile(join(fixture.spikeRoot, 'build/client/_headers'), 'utf8'))
      .toMatch(/Content-Security-Policy:[^\n]+\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff/u);
  }, 30_000);

  it('refuses publication when a verified staged asset changes after copy', async () => {
    const fixture = await releasePair();
    const buildModule = await candidateModule<any>('build-static-export.ts');
    const active = await readActiveRelease(fixture.releasesRoot);
    const asset = Object.values(active.manifest.assets)[0]?.fallback;
    if (!asset) throw new Error('fixture has no verified release asset');

    await expect(buildModule.buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runReactRouterBuild: async () => {
        await mkdir(join(fixture.spikeRoot, 'build/client'), { recursive: true });
        await writeFile(join(fixture.spikeRoot, 'build/client/index.html'), '<h1>verified candidate output</h1>');
      },
      beforeVerifiedStagingPublication: async ({ stagedClient }: { stagedClient: string }) => {
        await writeFile(join(stagedClient, asset.src.slice(1)), 'changed after verification');
      },
    })).rejects.toThrow(/checksum|changed|inventory/iu);
    await expect(access(join(fixture.spikeRoot, 'build/client'))).rejects.toThrow();
  }, 30_000);

  it('retains framework failure output outside the canonical build path', async () => {
    const fixture = await releasePair();
    const buildModule = await candidateModule<any>('build-static-export.ts');

    await expect(buildModule.buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runReactRouterBuild: async () => {
        await mkdir(join(fixture.spikeRoot, 'build/client'), { recursive: true });
        await writeFile(join(fixture.spikeRoot, 'build/client/partial.html'), 'failed framework output');
        throw new Error('simulated React Router build failure');
      },
    })).rejects.toThrow('simulated React Router build failure');

    await expect(access(join(fixture.spikeRoot, 'build'))).rejects.toThrow();
    const builds = await retainedBuilds(fixture.spikeRoot);
    expect(builds).toHaveLength(1);
    expect(await readFile(join(builds[0]!, 'client/partial.html'), 'utf8')).toBe('failed framework output');
  }, 30_000);

  it('retains a previous owned build without deletion before publishing the new build', async () => {
    const fixture = await releasePair();
    const buildModule = await candidateModule<any>('build-static-export.ts');
    await mkdir(join(fixture.spikeRoot, 'build/client'), { recursive: true });
    await writeFile(join(fixture.spikeRoot, 'build/client/previous.html'), 'previous canonical output');

    await buildModule.buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runReactRouterBuild: async () => {
        await expect(access(join(fixture.spikeRoot, 'build'))).rejects.toThrow();
        await mkdir(join(fixture.spikeRoot, 'build/client'), { recursive: true });
        await writeFile(join(fixture.spikeRoot, 'build/client/index.html'), '<h1>replacement output</h1>');
      },
    });

    expect(await readFile(join(fixture.spikeRoot, 'build/client/index.html'), 'utf8'))
      .toContain('replacement output');
    const builds = await retainedBuilds(fixture.spikeRoot);
    expect(builds).toHaveLength(2);
    const retainedContents = await Promise.all(builds.map(async (build) => (
      readFile(join(build, 'client/previous.html'), 'utf8').catch(() => '')
    )));
    expect(retainedContents).toContain('previous canonical output');
  }, 30_000);

  it('rejects a symlinked previous build without touching its external target', async () => {
    const fixture = await releasePair();
    const buildModule = await candidateModule<any>('build-static-export.ts');
    const external = join(fixture.repositoryRoot, 'external-build');
    await mkdir(join(external, 'client'), { recursive: true });
    await writeFile(join(external, 'client/victim.html'), 'external target');
    await symlink(external, join(fixture.spikeRoot, 'build'), 'dir');

    await expect(buildModule.buildStaticExport({
      repositoryRoot: fixture.repositoryRoot,
      spikeRoot: fixture.spikeRoot,
      runReactRouterBuild: async () => {
        throw new Error('framework build must not run');
      },
    })).rejects.toThrow(/output root must be a real directory/iu);
    expect(await readFile(join(external, 'client/victim.html'), 'utf8')).toBe('external target');
  }, 30_000);
});
