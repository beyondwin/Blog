import { constants as fsConstants, type Dirent, type Stats } from 'node:fs';
import {
  lstat,
  open,
  readdir,
  realpath,
  type FileHandle,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

type ExpectedPathKind = 'directory' | 'file';

interface PathIdentity {
  lexicalPath: string;
  realPath: string;
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface ContainedPathSnapshot {
  path: string;
  components: PathIdentity[];
}

function pathIsContained(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

function relativeSegments(relativePath: string, allowRoot = false): string[] {
  if (relativePath === '' && allowRoot) return [];
  if (
    !relativePath
    || isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`${relativePath || '<root>'}: allowlisted source path must be canonical and relative`);
  }
  return relativePath.split('/');
}

function identity(path: string, realPath: string, state: Stats): PathIdentity {
  return {
    lexicalPath: path,
    realPath,
    dev: state.dev,
    ino: state.ino,
    mode: state.mode,
    size: state.size,
    mtimeMs: state.mtimeMs,
    ctimeMs: state.ctimeMs,
  };
}

function assertKind(path: string, state: Stats, expected: ExpectedPathKind): void {
  if (state.isSymbolicLink()) throw new Error(`${path}: allowlisted source path must not be a symbolic link`);
  if (expected === 'directory' && !state.isDirectory()) {
    throw new Error(`${path}: allowlisted source path component must be a directory`);
  }
  if (expected === 'file' && !state.isFile()) {
    throw new Error(`${path}: allowlisted source leaf must be a regular file`);
  }
}

async function inspectContainedPath(
  allowedRoot: string,
  relativePath: string,
  expected: ExpectedPathKind,
): Promise<ContainedPathSnapshot> {
  const root = resolve(allowedRoot);
  const segments = relativeSegments(relativePath, expected === 'directory');
  const rootState = await lstat(root);
  assertKind(root, rootState, 'directory');
  const realRoot = await realpath(root);
  const components = [identity(root, realRoot, rootState)];
  let current = root;

  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const state = await lstat(current);
    assertKind(current, state, index === segments.length - 1 ? expected : 'directory');
    const resolved = await realpath(current);
    if (!pathIsContained(realRoot, resolved)) {
      throw new Error(`${current}: allowlisted source path escapes its exact root`);
    }
    components.push(identity(current, resolved, state));
  }

  return { path: current, components };
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.lexicalPath === right.lexicalPath
    && left.realPath === right.realPath
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function assertSnapshotUnchanged(
  before: ContainedPathSnapshot,
  after: ContainedPathSnapshot,
): void {
  if (
    before.path !== after.path
    || before.components.length !== after.components.length
    || before.components.some((component, index) => !sameIdentity(component, after.components[index]!))
  ) {
    throw new Error(`${before.path}: allowlisted source path changed during access`);
  }
}

function assertHandleMatches(handleState: Stats, leaf: PathIdentity): void {
  if (
    !handleState.isFile()
    || handleState.dev !== leaf.dev
    || handleState.ino !== leaf.ino
    || handleState.mode !== leaf.mode
    || handleState.size !== leaf.size
    || handleState.mtimeMs !== leaf.mtimeMs
    || handleState.ctimeMs !== leaf.ctimeMs
  ) {
    throw new Error(`${leaf.lexicalPath}: allowlisted source leaf changed during open`);
  }
}

async function openRegularLeaf(path: string): Promise<FileHandle> {
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  try {
    return await open(path, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | noFollow);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`${path}: allowlisted source leaf must not be a symbolic link`);
    }
    throw error;
  }
}

export async function readAllowlistedRegularFile(
  allowedRoot: string,
  relativePath: string,
): Promise<Buffer> {
  const before = await inspectContainedPath(allowedRoot, relativePath, 'file');
  const leaf = before.components.at(-1)!;
  const handle = await openRegularLeaf(before.path);

  try {
    assertHandleMatches(await handle.stat(), leaf);
    const bytes = await handle.readFile();
    assertHandleMatches(await handle.stat(), leaf);
    const after = await inspectContainedPath(allowedRoot, relativePath, 'file');
    assertSnapshotUnchanged(before, after);
    assertHandleMatches(await handle.stat(), after.components.at(-1)!);
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function readAllowlistedTextFile(
  allowedRoot: string,
  relativePath: string,
): Promise<string> {
  return (await readAllowlistedRegularFile(allowedRoot, relativePath)).toString('utf8');
}

export async function readAllowlistedDirectory(
  allowedRoot: string,
  relativePath: string,
): Promise<Dirent[]> {
  const before = await inspectContainedPath(allowedRoot, relativePath, 'directory');
  const entries = await readdir(before.path, { withFileTypes: true });
  const after = await inspectContainedPath(allowedRoot, relativePath, 'directory');
  assertSnapshotUnchanged(before, after);
  return entries;
}
