import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  PUBLIC_RELEASE_VERIFICATION_POLICY_VERSION,
  readActiveRelease,
} from '../../../packages/content/src/release/read-release.ts';
import type { RendererName } from './compare-contracts.ts';

export { PUBLIC_RELEASE_VERIFICATION_POLICY_VERSION } from '../../../packages/content/src/release/read-release.ts';

const execFileAsync = promisify(execFile);

export const BUILD_ENVIRONMENT_VERSION = 1 as const;
export const SOURCE_CLOSURE_VERSION = 2 as const;
export const PUBLIC_RELEASE_PROVENANCE_VERSION = 1 as const;
export const PUBLIC_RELEASE_ROOT = 'build/public-releases' as const;

export interface RendererPublicReleaseEvidence {
  version: typeof PUBLIC_RELEASE_PROVENANCE_VERSION;
  verificationPolicyVersion: typeof PUBLIC_RELEASE_VERIFICATION_POLICY_VERSION;
  root: typeof PUBLIC_RELEASE_ROOT;
  releaseId: string;
  rendererVersion: string;
  activePointer: { releaseId: string; path: string };
  activePointerHash: string;
  manifestHash: string;
  artifactHash: string;
}

export interface RendererLayout {
  rendererRoot: string;
  rendererManifest: string;
  buildScript: string;
  outputRoot: string;
  cleanRoots: readonly string[];
  sourceClosureVersion: typeof SOURCE_CLOSURE_VERSION;
  sourceClosure: readonly string[];
}

export const RENDERER_LAYOUTS: Record<RendererName, RendererLayout> = {
  astro: {
    rendererRoot: '.',
    rendererManifest: 'package.json',
    buildScript: 'legacy:build',
    outputRoot: 'dist',
    cleanRoots: ['dist', '.astro', 'node_modules/.astro'],
    sourceClosureVersion: SOURCE_CLOSURE_VERSION,
    sourceClosure: [
      '.nvmrc', 'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.base.json', 'tsconfig.json',
      'public', 'src',
      'packages/contracts/package.json', 'packages/contracts/tsconfig.json', 'packages/contracts/src',
      'packages/content/package.json', 'packages/content/tsconfig.json', 'packages/content/src',
      'tools/parity/package.json', 'tools/parity/tsconfig.json', 'tools/parity/src',
    ],
  },
  next: {
    rendererRoot: 'spikes/site-next',
    rendererManifest: 'spikes/site-next/package.json',
    buildScript: 'build',
    outputRoot: 'spikes/site-next/out',
    cleanRoots: ['spikes/site-next/out', 'spikes/site-next/.next'],
    sourceClosureVersion: SOURCE_CLOSURE_VERSION,
    sourceClosure: [
      '.nvmrc', 'package.json', 'package-lock.json', 'tsconfig.base.json',
      'spikes/site-next',
      'packages/contracts/package.json', 'packages/contracts/tsconfig.json', 'packages/contracts/src',
      'packages/content/package.json', 'packages/content/tsconfig.json', 'packages/content/src',
      'tools/parity/package.json', 'tools/parity/tsconfig.json', 'tools/parity/src',
    ],
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
    sourceClosureVersion: SOURCE_CLOSURE_VERSION,
    sourceClosure: [
      '.nvmrc', 'package.json', 'package-lock.json', 'tsconfig.base.json',
      'spikes/site-react-router',
      'packages/contracts/package.json', 'packages/contracts/tsconfig.json', 'packages/contracts/src',
      'packages/content/package.json', 'packages/content/tsconfig.json', 'packages/content/src',
      'tools/parity/package.json', 'tools/parity/tsconfig.json', 'tools/parity/src',
    ],
  },
};

function isAllowedIgnoredPath(
  path: string,
  renderer: RendererName,
  publicRelease: RendererPublicReleaseEvidence | null,
): boolean {
  const normalized = path.replace(/\/$/u, '');
  const allowedRoots = [
    ...Object.values(RENDERER_LAYOUTS).flatMap((layout) => layout.cleanRoots),
    '.superpowers', '.parallel', '.worktrees', '.playwright-cli', '.impeccable',
  ];
  if (allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) return true;
  if (normalized === PUBLIC_RELEASE_ROOT || normalized.startsWith(`${PUBLIC_RELEASE_ROOT}/`)) {
    return renderer === 'astro' || publicRelease !== null;
  }
  return normalized.split('/').includes('node_modules');
}

