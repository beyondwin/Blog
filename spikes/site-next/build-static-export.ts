import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rm,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readActiveRelease,
  type VerifiedActivePublicRelease,
} from '@beyondwin/content/release';
import {
  PUBLIC_RELEASE_BINDING_ENV,
  readBoundActiveRelease,
  serializeReleaseBinding,
} from './release-binding';

interface NextBuildContext {
  environment: NodeJS.ProcessEnv;
}

interface StaticExportOptions {
  repositoryRoot: string;
  spikeRoot: string;
  runNextBuild?: (context: NextBuildContext) => Promise<void>;
}

interface ExpectedAsset {
  checksum: string;
  sourcePath: string;
}

function expectedAssets(active: VerifiedActivePublicRelease): Map<string, ExpectedAsset> {
  const assets = new Map<string, ExpectedAsset>();
  const add = (href: string, checksum: string): void => {
    const relativePath = href.slice(1);
    const existing = assets.get(relativePath);
    if (existing && existing.checksum !== checksum) {
      throw new Error(`${href}: verified manifest assigns conflicting checksums`);
    }
    assets.set(relativePath, { checksum, sourcePath: join(active.releasePath, relativePath) });
  };
  for (const asset of Object.values(active.manifest.assets)) {
    add(asset.fallback.src, asset.fallback.checksum);
    for (const candidate of asset.fallback.candidates) add(candidate.src, candidate.checksum);
    for (const source of asset.sources) {
      for (const candidate of source.candidates) add(candidate.src, candidate.checksum);
    }
  }
  return new Map([...assets].sort(([left], [right]) => left.localeCompare(right)));
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error(`${label} must be a real directory`);
}

async function readOwnedRegularFile(path: string, label: string): Promise<Buffer> {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new Error(`${label} must not be a symbolic link`);
    throw error;
  }
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error(`${label} must be one regular owned file`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function outputFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${path}: exported asset must not be a symbolic link`);
    if (entry.isDirectory()) files.push(...await outputFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
    else throw new Error(`${path}: unexpected special exported asset file`);
  }
  return files;
}

async function verifyExportedAssets(
  outputAssets: string,
  expected: ReadonlyMap<string, ExpectedAsset>,
): Promise<void> {
  await assertRealDirectory(outputAssets, 'exported assets root');
  const actualPaths = (await outputFiles(outputAssets)).map((path) => `assets/${path}`);
  const expectedPaths = [...expected.keys()];
  const unexpected = actualPaths.filter((path) => !expected.has(path));
  const missing = expectedPaths.filter((path) => !actualPaths.includes(path));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`exported asset inventory mismatch: unexpected=${unexpected.join(',')} missing=${missing.join(',')}`);
  }
  for (const [relativePath, asset] of expected) {
    const bytes = await readOwnedRegularFile(join(dirname(outputAssets), relativePath), relativePath);
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (checksum !== asset.checksum) throw new Error(`${relativePath}: exported asset checksum mismatch`);
  }
}

async function copyVerifiedAssets(
  spikeRoot: string,
  active: VerifiedActivePublicRelease,
): Promise<void> {
  const out = join(spikeRoot, 'out');
  await assertRealDirectory(spikeRoot, 'Next spike root');
  await assertRealDirectory(out, 'Next output root');
  const outputAssets = join(out, 'assets');
  const existing = await lstat(outputAssets).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new Error('Existing exported assets root must be a real directory');
  }
  if (existing) await rm(outputAssets, { recursive: true });
  await mkdir(outputAssets);
  const expected = expectedAssets(active);
  try {
    for (const [relativePath, asset] of expected) {
      const sourceState = await lstat(asset.sourcePath);
      if (sourceState.isSymbolicLink() || !sourceState.isFile()) {
        throw new Error(`${relativePath}: verified release asset changed to a symlink or special file`);
      }
      const destination = join(out, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(asset.sourcePath, destination, fsConstants.COPYFILE_EXCL);
    }
    await verifyExportedAssets(outputAssets, expected);
  } catch (error) {
    await rm(outputAssets, { recursive: true, force: true });
    throw error;
  }
}

async function runProductionNextBuild(spikeRoot: string, environment: NodeJS.ProcessEnv): Promise<void> {
  const nextCli = fileURLToPath(import.meta.resolve('next/dist/bin/next'));
  await new Promise<void>((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [nextCli, 'build'], {
      cwd: spikeRoot,
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', rejectBuild);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`Next build failed with ${signal ? `signal ${signal}` : `exit ${code ?? 'unknown'}`}`));
    });
  });
}

export async function buildStaticExport(options: StaticExportOptions): Promise<void> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const spikeRoot = resolve(options.spikeRoot);
  const releasesRoot = join(repositoryRoot, 'build/public-releases');
  const initial = await readActiveRelease(releasesRoot);
  const binding = serializeReleaseBinding(initial);
  const environment = { ...process.env, [PUBLIC_RELEASE_BINDING_ENV]: binding };
  const runNextBuild = options.runNextBuild
    ?? ((context: NextBuildContext) => runProductionNextBuild(spikeRoot, context.environment));

  try {
    await runNextBuild({ environment });
    const afterBuild = await readBoundActiveRelease(releasesRoot, binding);
    await copyVerifiedAssets(spikeRoot, afterBuild);
    await readBoundActiveRelease(releasesRoot, binding);
  } catch (error) {
    await rm(join(spikeRoot, 'out/assets'), { recursive: true, force: true });
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const spikeRoot = resolve(process.cwd());
  await buildStaticExport({ repositoryRoot: resolve(spikeRoot, '../..'), spikeRoot });
}
