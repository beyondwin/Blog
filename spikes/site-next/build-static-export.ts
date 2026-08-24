import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
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
  beforeFailedStagingRetention?: (context: StagingContext) => Promise<void>;
  beforeVerifiedStagingPublication?: (context: StagingContext) => Promise<void>;
}

interface StagingContext {
  stagedOutput: string;
}

interface ExpectedAsset {
  checksum: string;
  sourcePath: string;
}

interface RealDirectoryIdentity {
  dev: number;
  ino: number;
  path: string;
  realPath: string;
  uid: number;
}

interface OwnedOutputTree {
  spikeRoot: RealDirectoryIdentity;
  outputRoot: RealDirectoryIdentity;
}

interface OwnedStagedOutput {
  publicOutputPath: string;
  stagingRoot: RealDirectoryIdentity;
  outputRoot: RealDirectoryIdentity;
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

function isSameDirectory(
  state: Awaited<ReturnType<typeof lstat>>,
  identity: RealDirectoryIdentity,
): boolean {
  return !state.isSymbolicLink()
    && state.isDirectory()
    && state.dev === identity.dev
    && state.ino === identity.ino
    && state.uid === identity.uid;
}

async function readRealDirectoryIdentity(path: string, label: string): Promise<RealDirectoryIdentity> {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isDirectory()) throw new Error(`${label} must be a real directory`);
  if (typeof process.getuid === 'function' && before.uid !== process.getuid()) {
    throw new Error(`${label} must be an owned directory`);
  }
  const identity = {
    dev: before.dev,
    ino: before.ino,
    path,
    realPath: await realpath(path),
    uid: before.uid,
  };
  const after = await lstat(path);
  if (!isSameDirectory(after, identity)) throw new Error(`${label} changed during validation`);
  return identity;
}

async function readOwnedOutputTree(spikeRootPath: string): Promise<OwnedOutputTree> {
  const spikeRoot = await readRealDirectoryIdentity(spikeRootPath, 'Next spike root');
  const outputRoot = await readRealDirectoryIdentity(join(spikeRootPath, 'out'), 'Next output root');
  if (outputRoot.realPath !== join(spikeRoot.realPath, 'out')) {
    throw new Error('Next output root resolves outside the owned spike root');
  }
  return { spikeRoot, outputRoot };
}

async function assertOwnedOutputTreeCurrent(tree: OwnedOutputTree): Promise<void> {
  const [spikeRoot, outputRoot] = await Promise.all([
    lstat(tree.spikeRoot.path),
    lstat(tree.outputRoot.path),
  ]);
  if (!isSameDirectory(spikeRoot, tree.spikeRoot)
    || !isSameDirectory(outputRoot, tree.outputRoot)
    || await realpath(tree.spikeRoot.path) !== tree.spikeRoot.realPath
    || await realpath(tree.outputRoot.path) !== tree.outputRoot.realPath) {
    throw new Error('Owned Next output tree changed after validation');
  }
}

async function assertOwnedStagedOutputCurrent(staged: OwnedStagedOutput): Promise<void> {
  const [stagingRoot, outputRoot] = await Promise.all([
    lstat(staged.stagingRoot.path),
    lstat(staged.outputRoot.path),
  ]);
  if (!isSameDirectory(stagingRoot, staged.stagingRoot)
    || !isSameDirectory(outputRoot, staged.outputRoot)
    || await realpath(staged.stagingRoot.path) !== staged.stagingRoot.realPath
    || await realpath(staged.outputRoot.path) !== staged.outputRoot.realPath) {
    throw new Error('Owned staged Next output changed after validation');
  }
}

