import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export function sha256(bytes: string | Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function hashFile(path: string): Promise<string> {
  return sha256(await readFile(path));
}

export async function hashFiles(root: string, paths: readonly string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    const bytes = await readFile(join(root, path));
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

async function treeFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    const state = await lstat(path);
    if (state.isSymbolicLink()) throw new Error(`${path}: evidence tree must not contain symbolic links`);
    if (state.isDirectory()) files.push(...await treeFiles(root, path));
    else if (state.isFile()) files.push(relative(root, path).split(sep).join('/'));
    else throw new Error(`${path}: evidence tree contains a special file`);
  }
  return files;
}

export async function hashTree(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of await treeFiles(root)) {
    const bytes = await readFile(join(root, path));
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
