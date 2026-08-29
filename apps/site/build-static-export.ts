import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants, type Stats } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  writeFile,
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
import {
  verifiedReleaseAssetInventory,
  type VerifiedReleaseAsset,
} from './verified-release-assets';
import { fullPublicPaths } from './app/release.server';
import {
  PUBLIC_SECURITY_HEADERS,
  resolveSiteOrigin,
  robotsText,
  sitemapXml,
  type DeliveryMode,
} from './app/delivery';

interface ReactRouterBuildContext {
  environment: NodeJS.ProcessEnv;
}

interface StaticExportOptions {
  repositoryRoot: string;
  spikeRoot: string;
  runReactRouterBuild?: (context: ReactRouterBuildContext) => Promise<void>;
  beforeFailedStagingRetention?: (context: StagingContext) => Promise<void>;
  beforeVerifiedStagingPublication?: (context: StagingContext) => Promise<void>;
  deliveryMode?: DeliveryMode;
}

interface StagingContext {
  stagedOutput: string;
  stagedClient: string;
}

interface RealDirectoryIdentity {
  dev: number;
  ino: number;
  mode: number;
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

const PRIVATE_STAGING_MODE = 0o700;

function permissionMode(mode: number): number {
  return mode & 0o777;
}

function expectedAssets(active: VerifiedActivePublicRelease): Map<string, VerifiedReleaseAsset> {
  const assets = new Map<string, VerifiedReleaseAsset>();
  for (const [href, asset] of verifiedReleaseAssetInventory(active)) {
    assets.set(href.slice(1), asset);
  }
  return new Map([...assets].sort(([left], [right]) => left.localeCompare(right)));
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error(`${label} must be a real directory`);
}

function isSameDirectory(
  state: Stats,
  identity: RealDirectoryIdentity,
): boolean {
  return !state.isSymbolicLink()
    && state.isDirectory()
    && state.dev === identity.dev
    && state.ino === identity.ino
    && permissionMode(state.mode) === identity.mode
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
    mode: permissionMode(before.mode),
    path,
    realPath: await realpath(path),
    uid: before.uid,
  };
  const after = await lstat(path);
  if (!isSameDirectory(after, identity)) throw new Error(`${label} changed during validation`);
  return identity;
}

async function readOwnedOutputTree(spikeRootPath: string): Promise<OwnedOutputTree> {
  const spikeRoot = await readRealDirectoryIdentity(spikeRootPath, 'React Router spike root');
  const outputRoot = await readRealDirectoryIdentity(join(spikeRootPath, 'build'), 'React Router output root');
  if (outputRoot.realPath !== join(spikeRoot.realPath, 'build')) {
    throw new Error('React Router output root resolves outside the owned spike root');
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
    throw new Error('Owned React Router output tree changed after validation');
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
    throw new Error('Owned staged React Router output changed after validation');
  }
}

async function stageOwnedOutput(tree: OwnedOutputTree): Promise<OwnedStagedOutput> {
  await assertOwnedOutputTreeCurrent(tree);
  const stagingParentPath = join(tree.spikeRoot.path, '.react-router');
  await mkdir(stagingParentPath, { recursive: true });
  const stagingParent = await readRealDirectoryIdentity(stagingParentPath, 'React Router staging parent');
  if (stagingParent.realPath !== join(tree.spikeRoot.realPath, '.react-router')) {
    throw new Error('React Router staging parent resolves outside the owned spike root');
  }
  const stagingRootPath = await mkdtemp(join(stagingParent.path, 'export-stage-'));
  await chmod(stagingRootPath, PRIVATE_STAGING_MODE);
  const stagingRoot = await readRealDirectoryIdentity(stagingRootPath, 'React Router export staging root');
  if (dirname(stagingRoot.realPath) !== stagingParent.realPath) {
    throw new Error('React Router export staging root resolves outside the owned staging parent');
  }
  if (stagingRoot.mode !== PRIVATE_STAGING_MODE) {
    throw new Error('React Router export staging root must remain private to the build owner');
  }

  await assertOwnedOutputTreeCurrent(tree);
  const stagedOutputPath = join(stagingRoot.path, 'build');
  await rename(tree.outputRoot.path, stagedOutputPath);
  const outputRoot = await readRealDirectoryIdentity(stagedOutputPath, 'staged React Router output root');
  if (outputRoot.dev !== tree.outputRoot.dev
    || outputRoot.ino !== tree.outputRoot.ino
    || outputRoot.uid !== tree.outputRoot.uid
    || outputRoot.realPath !== join(stagingRoot.realPath, 'build')) {
    throw new Error('React Router output changed while entering the owned staging root');
  }
  return { publicOutputPath: tree.outputRoot.path, stagingRoot, outputRoot };
}

