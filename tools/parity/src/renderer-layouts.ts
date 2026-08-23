import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RendererName } from './compare-contracts.ts';

const execFileAsync = promisify(execFile);

export const BUILD_ENVIRONMENT_VERSION = 1 as const;
export const SOURCE_CLOSURE_VERSION = 1 as const;

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

function isAllowedIgnoredPath(path: string): boolean {
  const normalized = path.replace(/\/$/u, '');
  const allowedRoots = [
    ...Object.values(RENDERER_LAYOUTS).flatMap((layout) => layout.cleanRoots),
    '.superpowers', '.parallel', '.worktrees', '.playwright-cli', '.impeccable',
    'build/public-releases',
  ];
  if (allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) return true;
  return normalized.split('/').includes('node_modules');
}

export async function assertRendererRepositoryState(
  repositoryRoot: string,
  purpose: 'capture' | 'selection',
): Promise<string> {
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
    .filter((path) => !isAllowedIgnoredPath(path));
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
  const entries = (await execFileAsync('git', [
    'ls-tree', '-r', '--format=%(objectname) %(path)', commit, '--', ...layout.sourceClosure,
  ], { cwd: repositoryRoot, maxBuffer: 20 * 1024 * 1024 })).stdout
    .split('\n').filter(Boolean).sort((left, right) => left.localeCompare(right));
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(`${Buffer.byteLength(entry)}:${entry}`);
  }
  return `sha256:${hash.digest('hex')}`;
}