export async function verifyRendererPublicReleaseInput(
  repositoryRoot: string,
  renderer: RendererName,
): Promise<RendererPublicReleaseEvidence | null> {
  if (renderer === 'astro') return null;
  const releasesRoot = join(repositoryRoot, PUBLIC_RELEASE_ROOT);
  let entries;
  try {
    entries = await readdir(releasesRoot, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Renderer ${renderer} requires one verified active public release`, { cause: error });
  }
  for (const entry of entries) {
    const isActivePointer = entry.name === 'active.json' && entry.isFile();
    const isImmutableRelease = /^[a-f0-9]{64}$/u.test(entry.name) && entry.isDirectory();
    if (!isActivePointer && !isImmutableRelease) {
      throw new Error(`Renderer ${renderer} rejects unexpected public release state: ${entry.name}`);
    }
  }
  const active = await readActiveRelease(releasesRoot).catch((error) => {
    throw new Error(`Renderer ${renderer} requires one verified active public release`, { cause: error });
  });
  if (active.boundaryHits.length > 0) {
    throw new Error(`Renderer ${renderer} active public release contains private-boundary hits`);
  }
  return {
    version: PUBLIC_RELEASE_PROVENANCE_VERSION,
    verificationPolicyVersion: active.verificationPolicyVersion,
    root: PUBLIC_RELEASE_ROOT,
    releaseId: active.pointer.releaseId,
    rendererVersion: active.manifest.rendererVersion,
    activePointer: active.pointer,
    activePointerHash: active.activePointerHash,
    manifestHash: active.manifestHash,
    artifactHash: active.artifactHash,
  };
}

export async function assertRendererRepositoryState(
  repositoryRoot: string,
  purpose: 'capture' | 'selection',
  renderer: RendererName = 'astro',
): Promise<string> {
  const publicRelease = await verifyRendererPublicReleaseInput(repositoryRoot, renderer);
  const repositoryCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  })).stdout.trim();
  const status = (await execFileAsync('git', [
    'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ], { cwd: repositoryRoot })).stdout;
  const dirtyPaths = status.split('\0').filter(Boolean);
  if (dirtyPaths.length > 0) {
    throw new Error(`Renderer ${purpose} requires a clean committed ${purpose === 'capture' ? 'source' : 'evidence'} tree; dirty paths:\n${dirtyPaths.join('\n')}`);
  }
  const ignoredStatus = (await execFileAsync('git', [
    'status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=all',
  ], { cwd: repositoryRoot })).stdout;
  const rejected = ignoredStatus.split('\0')
    .filter((line) => line.startsWith('!! '))
    .map((line) => line.slice(3))
    .filter((path) => !isAllowedIgnoredPath(path, renderer, publicRelease));
  if (rejected.length > 0) {
    throw new Error(`Renderer ${purpose} rejects ignored renderer input paths:\n${rejected.join('\n')}`);
  }
  return repositoryCommit;
}

export async function rendererSourceClosureHashAtCommit(
  repositoryRoot: string,
  renderer: RendererName,
  commit: string,
): Promise<string> {
  const layout = RENDERER_LAYOUTS[renderer];
  const selectedRoots = layout.sourceClosure.map((path) => Buffer.from(path));
  const output = await execFileAsync('git', [
    'ls-tree', '-r', '-t', '-z', '--full-tree', commit, '--', ...layout.sourceClosure,
  ], {
    cwd: repositoryRoot,
    maxBuffer: 20 * 1024 * 1024,
    encoding: 'buffer',
  }) as unknown as { stdout: Buffer };
  const entries = output.stdout.subarray(0, output.stdout.length - (
    output.stdout.at(-1) === 0 ? 1 : 0
  )).toString('latin1').split('\0').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('\t');
    if (separator < 0) throw new Error('Git source closure entry has no path separator');
    const [mode, type, objectId, ...extra] = entry.slice(0, separator).split(' ');
    if (!mode || !type || !objectId || extra.length > 0) {
      throw new Error('Git source closure entry has invalid identity fields');
    }
    return {
      mode,
      type,
      objectId,
      path: Buffer.from(entry.slice(separator + 1), 'latin1'),
    };
  }).filter((entry) => selectedRoots.some((root) => (
    entry.path.equals(root)
      || (entry.path.length > root.length
        && entry.path.subarray(0, root.length).equals(root)
        && entry.path.at(root.length) === 0x2f)
  ))).sort((left, right) => Buffer.compare(left.path, right.path));
  const hash = createHash('sha256');
  hash.update('renderer-source-closure-v2\0');
  for (const entry of entries) {
    hash.update(entry.mode);
    hash.update('\0');
    hash.update(entry.type);
    hash.update('\0');
    hash.update(entry.objectId);
    hash.update('\0');
    hash.update(entry.path);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}