async function stageCanonicalBuildIfPresent(spikeRoot: string): Promise<OwnedStagedOutput | undefined> {
  const buildPath = join(spikeRoot, 'build');
  const existing = await lstat(buildPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!existing) return undefined;
  return stageOwnedOutput(await readOwnedOutputTree(spikeRoot));
}

async function retainFailedStaging(
  staged: OwnedStagedOutput,
  beforeRetention?: (context: StagingContext) => Promise<void>,
): Promise<void> {
  try {
    await assertOwnedStagedOutputCurrent(staged);
    await beforeRetention?.({
      stagedOutput: staged.outputRoot.path,
      stagedClient: join(staged.outputRoot.path, 'client'),
    });
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
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1
      || (typeof process.getuid === 'function' && before.uid !== process.getuid())) {
      throw new Error(`${label} must be one regular owned file`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!after.isFile()
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.uid !== before.uid
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs) {
      throw new Error(`${label} changed during checksum verification`);
    }
    const current = await lstat(path);
    if (current.isSymbolicLink()
      || !current.isFile()
      || current.dev !== after.dev
      || current.ino !== after.ino
      || current.uid !== after.uid
      || current.nlink !== after.nlink
      || current.size !== after.size
      || current.mtimeMs !== after.mtimeMs
      || current.ctimeMs !== after.ctimeMs) {
      throw new Error(`${label} changed after checksum verification`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function outputFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  const names = (await readdir(directory)).sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    const path = join(directory, name);
    const state = await lstat(path);
    if (state.isSymbolicLink()) throw new Error(`${path}: exported asset must not be a symbolic link`);
    if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
      throw new Error(`${path}: exported asset must be owned by the build user`);
    }
    if (state.isDirectory()) files.push(...await outputFiles(root, path));
    else if (state.isFile()) files.push(relative(root, path).split(sep).join('/'));
    else throw new Error(`${path}: unexpected special exported asset file`);
  }
  return files;
}

async function verifyExportedAssets(
  outputClient: string,
  expected: ReadonlyMap<string, VerifiedReleaseAsset>,
): Promise<void> {
  const outputContent = join(outputClient, 'assets/content');
  await assertRealDirectory(outputContent, 'exported release assets root');
  const actualPaths = (await outputFiles(outputContent)).map((path) => `assets/content/${path}`);
  const expectedPaths = [...expected.keys()];
  const unexpected = actualPaths.filter((path) => !expected.has(path));
  const missing = expectedPaths.filter((path) => !actualPaths.includes(path));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`exported asset inventory mismatch: unexpected=${unexpected.join(',')} missing=${missing.join(',')}`);
  }
  for (const [relativePath, asset] of expected) {
    const bytes = await readOwnedRegularFile(join(outputClient, relativePath), relativePath);
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (checksum !== asset.checksum) throw new Error(`${relativePath}: exported asset checksum mismatch`);
  }
}

