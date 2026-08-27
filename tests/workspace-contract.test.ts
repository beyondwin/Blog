import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const execFileAsync = promisify(execFile);
const manifestPaths = [
  'package.json',
  'apps/site/package.json',
  'packages/contracts/package.json',
  'packages/content/package.json',
  'tools/parity/package.json',
];
const approvedToolVersions = {
  typescript: '6.0.3',
  vitest: '4.1.11',
  '@playwright/test': '1.62.1',
  '@axe-core/playwright': '4.13.0',
  parse5: '8.0.1',
  tsx: '4.23.12',
  '@types/node': '24.13.3',
};

type PackageManifest = {
  private?: boolean;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[];
};

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function declaredDependencies(manifest: PackageManifest): Record<string, string> {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
}

describe('Node 24 workspace contract', () => {
  it('excludes rejected renderer evidence from root Vitest discovery', async () => {
    const config = (await import('../vitest.config.mjs')).default as {
      test?: { exclude?: string[] };
    };

    expect(config.test?.exclude).toContain('spikes/rejected/**');
  });

  it('declares the approved workspace roots and private Node 24 manifests', async () => {
    const manifests = await Promise.all(manifestPaths.map(readManifest));

    expect(manifests[0]?.workspaces).toEqual([
      'apps/*',
      'packages/*',
      'spikes/*',
      'tools/*',
    ]);

    for (const manifest of manifests) {
      expect(manifest.private).toBe(true);
      expect(manifest.engines?.node).toBe('>=24 <25');
    }
  });

  it('pins migration tooling exactly and keeps public packages Astro-free', async () => {
    const [rootManifest, ...publicManifests] = await Promise.all(
      manifestPaths.map(readManifest),
    );
    const rootDependencies = declaredDependencies(rootManifest);

    expect(rootDependencies).toMatchObject(approvedToolVersions);
    for (const version of Object.values(approvedToolVersions)) {
      expect(version).not.toMatch(/^[~^]/);
    }

    for (const manifest of publicManifests) {
      const dependencies = declaredDependencies(manifest);
      expect(Object.values(dependencies)).not.toContain('latest');
      expect(Object.values(dependencies).every((version) => !/^[~^]/.test(version))).toBe(true);
      expect(Object.keys(dependencies)).not.toContain('astro');
      expect(Object.keys(dependencies).some((name) => name.startsWith('@astrojs/'))).toBe(false);
    }
  });

  it('keeps rejected Next evidence outside the root Astro diagnostic boundary', async () => {
    const generatedRoot = resolve(root, 'spikes/rejected/site-next/out');
    const sentinel = resolve(generatedRoot, 'root-scan-boundary-reviewer.js');
    const {
      BASE_URL,
      DEV,
      MODE,
      PROD,
      SSR,
      TEST,
      VITEST,
      VITEST_MODE,
      VITEST_POOL_ID,
      VITEST_WORKER_ID,
      ...environment
    } = process.env;
    await mkdir(generatedRoot, { recursive: true });
    await writeFile(sentinel, 'const generatedOutputMustNotBeScanned = true;\n');
    try {
      const { stdout } = await execFileAsync('npm', ['exec', '--', 'astro', 'check'], {
        cwd: root,
        env: { ...environment, NODE_ENV: 'production' },
        maxBuffer: 1024 * 1024,
      });
      expect(stdout).not.toContain('spikes/rejected/site-next/out');
      expect(stdout).not.toContain('root-scan-boundary-reviewer.js');
    } finally {
      await rm(sentinel, { force: true });
    }
  }, 120_000);

  it('keeps selected React Router output outside the root Astro diagnostic boundary', async () => {
    const generatedRoots = [
      resolve(root, 'apps/site/build'),
      resolve(root, 'apps/site/.react-router'),
    ];
    const sentinels = generatedRoots.map((generatedRoot, index) => (
      resolve(generatedRoot, `root-scan-boundary-react-router-${index}.js`)
    ));
    const {
      BASE_URL,
      DEV,
      MODE,
      PROD,
      SSR,
      TEST,
      VITEST,
      VITEST_MODE,
      VITEST_POOL_ID,
      VITEST_WORKER_ID,
      ...environment
    } = process.env;
    await Promise.all(generatedRoots.map((generatedRoot) => mkdir(generatedRoot, { recursive: true })));
    await Promise.all(sentinels.map((sentinel) => writeFile(
      sentinel,
      'const generatedReactRouterOutputMustNotBeScanned = true;\n',
    )));
    try {
      const { stdout } = await execFileAsync('npm', ['exec', '--', 'astro', 'check'], {
        cwd: root,
        env: { ...environment, NODE_ENV: 'production' },
        maxBuffer: 1024 * 1024,
      });
      expect(stdout).not.toContain('apps/site/build');
      expect(stdout).not.toContain('apps/site/.react-router');
      expect(stdout).not.toContain('root-scan-boundary-react-router');
    } finally {
      await Promise.all(sentinels.map((sentinel) => rm(sentinel, { force: true })));
    }
  }, 120_000);
});
