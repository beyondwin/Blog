import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const manifestPaths = [
  'package.json',
  'apps/site/package.json',
  'packages/contracts/package.json',
  'packages/content/package.json',
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
  name?: string;
  private?: boolean;
  engines?: { node?: string };
  scripts?: Record<string, string>;
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

describe('React-only Node 24 workspace contract', () => {
  it('declares only current workspace roots and private Node 24 manifests', async () => {
    const manifests = await Promise.all(manifestPaths.map(readManifest));
    expect(manifests[0]?.name).toBe('beyondwin-form-thought');
    expect(manifests[0]?.workspaces).toEqual(['apps/*', 'packages/*', 'spikes/*']);
    for (const manifest of manifests) {
      expect(manifest.private).toBe(true);
      expect(manifest.engines?.node).toBe('>=24 <25');
    }
  });

  it('pins approved tooling and has zero Astro packages or legacy scripts', async () => {
    const [rootManifest, ...publicManifests] = await Promise.all(manifestPaths.map(readManifest));
    expect(declaredDependencies(rootManifest)).toMatchObject(approvedToolVersions);
    expect(publicManifests[0]?.devDependencies?.fontkitten).toBe('1.0.3');
    for (const manifest of [rootManifest, ...publicManifests]) {
      const dependencies = declaredDependencies(manifest);
      expect(Object.keys(dependencies)).not.toContain('astro');
      expect(Object.keys(dependencies).some((name) => name.startsWith('@astrojs/'))).toBe(false);
    }
    for (const script of ['legacy:dev', 'legacy:build', 'legacy:preview', 'parity:capture:astro', 'cutover:rollback']) {
      expect(rootManifest.scripts).not.toHaveProperty(script);
    }
  });

  it('seals the final ordered validation chain', async () => {
    const manifest = await readManifest('package.json');
    expect(manifest.scripts?.['public-answer-release:build'])
      .toBe('tsx packages/content/src/answer-release/cli.ts build');
    expect(manifest.scripts?.['public-answer-release:approval-candidate'])
      .toBe('tsx packages/content/src/answer-release/cli.ts approval-candidate');
    expect(manifest.scripts?.['public-answer-release:verify'])
      .toBe('tsx packages/content/src/answer-release/cli.ts verify');
    expect(manifest.scripts?.['public-answer-release:clean-test'])
      .toBe('tsx packages/content/src/answer-release/cli.ts clean-test');
    expect(manifest.scripts?.validate).toBe([
      'npm run agent:check',
      'node scripts/validate-content.mjs',
      'npm run media:validate -- --strict',
      'npm run article:quality',
      'npm run memory:validate',
      'npm test',
      'npm run typecheck:workspaces',
      'npm run public-release:build',
      'npm run public-release:verify',
      'npm run public-answer-release:build',
      'npm run public-answer-release:verify',
      'npm run public-release:clean-test',
      'npm run public-answer-release:clean-test',
      'npm run site:build',
    ].join(' && '));
    expect(manifest.scripts?.test).toBe('vitest run');
    expect(manifest.scripts?.['test:workspaces']).not.toMatch(/parity|astro/iu);
  });

  it('has no tracked Astro source/config/import/script residue', async () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' })
      .toString('utf8').split('\0').filter(Boolean);
    expect(tracked.filter((path) => path.endsWith('.astro') || path === 'astro.config.mjs')).toEqual([]);
    for (const path of [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      ...tracked.filter((entry) => /^(?:apps|packages|scripts|tests)\/.+\.(?:[cm]?[jt]sx?|json)$/u.test(entry))
        .filter((entry) => ![
          'scripts/memory/seed.mjs',
          'scripts/memory.seed.test.mjs',
          'tests/workspace-contract.test.ts',
        ].includes(entry)),
    ]) {
      const source = await readFile(resolve(root, path), 'utf8');
      expect(source, path).not.toMatch(/(?:from\s+['"]astro(?:\/|['"])|astro:|astro\/tsconfigs|(?:^|["'])astro["']|@astrojs\/)/imu);
    }
  });

  it('uses the repository TypeScript base without framework inheritance', async () => {
    const configuration = JSON.parse(await readFile(resolve(root, 'tsconfig.json'), 'utf8'));
    expect(configuration.extends).toBe('./tsconfig.base.json');
  });

  it('owns the native release verifier at the React Router runtime boundary', async () => {
    const siteManifest = await readManifest('apps/site/package.json');
    expect(siteManifest.dependencies?.sharp).toBe('0.35.3');
  });

  it('exports the answer-release API with a directly pinned HTML parser', async () => {
    const contentManifest = await readManifest('packages/content/package.json');
    const exports = (contentManifest as PackageManifest & { exports?: Record<string, string> }).exports;
    expect(exports?.['./answer-release']).toBe('./src/answer-release/index.ts');
    expect(contentManifest.dependencies?.parse5).toBe('8.0.1');
  });
});
