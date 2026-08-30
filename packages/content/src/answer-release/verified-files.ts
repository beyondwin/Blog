import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { codePointCompare } from './identity';

export interface VerifiedAnswerFile {
  path: string;
  bytes: Buffer;
  checksum: string;
}

interface DirectoryGuard {
  handle: FileHandle;
  path: string;
  dev: number;
  ino: number;
}

function checksum(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function serializeCanonicalPrettyJson(value: unknown, depth: number): string | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const indentation = '  '.repeat(depth + 1);
    const closingIndentation = '  '.repeat(depth);
    const children = Array.from(value, (child) => (
      serializeCanonicalPrettyJson(child, depth + 1) ?? 'null'
    ));
    return `[\n${children.map((child) => `${indentation}${child}`).join(',\n')}\n${closingIndentation}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => codePointCompare(left, right))
      .flatMap(([key, child]) => {
        const serialized = serializeCanonicalPrettyJson(child, depth + 1);
        return serialized === undefined ? [] : [[key, serialized] as const];
      });
    if (entries.length === 0) return '{}';
    const indentation = '  '.repeat(depth + 1);
    const closingIndentation = '  '.repeat(depth);
    return `{\n${entries.map(([key, child]) => (
      `${indentation}${JSON.stringify(key)}: ${child}`
    )).join(',\n')}\n${closingIndentation}}`;
  }
  return undefined;
}

export function canonicalAnswerPrettyJson(value: unknown): string {
  const serialized = serializeCanonicalPrettyJson(value, 0);
  if (serialized === undefined) throw new TypeError('canonical JSON value must be serializable');
  return `${serialized}\n`;
}

function assertRelativePath(path: string): void {
  if (
    !path
    || isAbsolute(path)
    || path === '.'
    || path.split(/[\\/]/u).some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${path}: answer release file path must be a contained relative path`);
  }
}

async function openDirectoryGuard(path: string): Promise<DirectoryGuard> {
  let handle: FileHandle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`${path}: answer release directory must not be a symbolic link`);
    }
    throw error;
  }
  try {
    const state = await handle.stat();
    const pathState = await lstat(path);
    if (
      !state.isDirectory()
      || pathState.isSymbolicLink()
      || !pathState.isDirectory()
      || state.dev !== pathState.dev
      || state.ino !== pathState.ino
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())
    ) {
      throw new Error(`${path}: answer release directory must be one real owned directory`);
    }
    return { handle, path, dev: state.dev, ino: state.ino };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertDirectoryGuard(guard: DirectoryGuard): Promise<void> {
  let pathState;
  try {
    pathState = await lstat(guard.path);
  } catch {
    throw new Error(`${guard.path}: answer release directory changed during verification`);
  }
  const handleState = await guard.handle.stat();
  if (
    pathState.isSymbolicLink()
    || !pathState.isDirectory()
    || pathState.dev !== guard.dev
    || pathState.ino !== guard.ino
    || handleState.dev !== guard.dev
    || handleState.ino !== guard.ino
  ) {
    throw new Error(`${guard.path}: answer release directory changed during verification`);
  }
}

export async function readOwnedAnswerFile(root: string, relativePath: string): Promise<VerifiedAnswerFile> {
  assertRelativePath(relativePath);
  const resolvedRoot = resolve(root);
  const filePath = resolve(resolvedRoot, relativePath);
  if (!filePath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`${relativePath}: answer release file escapes containment`);
  }
  const directory = await openDirectoryGuard(resolvedRoot);
  let file: FileHandle | undefined;
  try {
    await assertDirectoryGuard(directory);
    const realRoot = await realpath(resolvedRoot);
    const realFile = await realpath(filePath);
    if (!realFile.startsWith(`${realRoot}${sep}`)) {
      throw new Error(`${relativePath}: answer release file real path escapes containment`);
    }
    try {
      file = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
        throw new Error(`${relativePath}: answer release file must not be a symbolic link`);
      }
      throw error;
    }
    const opened = await file.stat();
    const before = await lstat(filePath);
    if (
      !opened.isFile()
      || before.isSymbolicLink()
      || !before.isFile()
      || opened.nlink !== 1
      || before.nlink !== 1
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || (typeof process.getuid === 'function' && opened.uid !== process.getuid())
    ) {
      throw new Error(`${relativePath}: answer release file must be one regular owned single-link file`);
    }
    const bytes = await file.readFile();
    const after = await lstat(filePath);
    const finalOpened = await file.stat();
    if (
      after.isSymbolicLink()
      || !after.isFile()
      || after.nlink !== 1
      || after.dev !== opened.dev
      || after.ino !== opened.ino
      || finalOpened.dev !== opened.dev
      || finalOpened.ino !== opened.ino
      || finalOpened.size !== bytes.byteLength
    ) {
      throw new Error(`${relativePath}: answer release file inode changed during verification`);
    }
    await assertDirectoryGuard(directory);
    return { path: relativePath, bytes, checksum: checksum(bytes) };
  } finally {
    if (file) await file.close();
    await directory.handle.close();
  }
}

export async function listAnswerReleaseFiles(root: string): Promise<Set<string>> {
  const resolvedRoot = resolve(root);
  const directory = await openDirectoryGuard(resolvedRoot);
  try {
    await assertDirectoryGuard(directory);
    const entries = await readdir(resolvedRoot, { withFileTypes: true });
    const files = new Set<string>();
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`${entry.name}: answer release inventory permits regular files only`);
      }
      files.add(entry.name);
    }
    await assertDirectoryGuard(directory);
    return files;
  } finally {
    await directory.handle.close();
  }
}

export async function hashAnswerReleaseArtifact(root: string, files: Set<string>): Promise<string> {
  const actual = await listAnswerReleaseFiles(root);
  if (
    actual.size !== files.size
    || [...actual].some((path) => !files.has(path))
  ) {
    throw new Error('answer release artifact hash inventory changed during verification');
  }
  const hash = createHash('sha256');
  hash.update('public-answer-release-artifact-v1\0');
  for (const path of [...files].sort(codePointCompare)) {
    const file = await readOwnedAnswerFile(root, path);
    hash.update(`${Buffer.byteLength(path)}:${path}:${file.bytes.byteLength}:`);
    hash.update(file.bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function assertOwnedAnswerDirectory(path: string): Promise<void> {
  const guard = await openDirectoryGuard(resolve(path));
  try {
    await assertDirectoryGuard(guard);
  } finally {
    await guard.handle.close();
  }
}