async function stageOwnedOutput(tree: OwnedOutputTree): Promise<OwnedStagedOutput> {
  await assertOwnedOutputTreeCurrent(tree);
  const stagingParentPath = join(tree.spikeRoot.path, '.next');
  await mkdir(stagingParentPath, { recursive: true });
  const stagingParent = await readRealDirectoryIdentity(stagingParentPath, 'Next staging parent');
  if (stagingParent.realPath !== join(tree.spikeRoot.realPath, '.next')) {
    throw new Error('Next staging parent resolves outside the owned spike root');
  }
  const stagingRootPath = await mkdtemp(join(stagingParent.path, 'export-stage-'));
  const stagingRoot = await readRealDirectoryIdentity(stagingRootPath, 'Next export staging root');
  if (dirname(stagingRoot.realPath) !== stagingParent.realPath) {
    throw new Error('Next export staging root resolves outside the owned staging parent');
  }

  await assertOwnedOutputTreeCurrent(tree);
  const stagedOutputPath = join(stagingRoot.path, 'out');
  await rename(tree.outputRoot.path, stagedOutputPath);
  const outputRoot = await readRealDirectoryIdentity(stagedOutputPath, 'staged Next output root');
  if (outputRoot.dev !== tree.outputRoot.dev
    || outputRoot.ino !== tree.outputRoot.ino
    || outputRoot.uid !== tree.outputRoot.uid
    || outputRoot.realPath !== join(stagingRoot.realPath, 'out')) {
    throw new Error('Next output changed while entering the owned staging root');
  }
  return { publicOutputPath: tree.outputRoot.path, stagingRoot, outputRoot };
}

async function retainFailedStaging(
  staged: OwnedStagedOutput,
  beforeRetention?: (context: StagingContext) => Promise<void>,
): Promise<void> {
  try {
    await assertOwnedStagedOutputCurrent(staged);
    await beforeRetention?.({ stagedOutput: staged.outputRoot.path });
  } catch {
    // Failure output is deliberately retained. Cleanup must never re-resolve a mutable path.
  }
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
  staged: OwnedStagedOutput,
  active: VerifiedActivePublicRelease,
): Promise<void> {
  const out = staged.outputRoot.path;
  await assertOwnedStagedOutputCurrent(staged);
  const outputAssets = join(out, 'assets');
  const existing = await lstat(outputAssets).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new Error('Existing exported assets root must be a real directory');
  }
  if (existing) throw new Error('Existing exported assets are untrusted build output');
  await assertOwnedStagedOutputCurrent(staged);
  await mkdir(outputAssets);
  const expected = expectedAssets(active);
  for (const [relativePath, asset] of expected) {
    const sourceState = await lstat(asset.sourcePath);
    if (sourceState.isSymbolicLink() || !sourceState.isFile()) {
      throw new Error(`${relativePath}: verified release asset changed to a symlink or special file`);
    }
    await assertOwnedStagedOutputCurrent(staged);
    const destination = join(out, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(asset.sourcePath, destination, fsConstants.COPYFILE_EXCL);
  }
  await assertOwnedStagedOutputCurrent(staged);
  await verifyExportedAssets(outputAssets, expected);
}

async function publishVerifiedStaging(staged: OwnedStagedOutput): Promise<void> {
  await assertOwnedStagedOutputCurrent(staged);
  const existing = await lstat(staged.publicOutputPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) throw new Error('Public Next output appeared before verified publication');
  await rename(staged.outputRoot.path, staged.publicOutputPath);
  const published = await readRealDirectoryIdentity(staged.publicOutputPath, 'published Next output root');
  if (published.dev !== staged.outputRoot.dev
    || published.ino !== staged.outputRoot.ino
    || published.uid !== staged.outputRoot.uid) {
    throw new Error('Published Next output does not match the verified staging object');
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

  let staged: OwnedStagedOutput | undefined;
  try {
    await runNextBuild({ environment });
    const outputTree = await readOwnedOutputTree(spikeRoot);
    staged = await stageOwnedOutput(outputTree);
    const afterBuild = await readBoundActiveRelease(releasesRoot, binding);
    await copyVerifiedAssets(staged, afterBuild);
    await readBoundActiveRelease(releasesRoot, binding);
    await options.beforeVerifiedStagingPublication?.({ stagedOutput: staged.outputRoot.path });
    await publishVerifiedStaging(staged);
  } catch (error) {
    if (staged) await retainFailedStaging(staged, options.beforeFailedStagingRetention);
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const spikeRoot = resolve(process.cwd());
  await buildStaticExport({ repositoryRoot: resolve(spikeRoot, '../..'), spikeRoot });
}
