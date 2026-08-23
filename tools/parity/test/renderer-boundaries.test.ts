import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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
    const cache = join(root, '.renderer-cache');
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'build:test': 'node build.mjs' },
    }));
    await writeFile(join(root, 'build.mjs'), `
      import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const cache = join(process.cwd(), '.renderer-cache');
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
      cleanDirectories: [output, cache],
      buildScript: 'build:test',
      buildSamples: 3,
    });

    expect(new Set(result.samples.map((sample) => sample.artifactHash)).size).toBe(1);
    expect(result.samples.every((sample) => sample.cleanedPaths.length === 2)).toBe(true);
    expect(await readFile(join(cache, 'state.txt'), 'utf8')).toBe('1');
  });

  it('refuses a clean root that is not a renderer output or cache', async () => {
    const root = await createRoot();
    const output = join(root, 'dist');
    const unrelated = join(root, 'src-data');
    await mkdir(unrelated);
    await writeFile(join(unrelated, 'keep.txt'), 'must survive');
    await writeFile(join(root, 'package.json'), JSON.stringify({
      private: true,
      scripts: { 'build:test': 'node build.mjs' },
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
      buildScript: 'build:test',
      buildSamples: 3,
    })).rejects.toThrow(/output or cache/iu);
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