async function copyVerifiedAssets(
  staged: OwnedStagedOutput,
  active: VerifiedActivePublicRelease,
): Promise<void> {
  const out = join(staged.outputRoot.path, 'client');
  await assertOwnedStagedOutputCurrent(staged);
  const outputContent = join(out, 'assets/content');
  const existing = await lstat(outputContent).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new Error('Existing exported release assets root must be a real directory');
  }
  if (existing) throw new Error('Existing exported release assets are untrusted build output');
  await assertOwnedStagedOutputCurrent(staged);
  await mkdir(outputContent, { recursive: true });
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
  await verifyExportedAssets(out, expected);
}

function headersFile(): string {
  return '/*\n' + Object.entries(PUBLIC_SECURITY_HEADERS)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join('\n') + '\n';
}

function notFoundHtml(): string {
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>페이지를 찾을 수 없습니다 · FORM &amp; THOUGHT</title>'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="manifest" href="/site.webmanifest">'
    + '</head><body><main><p>FORM &amp; THOUGHT</p><h1>페이지를 찾을 수 없습니다</h1>'
    + '<p><a href="/">홈으로 돌아가기</a></p></main></body></html>\n';
}

function memoryMapRedirectHtml(origin: string): string {
  const canonical = new URL('/memory/', `${origin}/`).href;
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex">'
    + '<title>문장으로 이동 · FORM &amp; THOUGHT</title>'
    + `<link rel="canonical" href="${canonical}">`
    + `<meta property="og:url" content="${canonical}">`
    + '<meta http-equiv="refresh" content="0;url=/memory/">'
    + '</head><body><main><p>FORM &amp; THOUGHT</p>'
    + '<p><a href="/memory/">문장으로 이동</a></p></main></body></html>\n';
}

async function ensureRealDeliveryDirectory(parent: string, name: string): Promise<string> {
  const path = join(parent, name);
  await mkdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error(`Delivery artifact directory must be real: ${name}`);
  }
  return path;
}

