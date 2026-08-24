import { execFile } from 'node:child_process';
import { access, chmod, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPublicRelease } from '../../../packages/content/src/release/build-release';
import { writeReleaseFixture } from '../../../packages/content/test/helpers/release-fixture';

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'beyondwin-renderer-boundary-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('renderer evidence boundaries', () => {
  it('clears only declared contained output and cache roots before every build sample', async () => {
    const root = await createRoot();
    const output = join(root, 'dist');
    const astroCache = join(root, '.astro');
    const cache = join(root, 'node_modules/.astro');
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'legacy:build': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const cache = join(process.cwd(), 'node_modules/.astro');
      const output = join(process.cwd(), 'dist');
      const statePath = join(cache, 'state.txt');
      const count = existsSync(statePath) ? Number(readFileSync(statePath, 'utf8')) + 1 : 1;
      mkdirSync(cache, { recursive: true });
      mkdirSync(output, { recursive: true });
      writeFileSync(statePath, String(count));
      writeFileSync(join(output, 'index.html'), '<h1>build ' + count + '</h1>');
    `);
    const module = await import('../src/capture-renderer');
    expect(module).toHaveProperty('runBuildSamples');
    const runBuildSamples = (module as typeof module & {
      runBuildSamples: (options: Record<string, unknown>) => Promise<{
        samples: Array<{ artifactHash: string; cleanedPaths: string[] }>;
      }>;
    }).runBuildSamples;

    const result = await runBuildSamples({
      repositoryRoot: root,
      rendererRoot: root,
      outputDirectory: output,
      cleanDirectories: [output, astroCache, cache],
      renderer: 'astro',
      buildScript: 'legacy:build',
      buildSamples: 3,
    });

    expect(new Set(result.samples.map((sample) => sample.artifactHash)).size).toBe(1);
    expect(result.samples.every((sample) => sample.cleanedPaths.length === 3)).toBe(true);
    expect(await readFile(join(cache, 'state.txt'), 'utf8')).toBe('1');
  });

  it('keeps an external sentinel when an allowlisted cache ancestor is a symlink', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const output = join(root, 'dist');
    const astroCache = join(root, '.astro');
    const cache = join(root, 'node_modules/.astro');
    const sentinel = join(outside, '.astro/sentinel.txt');
    await mkdir(join(outside, '.astro'));
    await writeFile(sentinel, 'must survive');
    await symlink(outside, join(root, 'node_modules'));
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'legacy:build': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
      writeFileSync(join(process.cwd(), 'dist/index.html'), '<h1>safe</h1>');
    `);
    const { runBuildSamples } = await import('../src/capture-renderer');
    const options = {
      repositoryRoot: root,
      rendererRoot: root,
      outputDirectory: output,
      cleanDirectories: [output, astroCache, cache],
      renderer: 'astro' as const,
      buildScript: 'legacy:build',
      buildSamples: 3,
    };

    await expect(runBuildSamples(options)).rejects.toThrow(/symlink|real path|outside/iu);
    expect(await readFile(sentinel, 'utf8')).toBe('must survive');
  });

  it('rejects missing, extra, aliased, and duplicate renderer clean roots', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'legacy:build': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
      writeFileSync(join(process.cwd(), 'dist/index.html'), '<h1>unsafe cache omission</h1>');
    `);
    const { runBuildSamples } = await import('../src/capture-renderer');
    const options = {
      repositoryRoot: root,
      rendererRoot: root,
      outputDirectory: join(root, 'dist'),
      renderer: 'astro' as const,
      buildScript: 'legacy:build',
      buildSamples: 3,
    };

    for (const cleanDirectories of [
      [join(root, 'dist')],
      [join(root, 'dist'), join(root, '.astro'), join(root, 'node_modules/.astro'), join(root, '.extra-cache')],
      [join(root, 'dist'), join(root, '.astro'), `${root}/node_modules/./.astro`],
      [join(root, 'dist'), join(root, '.astro'), join(root, 'node_modules/.astro'), join(root, 'node_modules/.astro')],
    ]) {
      await expect(runBuildSamples({ ...options, cleanDirectories })).rejects.toThrow(
        /canonical|clean roots|node_modules\/\.astro/iu,
      );
    }
  });

  it('publishes the exact approved clean roots for every renderer', async () => {
    const module = await import('../src/capture-renderer');

    expect(module).toHaveProperty('RENDERER_LAYOUTS');
    expect((module as typeof module & { RENDERER_LAYOUTS: unknown }).RENDERER_LAYOUTS).toEqual({
      astro: {
        rendererRoot: '.',
        rendererManifest: 'package.json',
        buildScript: 'legacy:build',
        outputRoot: 'dist',
        cleanRoots: ['dist', '.astro', 'node_modules/.astro'],
        sourceClosureVersion: 2,
        sourceClosure: expect.any(Array),
      },
      next: {
        rendererRoot: 'spikes/site-next',
        rendererManifest: 'spikes/site-next/package.json',
        buildScript: 'build',
        outputRoot: 'spikes/site-next/out',
        cleanRoots: ['spikes/site-next/out', 'spikes/site-next/.next'],
        sourceClosureVersion: 2,
        sourceClosure: expect.any(Array),
      },
      'react-router': {
        rendererRoot: 'spikes/site-react-router',
        rendererManifest: 'spikes/site-react-router/package.json',
        buildScript: 'build',
        outputRoot: 'spikes/site-react-router/build/client',
        cleanRoots: [
          'spikes/site-react-router/build',
          'spikes/site-react-router/node_modules/.vite',
          'spikes/site-react-router/.react-router',
        ],
        sourceClosureVersion: 2,
        sourceClosure: expect.any(Array),
      },
    });
  });

  it('refuses capture from a dirty source tree before any build runs', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'tools/parity'), { recursive: true });
    await cp(join(process.cwd(), 'tools/parity/src'), join(root, 'tools/parity/src'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'legacy:build': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      writeFileSync(join(process.cwd(), 'build-ran.txt'), 'unsafe');
      mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
      writeFileSync(join(process.cwd(), 'dist/index.html'), '<h1>unsafe</h1>');
    `);
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', [
      '-c', 'user.name=Renderer Test',
      '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'fixture',
    ], { cwd: root });
    await writeFile(join(root, 'dirty.txt'), 'uncommitted');
    const { captureRenderer } = await import('../src/capture-renderer');

    await expect(captureRenderer({
      repositoryRoot: root,
      rendererRoot: root,
      rendererManifest: join(root, 'package.json'),
      outputDirectory: join(root, 'dist'),
      cleanDirectories: [join(root, 'dist'), join(root, '.astro'), join(root, 'node_modules/.astro')],
      outputPath: join(root, 'capture.json'),
      renderer: 'astro',
      buildScript: 'legacy:build',
      buildSamples: 3,
      host: '127.0.0.1',
      port: 0,
    })).rejects.toThrow(/clean committed source tree/iu);
    await expect(access(join(root, 'build-ran.txt'))).rejects.toThrow();
  });

  it.each(['.env', 'ignored-source.env'])(
    'rejects ignored renderer input %s before any build runs',
    async (ignoredPath) => {
      const root = await createRoot();
      await mkdir(join(root, 'tools/parity'), { recursive: true });
      await cp(join(process.cwd(), 'tools/parity/src'), join(root, 'tools/parity/src'), { recursive: true });
      await writeFile(join(root, '.gitignore'), `${ignoredPath}\n/dist/\n/.astro/\n/node_modules/\n`);
      await writeFile(join(root, 'package.json'), JSON.stringify({
        private: true,
        scripts: { 'legacy:build': 'node build.mjs' },
      }));
      await writeFile(join(root, 'build.mjs'), `
        import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
        import { join } from 'node:path';
        readFileSync(join(process.cwd(), ${JSON.stringify(ignoredPath)}), 'utf8');
        writeFileSync(join(process.cwd(), 'build-ran.txt'), 'unsafe');
        mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
        writeFileSync(join(process.cwd(), 'dist/index.html'), '<h1>unsafe</h1>');
      `);
      await execFileAsync('git', ['init'], { cwd: root });
      await execFileAsync('git', ['add', '.'], { cwd: root });
      await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
        'commit', '-m', 'fixture'], { cwd: root });
      await writeFile(join(root, ignoredPath), 'untrusted build input');
      const { captureRenderer } = await import('../src/capture-renderer');

      await expect(captureRenderer({
        repositoryRoot: root,
        rendererRoot: root,
        rendererManifest: join(root, 'package.json'),
        outputDirectory: join(root, 'dist'),
        cleanDirectories: [join(root, 'dist'), join(root, '.astro'), join(root, 'node_modules/.astro')],
        outputPath: join(root, 'capture.json'),
        renderer: 'astro',
        buildScript: 'legacy:build',
        buildSamples: 3,
        host: '127.0.0.1',
        port: 0,
      })).rejects.toThrow(/ignored renderer input/iu);
      await expect(access(join(root, 'build-ran.txt'))).rejects.toThrow();
    },
  );

  it('allows only known dependency, canonical output/cache, and controller scratch roots', async () => {
    const root = await createRoot();
    await writeFile(join(root, '.gitignore'), [
      '/node_modules/', '/dist/', '/.astro/', '/.superpowers/', '/build/public-releases/', '',
    ].join('\n'));
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.gitignore'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'fixture'], { cwd: root });
    for (const path of [
      'node_modules/pkg/index.js', 'dist/index.html', '.astro/cache.json',
      '.superpowers/report.md', 'build/public-releases/manifest.json',
    ]) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), 'allowed');
    }
    const { assertRendererRepositoryState } = await import('../src/renderer-layouts');

    await expect(assertRendererRepositoryState(root, 'capture')).resolves.toMatch(/^[a-f0-9]{40}$/u);
  });

  it('rejects an ignored unverified public release before a candidate build can consume it', async () => {
    const root = await createRoot();
    await writeFile(join(root, '.gitignore'), '/build/public-releases/\n');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.gitignore'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'fixture'], { cwd: root });
    await mkdir(join(root, 'build/public-releases'), { recursive: true });
    await writeFile(join(root, 'build/public-releases/unbound-input.json'), '{"release":"unverified"}\n');
    const { assertRendererRepositoryState } = await import('../src/renderer-layouts');
    const assertCandidateState = assertRendererRepositoryState as unknown as (
      repositoryRoot: string,
      purpose: 'capture' | 'selection',
      renderer: 'next',
    ) => Promise<string>;

    await expect(assertCandidateState(root, 'capture', 'next')).rejects.toThrow(
      /public release|active release|verified release/iu,
    );
  });

  it('binds both candidates to the same verified active immutable public release', async () => {
    const root = await createRoot();
    await writeReleaseFixture(root);
    const built = await buildPublicRelease({ root });
    const module = await import('../src/renderer-layouts');
    expect(module).toHaveProperty('verifyRendererPublicReleaseInput');
    const verify = (module as typeof module & {
      verifyRendererPublicReleaseInput: (
        repositoryRoot: string,
        renderer: 'next' | 'react-router',
      ) => Promise<Record<string, unknown>>;
    }).verifyRendererPublicReleaseInput;

    const next = await verify(root, 'next');
    const reactRouter = await verify(root, 'react-router');

    expect(next).toEqual(reactRouter);
    expect(next).toMatchObject({
      version: 1,
      verificationPolicyVersion: 1,
      root: 'build/public-releases',
      releaseId: built.releaseId,
      rendererVersion: built.manifest.rendererVersion,
      activePointer: { releaseId: built.releaseId, path: built.releaseId },
      manifestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      artifactHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      activePointerHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    });
  });

  it('rejects a candidate release after an ignored immutable artifact is modified', async () => {
    const root = await createRoot();
    await writeReleaseFixture(root);
    const built = await buildPublicRelease({ root });
    const module = await import('../src/renderer-layouts');
    expect(module).toHaveProperty('verifyRendererPublicReleaseInput');
    const verify = (module as typeof module & {
      verifyRendererPublicReleaseInput: (
        repositoryRoot: string,
        renderer: 'next',
      ) => Promise<Record<string, unknown>>;
    }).verifyRendererPublicReleaseInput;
    await writeFile(join(built.releasePath, 'manifest.json'), '{"modified":true}\n');

    await expect(verify(root, 'next')).rejects.toThrow(/release|manifest|verify/iu);
  });

  it('rejects a candidate build that replaces its verified active release input', async () => {
    const root = await createRoot();
    await writeReleaseFixture(root, { title: 'First release' });
    await buildPublicRelease({ root });
    await writeReleaseFixture(root, { title: 'Second release' });
    const second = await buildPublicRelease({ root, activate: false });
    const rendererRoot = join(root, 'spikes/site-next');
    await mkdir(rendererRoot, { recursive: true });
    await writeFile(join(rendererRoot, 'package.json'), JSON.stringify({
      private: true,
      scripts: { build: 'node build.mjs' },
    }));
    await writeFile(join(rendererRoot, 'build.mjs'), `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const repositoryRoot = ${JSON.stringify(root)};
      writeFileSync(join(repositoryRoot, 'build/public-releases/active.json'), ${JSON.stringify(`${JSON.stringify({
        releaseId: second.releaseId,
        path: second.releaseId,
      })}\n`)});
      mkdirSync(join(process.cwd(), 'out'), { recursive: true });
      writeFileSync(join(process.cwd(), 'out/index.html'), '<h1>candidate</h1>');
    `);
    const { runBuildSamples } = await import('../src/capture-renderer');
    const { verifyRendererPublicReleaseInput } = await import('../src/renderer-layouts');
    const expectedPublicRelease = await verifyRendererPublicReleaseInput(root, 'next');

    await expect(runBuildSamples({
      repositoryRoot: root,
      rendererRoot,
      outputDirectory: join(rendererRoot, 'out'),
      cleanDirectories: [join(rendererRoot, 'out'), join(rendererRoot, '.next')],
      renderer: 'next',
      buildScript: 'build',
      buildSamples: 3,
      expectedPublicRelease,
    } as never)).rejects.toThrow(/public release.*changed|release evidence|active release/iu);
  });

  it('changes the source closure when a regular file becomes a symlink to identical blob bytes', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/entry'), 'target');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'regular'], { cwd: root });
    const regularCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const { rendererSourceClosureHashAtCommit } = await import('../src/renderer-layouts');
    const regularHash = await rendererSourceClosureHashAtCommit(root, 'astro', regularCommit);

    await rm(join(root, 'src/entry'));
    await symlink('target', join(root, 'src/entry'));
    await execFileAsync('git', ['add', 'src/entry'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'symlink'], { cwd: root });
    const symlinkCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    expect(await execFileAsync('git', ['rev-parse', `${regularCommit}:src/entry`], { cwd: root })
      .then(({ stdout }) => stdout.trim())).toBe(
      await execFileAsync('git', ['rev-parse', `${symlinkCommit}:src/entry`], { cwd: root })
        .then(({ stdout }) => stdout.trim()),
    );
    expect(await rendererSourceClosureHashAtCommit(root, 'astro', symlinkCommit)).not.toBe(regularHash);
  });

  it('changes the source closure when only the executable bit changes', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/script.sh'), '#!/bin/sh\nexit 0\n');
    await chmod(join(root, 'src/script.sh'), 0o644);
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'non-executable'], { cwd: root });
    const regularCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const { rendererSourceClosureHashAtCommit } = await import('../src/renderer-layouts');
    const regularHash = await rendererSourceClosureHashAtCommit(root, 'astro', regularCommit);

    await chmod(join(root, 'src/script.sh'), 0o755);
    await execFileAsync('git', ['add', 'src/script.sh'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'executable'], { cwd: root });
    const executableCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    expect(await rendererSourceClosureHashAtCommit(root, 'astro', executableCommit)).not.toBe(regularHash);
  });

  it('changes the source closure when a regular path becomes a tree', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/entry'), 'regular\n');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'regular path'], { cwd: root });
    const regularCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const { rendererSourceClosureHashAtCommit } = await import('../src/renderer-layouts');
    const regularHash = await rendererSourceClosureHashAtCommit(root, 'astro', regularCommit);

    await rm(join(root, 'src/entry'));
    await mkdir(join(root, 'src/entry'));
    await writeFile(join(root, 'src/entry/child'), 'tree child\n');
    await execFileAsync('git', ['add', '-A', 'src/entry'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'tree path'], { cwd: root });
    const treeCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    expect(await rendererSourceClosureHashAtCommit(root, 'astro', treeCommit)).not.toBe(regularHash);
  });

  it('does not couple one candidate closure to a sibling candidate tree', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'spikes/site-next'), { recursive: true });
    await mkdir(join(root, 'spikes/site-react-router'), { recursive: true });
    await writeFile(join(root, 'spikes/site-next/source.ts'), 'export const next = 1;\n');
    await writeFile(join(root, 'spikes/site-react-router/source.ts'), 'export const router = 1;\n');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'both candidates'], { cwd: root });
    const initialCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const { rendererSourceClosureHashAtCommit } = await import('../src/renderer-layouts');
    const nextHash = await rendererSourceClosureHashAtCommit(root, 'next', initialCommit);
    const reactRouterHash = await rendererSourceClosureHashAtCommit(root, 'react-router', initialCommit);

    await writeFile(join(root, 'spikes/site-next/only-next.ts'), 'export const onlyNext = true;\n');
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Renderer Test', '-c', 'user.email=renderer@example.invalid',
      'commit', '-m', 'next only'], { cwd: root });
    const nextOnlyCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    expect(await rendererSourceClosureHashAtCommit(root, 'next', nextOnlyCommit)).not.toBe(nextHash);
    expect(await rendererSourceClosureHashAtCommit(root, 'react-router', nextOnlyCommit)).toBe(reactRouterHash);
  });

  it('does not expose ambient build environment variables to renderer builds', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'legacy:build': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
      writeFileSync(join(process.cwd(), 'dist/index.html'), String(process.env.RENDERER_UNTRUSTED_TEST ?? 'absent'));
    `);
    process.env.RENDERER_UNTRUSTED_TEST = 'ambient-secret';
    try {
      const { runBuildSamples } = await import('../src/capture-renderer');
      await runBuildSamples({
        repositoryRoot: root,
        rendererRoot: root,
        outputDirectory: join(root, 'dist'),
        cleanDirectories: [join(root, 'dist'), join(root, '.astro'), join(root, 'node_modules/.astro')],
        renderer: 'astro',
        buildScript: 'legacy:build',
        buildSamples: 3,
      });
      expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toBe('absent');
    } finally {
      delete process.env.RENDERER_UNTRUSTED_TEST;
    }
  });

  it('refuses a clean root that is not a renderer output or cache', async () => {
    const root = await createRoot();
    const output = join(root, 'dist');
    const unrelated = join(root, 'src-data');
    await mkdir(unrelated);
    await writeFile(join(unrelated, 'keep.txt'), 'must survive');
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'legacy:build': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
      writeFileSync(join(process.cwd(), 'dist/index.html'), '<h1>safe</h1>');
    `);
    const { runBuildSamples } = await import('../src/capture-renderer');

    await expect(runBuildSamples({
      repositoryRoot: root,
      rendererRoot: root,
      outputDirectory: output,
      cleanDirectories: [output, unrelated],
      renderer: 'astro',
      buildScript: 'legacy:build',
      buildSamples: 3,
    })).rejects.toThrow(/exact canonical/iu);
    expect(await readFile(join(unrelated, 'keep.txt'), 'utf8')).toBe('must survive');
  });

  it('scans non-HTML artifact files with the repository private-boundary policy', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets/app.js'), 'globalThis.sourcePath="/Users/example/private/source.md";');
    await writeFile(join(root, 'assets/public.css'), '/* Embedding systems are public prose. */');
    const module = await import('../src/capture-renderer');
    expect(module).toHaveProperty('scanArtifactPrivateBoundary');
    const scan = (module as typeof module & {
      scanArtifactPrivateBoundary: (root: string) => Promise<Array<{
        path: string;
        kind: string;
        marker: string;
      }>>;
    }).scanArtifactPrivateBoundary;

    expect(await scan(root)).toEqual([
      {
        path: 'assets/app.js',
        kind: 'private-locator',
        marker: 'private filesystem locator',
      },
      {
        path: 'assets/app.js',
        kind: 'serialized-private-field',
        marker: 'serialized private payload field',
      },
    ]);
  });

  it('refuses a symlinked artifact root instead of scanning outside it', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await writeFile(join(outside, 'outside.js'), 'globalThis.safe = true;');
    const artifact = join(root, 'dist');
    await symlink(outside, artifact);
    const { scanArtifactPrivateBoundary } = await import('../src/capture-renderer');

    await expect(scanArtifactPrivateBoundary(artifact)).rejects.toThrow(/real directory/iu);
  });

  it('allows explicit loopback hosts and rejects wildcard bindings', async () => {
    const module = await import('../src/serve-static');
    expect(module).toHaveProperty('validateLoopbackHost');
    const validate = (module as typeof module & { validateLoopbackHost: (host: string) => void }).validateLoopbackHost;

    expect(() => validate('127.0.0.1')).not.toThrow();
    expect(() => validate('::1')).not.toThrow();
    expect(() => validate('0.0.0.0')).toThrow(/loopback/iu);
    expect(() => validate('::')).toThrow(/loopback/iu);
  });
});