async function writeMemoryMapCompatibilityRedirect(outputClient: string, origin: string): Promise<void> {
  const memory = await ensureRealDeliveryDirectory(outputClient, 'memory');
  const map = await ensureRealDeliveryDirectory(memory, 'map');
  const path = join(map, 'index.html');
  const state = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (state && (state.isSymbolicLink() || !state.isFile())) {
    throw new Error('Memory map compatibility document must be a real file');
  }
  const handle = await open(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(memoryMapRedirectHtml(origin), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDeliveryArtifacts(
  staged: OwnedStagedOutput,
  active: VerifiedActivePublicRelease,
  environment: NodeJS.ProcessEnv,
  mode: DeliveryMode,
): Promise<void> {
  await assertOwnedStagedOutputCurrent(staged);
  const outputClient = join(staged.outputRoot.path, 'client');
  const origin = resolveSiteOrigin(environment, mode);
  await writeMemoryMapCompatibilityRedirect(outputClient, origin);
  const writes = [
    ['sitemap.xml', sitemapXml(fullPublicPaths(active), origin)],
    ['robots.txt', robotsText(origin)],
    ['404.html', notFoundHtml()],
    ['_headers', headersFile()],
  ] as const;
  for (const [name, contents] of writes) {
    await writeFile(join(outputClient, name), contents, { encoding: 'utf8', flag: 'wx' });
  }
  await assertOwnedStagedOutputCurrent(staged);
}

async function publishVerifiedStaging(
  staged: OwnedStagedOutput,
  releasesRoot: string,
  binding: string,
): Promise<void> {
  await assertOwnedStagedOutputCurrent(staged);
  const existing = await lstat(staged.publicOutputPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) throw new Error('Public React Router output appeared before verified publication');

  const active = await readBoundActiveRelease(releasesRoot, binding);
  await assertOwnedStagedOutputCurrent(staged);
  await verifyExportedAssets(join(staged.outputRoot.path, 'client'), expectedAssets(active));
  await readBoundActiveRelease(releasesRoot, binding);
  await assertOwnedStagedOutputCurrent(staged);
  // Node 24 on macOS does not expose an immutable-directory transaction or a
  // no-replace directory rename. The owner-only staging root and the absence of
  // application hooks after this final seal define the cooperative same-user boundary.
  await rename(staged.outputRoot.path, staged.publicOutputPath);
  const published = await readRealDirectoryIdentity(staged.publicOutputPath, 'published React Router output root');
  if (published.dev !== staged.outputRoot.dev
    || published.ino !== staged.outputRoot.ino
    || published.uid !== staged.outputRoot.uid) {
    throw new Error('Published React Router output does not match the verified staging object');
  }
}

async function runProductionReactRouterBuild(spikeRoot: string, environment: NodeJS.ProcessEnv): Promise<void> {
  const packageJson = fileURLToPath(import.meta.resolve('@react-router/dev/package.json'));
  const reactRouterCli = join(dirname(packageJson), 'bin.cjs');
  await new Promise<void>((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [reactRouterCli, 'build'], {
      cwd: spikeRoot,
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', rejectBuild);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`React Router build failed with ${signal ? `signal ${signal}` : `exit ${code ?? 'unknown'}`}`));
    });
  });
}

export async function buildStaticExport(options: StaticExportOptions): Promise<void> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const spikeRoot = resolve(options.spikeRoot);
  const releasesRoot = join(repositoryRoot, 'build/public-releases');
  const initial = await readActiveRelease(releasesRoot);
  const binding = serializeReleaseBinding(initial);
  const configuredDeliveryMode = process.env.FORM_THOUGHT_DELIVERY_MODE;
  if (configuredDeliveryMode !== undefined
    && configuredDeliveryMode !== 'local'
    && configuredDeliveryMode !== 'production') {
    throw new Error('FORM_THOUGHT_DELIVERY_MODE must be local or production');
  }
  const deliveryMode = options.deliveryMode
    ?? configuredDeliveryMode
    ?? (process.env.NODE_ENV === 'test' ? 'local' : 'production');
  const siteOrigin = resolveSiteOrigin(process.env, deliveryMode);
  const environment = {
    ...process.env,
    [PUBLIC_RELEASE_BINDING_ENV]: binding,
    VITE_FORM_THOUGHT_SITE_ORIGIN: siteOrigin,
  };
  const runReactRouterBuild = options.runReactRouterBuild
    ?? ((context: ReactRouterBuildContext) => runProductionReactRouterBuild(spikeRoot, context.environment));

  await stageCanonicalBuildIfPresent(spikeRoot);
  let staged: OwnedStagedOutput | undefined;
  try {
    await runReactRouterBuild({ environment });
    const outputTree = await readOwnedOutputTree(spikeRoot);
    staged = await stageOwnedOutput(outputTree);
    const afterBuild = await readBoundActiveRelease(releasesRoot, binding);
    await copyVerifiedAssets(staged, afterBuild);
    await writeDeliveryArtifacts(
      staged,
      afterBuild,
      environment,
      deliveryMode,
    );
    await readBoundActiveRelease(releasesRoot, binding);
    await options.beforeVerifiedStagingPublication?.({
      stagedOutput: staged.outputRoot.path,
      stagedClient: join(staged.outputRoot.path, 'client'),
    });
    await publishVerifiedStaging(staged, releasesRoot, binding);
  } catch (error) {
    if (!staged) {
      try {
        staged = await stageCanonicalBuildIfPresent(spikeRoot);
      } catch (retentionError) {
        throw new AggregateError(
          [error, retentionError],
          'React Router build failed and its output could not be retained safely',
        );
      }
    }
    if (staged) await retainFailedStaging(staged, options.beforeFailedStagingRetention);
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const spikeRoot = resolve(process.cwd());
  await buildStaticExport({ repositoryRoot: resolve(spikeRoot, '../..'), spikeRoot });
}
