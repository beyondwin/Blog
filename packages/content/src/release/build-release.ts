import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  mkdir,
  lstat,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  type FileHandle,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isPublicRecord, parsePublicRecord, type PublicMedia, type PublicRecord } from '@beyondwin/contracts';
import {
  buildResponsiveMedia,
  loadSourceMediaBuildInput,
  publicMediaHashInput,
  type ReleaseMediaAsset,
  type SourceMediaBuildInput,
} from '../media/build-responsive-media';
import { analyzeTrustedMdx, renderTrustedMdx } from '../mdx/render';
import type { SourceRecord } from '../schemas';
import { loadPublicMemoryRecords, loadSourceRecords } from '../source-records';
import {
  activeReleasePointerSchema,
  canonicalJson,
  parseReleaseManifest,
  resolveOwnedReleasesRoot,
  verifyReleaseDirectory,
  type ActiveReleasePointer,
  type PublicReleaseManifest,
} from './read-release';

export const PUBLIC_RELEASE_RENDERER_VERSION = 'mdx-3.1.1-sharp-0.35.3-v3';

type SourceCollection = Exclude<SourceRecord['collection'], 'memory'>;

export interface BuildPublicReleaseOptions {
  root: string;
  releasesRoot?: string;
  activate?: boolean;
}

export interface BuildPublicReleaseResult {
  releaseId: string;
  releasePath: string;
  manifest: PublicReleaseManifest;
}

export interface OwnedTemporaryRoot {
  readonly path: string;
}

export interface PreparedActiveRelease {
  readonly pointer: ActiveReleasePointer;
}

const ownedTemporaryRoots = new WeakMap<object, string>();
const preparedActiveReleases = new WeakMap<object, {
  releasesRoot: string;
  temporaryPath: string;
  activePath: string;
  bytes: string;
}>();
const activeActivationRoots = new Set<string>();

function sortedRecord<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isDirectory()) throw new Error(`${path}: fsync target must be a directory`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

interface OwnedPointerFile {
  handle: FileHandle;
  bytes: string;
  dev: number;
  ino: number;
}

interface OwnedDirectory {
  handle: FileHandle;
  path: string;
  dev: number;
  ino: number;
}

async function openOwnedDirectory(path: string): Promise<OwnedDirectory> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
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
      throw new Error('public-releases root must be one real directory owned by the current user');
    }
    return { handle, path, dev: state.dev, ino: state.ino };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertOwnedDirectory(directory: OwnedDirectory): Promise<void> {
  const pathState = await lstat(directory.path);
  const handleState = await directory.handle.stat();
  if (
    pathState.isSymbolicLink()
    || !pathState.isDirectory()
    || pathState.dev !== directory.dev
    || pathState.ino !== directory.ino
    || handleState.dev !== directory.dev
    || handleState.ino !== directory.ino
  ) {
    throw new Error('public-releases root changed during active pointer operation');
  }
}

async function openOwnedPointerFile(path: string, label: string): Promise<OwnedPointerFile> {
  let file;
  try {
    file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`${label} must not be a symbolic link`);
    }
    throw error;
  }
  try {
    const state = await file.stat();
    if (
      !state.isFile()
      || state.nlink !== 1
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())
    ) {
      throw new Error(`${label} must be one regular owned file`);
    }
    return {
      handle: file,
      bytes: await file.readFile('utf8'),
      dev: state.dev,
      ino: state.ino,
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function assertPointerPathMatches(
  path: string,
  owned: OwnedPointerFile,
  label: string,
): Promise<void> {
  let state;
  try {
    state = await lstat(path);
  } catch {
    throw new Error(`${label} changed during activation`);
  }
  const handleState = await owned.handle.stat();
  if (
    state.isSymbolicLink()
    || !state.isFile()
    || state.nlink !== 1
    || state.dev !== owned.dev
    || state.ino !== owned.ino
    || handleState.dev !== owned.dev
    || handleState.ino !== owned.ino
  ) {
    throw new Error(`${label} inode changed during activation`);
  }
}

async function previousActiveBytes(path: string, directory: OwnedDirectory): Promise<string | undefined> {
  let previous: OwnedPointerFile | undefined;
  try {
    await assertOwnedDirectory(directory);
    previous = await openOwnedPointerFile(path, 'existing active pointer');
    activeReleasePointerSchema.parse(JSON.parse(previous.bytes));
    await assertPointerPathMatches(path, previous, 'existing active pointer');
    await assertOwnedDirectory(directory);
    return previous.bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  } finally {
    if (previous) await previous.handle.close();
  }
}

async function restorePreviousActivePointer(
  directory: OwnedDirectory,
  temporaryPath: string,
  activePath: string,
  previousBytes: string | undefined,
): Promise<void> {
  await assertOwnedDirectory(directory);
  if (previousBytes === undefined) {
    await rm(activePath, { force: true });
    await assertOwnedDirectory(directory);
    await directory.handle.sync();
    return;
  }
  const rollback = await open(
    temporaryPath,
    fsConstants.O_WRONLY
      | fsConstants.O_CREAT
      | fsConstants.O_EXCL
      | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await rollback.writeFile(previousBytes, 'utf8');
    await rollback.sync();
  } finally {
    await rollback.close();
  }
  await assertOwnedDirectory(directory);
  await rename(temporaryPath, activePath);
  await assertOwnedDirectory(directory);
  await directory.handle.sync();
}

async function fsyncTree(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await fsyncTree(path);
    else if (entry.isFile()) {
      const handle = await open(path, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } else {
      throw new Error(`${path}: release staging does not permit symlinks or special files`);
    }
  }
  await fsyncDirectory(root);
}

export async function createOwnedTemporaryRoot(parent: string): Promise<OwnedTemporaryRoot> {
  const resolvedParent = resolve(parent);
  await mkdir(resolvedParent, { recursive: true });
  const ownedParent = await resolveOwnedReleasesRoot(resolvedParent);
  const path = await mkdtemp(join(ownedParent, '.tmp-public-release-'));
  const handle = Object.freeze({ path });
  ownedTemporaryRoots.set(handle, path);
  return handle;
}

export async function cleanupOwnedTemporaryRoot(handle: OwnedTemporaryRoot): Promise<void> {
  const path = handle && typeof handle === 'object' ? ownedTemporaryRoots.get(handle) : undefined;
  if (!path || handle.path !== path) throw new Error('cleanup target is not an owned temporary root');
  ownedTemporaryRoots.delete(handle);
  await rm(path, { recursive: true, force: true });
}

function referencedMedia(
  record: SourceRecord,
  figureMediaIds: Iterable<string>,
): Map<string, 'figure' | 'intrinsic'> {
  const references = new Map<string, 'figure' | 'intrinsic'>();
  if ((record.collection === 'articles' || record.collection === 'thoughts') && record.featuredMedia) {
    references.set(record.featuredMedia, 'intrinsic');
  }
  if (record.collection === 'reviews' && record.coverMedia) references.set(record.coverMedia, 'intrinsic');
  if (record.collection === 'travel' && record.leadMedia) references.set(record.leadMedia, 'intrinsic');
  for (const mediaId of figureMediaIds) references.set(mediaId, 'figure');
  return references;
}

async function loadRecordMedia(root: string, record: SourceRecord): Promise<SourceMediaBuildInput[]> {
  const inputs: SourceMediaBuildInput[] = [];
  const analysis = await analyzeTrustedMdx(record.body);
  for (const [mediaId, role] of [...referencedMedia(record, analysis.figureMediaIds)]
    .sort(([left], [right]) => left.localeCompare(right))) {
    inputs.push(await loadSourceMediaBuildInput(
      root,
      record.collection as SourceCollection,
      record.id,
      mediaId,
      role,
    ));
  }
  return inputs;
}

function optional<T extends object, K extends string, V>(key: K, value: V | undefined): T | Record<K, V> {
  return value === undefined ? {} as T : { [key]: value } as Record<K, V>;
}

function publicRecordInput(
  record: SourceRecord,
  media: PublicMedia[],
  bodyHtml: string,
): unknown {
  const common = {
    collection: record.collection,
    id: record.id,
    href: record.href,
    title: record.title,
    description: record.description,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    tags: record.tags,
    media,
    relationships: record.relationships,
    memoryLinks: [],
    bodyHtml,
  };

  if (record.collection === 'analysis') return {
    ...common,
    sourceTitle: record.sourceTitle,
    sourceUrl: record.sourceUrl,
    comment: record.comment,
    format: record.format,
  };
  if (record.collection === 'articles') return {
    ...common,
    ...optional('recordKind', record.recordKind),
    ...optional('evidenceState', record.evidenceState),
    ...optional('featuredMedia', record.featuredMedia),
  };
  if (record.collection === 'thoughts') return {
    ...common,
    ...optional('featuredMedia', record.featuredMedia),
  };
  if (record.collection === 'ideas') return { ...common, maturity: record.maturity };
  if (record.collection === 'reviews') return {
    ...common,
    itemType: record.itemType,
    authors: record.itemAuthor
      ? (Array.isArray(record.itemAuthor) ? record.itemAuthor : [record.itemAuthor])
      : [],
    ...optional('isbn13', record.isbn13),
    ...optional('editionLabel', record.editionLabel),
    readEditionVerified: record.readEditionVerified,
    ...optional('publisher', record.publisher),
    ...optional('coverState', record.coverState),
    ...optional('coverMedia', record.coverMedia),
    ...optional('verdict', record.verdict),
    ...optional('rating', record.rating),
    ...optional('completedAt', record.completedAt),
    ...optional('sourceUrl', record.sourceUrl),
  };
  return {
    ...common,
    location: record.location,
    ...optional('visitedAt', record.visitedAt),
    ...optional('leadMedia', record.leadMedia),
  };
}

function releaseIdFor(input: unknown): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

async function installImmutableRelease(
  releasesRoot: string,
  staging: OwnedTemporaryRoot,
  releaseId: string,
  expectedManifestBytes: string,
): Promise<string> {
  const releasePath = join(releasesRoot, releaseId);
  let releaseExists = true;
  try {
    const state = await lstat(releasePath);
    if (state.isSymbolicLink()) throw new Error(`${releaseId}: immutable release path must not be a symbolic link`);
    if (!state.isDirectory()) throw new Error(`${releaseId}: immutable release path must be a directory`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') releaseExists = false;
    else throw error;
  }

  if (releaseExists) {
    const installed = await verifyReleaseDirectory(releasesRoot, { releaseId, path: releaseId });
    const currentManifest = `${canonicalJson(installed.manifest)}\n`;
    if (currentManifest !== expectedManifestBytes) {
      throw new Error(`${releaseId}: immutable release directory already exists with different content`);
    }
    return releasePath;
  }

  await fsyncTree(staging.path);
  await rename(staging.path, releasePath);
  ownedTemporaryRoots.delete(staging);
  await fsyncDirectory(releasesRoot);
  return releasePath;
}

export async function prepareActiveRelease(
  releasesRoot: string,
  pointerInput: ActiveReleasePointer,
): Promise<PreparedActiveRelease> {
  const pointer = activeReleasePointerSchema.parse(pointerInput);
  await verifyReleaseDirectory(releasesRoot, pointer);
  const bytes = `${canonicalJson(pointer)}\n`;
  const temporaryPath = join(releasesRoot, 'active.json.tmp');
  const activePath = join(releasesRoot, 'active.json');
  let file;
  try {
    file = await open(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('active pointer temporary path must not be a symbolic link');
    }
    throw error;
  }
  try {
    const fileState = await file.stat();
    if (!fileState.isFile() || fileState.nlink !== 1) {
      throw new Error('active pointer temporary path must be one regular owned file');
    }
    await file.truncate(0);
    await file.writeFile(bytes, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }

  const prepared = Object.freeze({ pointer });
  preparedActiveReleases.set(prepared, {
    releasesRoot: resolve(releasesRoot),
    temporaryPath,
    activePath,
    bytes,
  });
  return prepared;
}

export async function activateRelease(prepared: PreparedActiveRelease): Promise<void> {
  const state = prepared && typeof prepared === 'object' ? preparedActiveReleases.get(prepared) : undefined;
  if (!state) throw new Error('activation is not an owned prepared release');
  if (activeActivationRoots.has(state.releasesRoot)) {
    throw new Error('an active pointer operation is already in progress for this releases root');
  }
  activeActivationRoots.add(state.releasesRoot);
  let pointerFile: OwnedPointerFile | undefined;
  let releasesDirectory: OwnedDirectory | undefined;
  try {
    releasesDirectory = await openOwnedDirectory(state.releasesRoot);
    pointerFile = await openOwnedPointerFile(state.temporaryPath, 'prepared active pointer');
    if (pointerFile.bytes !== state.bytes) throw new Error('prepared active pointer changed before rename');
    await assertPointerPathMatches(state.temporaryPath, pointerFile, 'prepared active pointer');
    const previousBytes = await previousActiveBytes(state.activePath, releasesDirectory);
    await assertOwnedDirectory(releasesDirectory);
    await assertPointerPathMatches(state.temporaryPath, pointerFile, 'prepared active pointer');
    preparedActiveReleases.delete(prepared);
    await rename(state.temporaryPath, state.activePath);
    try {
      await assertPointerPathMatches(state.activePath, pointerFile, 'active pointer');
    } catch (error) {
      await restorePreviousActivePointer(
        releasesDirectory,
        state.temporaryPath,
        state.activePath,
        previousBytes,
      );
      throw error;
    }
    await assertOwnedDirectory(releasesDirectory);
    await releasesDirectory.handle.sync();
  } finally {
    if (pointerFile) await pointerFile.handle.close();
    if (releasesDirectory) await releasesDirectory.handle.close();
    activeActivationRoots.delete(state.releasesRoot);
  }
}

export async function buildPublicRelease(
  options: BuildPublicReleaseOptions,
): Promise<BuildPublicReleaseResult> {
  const root = resolve(options.root);
  const releasesRoot = resolve(options.releasesRoot ?? join(root, 'build', 'public-releases'));
  await mkdir(releasesRoot, { recursive: true });

  const sourceRecords = (await loadSourceRecords(root))
    .filter(isPublicRecord)
    .sort((left, right) => `${left.collection}/${left.id}`.localeCompare(`${right.collection}/${right.id}`));
  const memoryRecords = (await loadPublicMemoryRecords(root))
    .sort((left, right) => left.id.localeCompare(right.id));
  const recordMedia = new Map<string, SourceMediaBuildInput[]>();
  for (const record of sourceRecords) {
    recordMedia.set(`${record.collection}/${record.id}`, await loadRecordMedia(root, record));
  }

  const hashInput = {
    schemaVersion: 1,
    rendererVersion: PUBLIC_RELEASE_RENDERER_VERSION,
    records: sourceRecords.map((record) => ({
      public: publicRecordInput(
        record,
        (recordMedia.get(`${record.collection}/${record.id}`) ?? []).map((input) => input.publicMedia),
        '',
      ),
      body: record.body,
      media: (recordMedia.get(`${record.collection}/${record.id}`) ?? []).map(publicMediaHashInput),
    })),
    memory: memoryRecords,
  };
  const releaseId = releaseIdFor(hashInput);
  const staging = await createOwnedTemporaryRoot(releasesRoot);

  try {
    const assets = new Map<string, ReleaseMediaAsset>();
    for (const record of sourceRecords) {
      const key = `${record.collection}/${record.id}`;
      for (const input of recordMedia.get(key) ?? []) {
        const asset = await buildResponsiveMedia(input, staging.path);
        assets.set(`${key}/${asset.id}`, asset);
      }
    }

    const records = new Map<string, PublicRecord>();
    for (const record of sourceRecords) {
      const key = `${record.collection}/${record.id}`;
      const recordAssets = new Map(
        [...assets]
          .filter(([assetKey]) => assetKey.startsWith(`${key}/`))
          .map(([, asset]) => [asset.id, asset] as const),
      );
      const foldBriefTable = record.collection === 'articles'
        && (record.evidenceState === 'source-grounded' || record.tags.includes('source-grounded'));
      const bodyHtml = await renderTrustedMdx(record.body, { media: recordAssets, foldBriefTable });
      const publicRecord = parsePublicRecord(publicRecordInput(
        record,
        (recordMedia.get(key) ?? []).map((input) => input.publicMedia),
        bodyHtml,
      ));
      records.set(key, publicRecord);
    }
    for (const memoryRecord of memoryRecords) records.set(`memory/${memoryRecord.id}`, memoryRecord);

    const manifest = parseReleaseManifest({
      schemaVersion: 1,
      rendererVersion: PUBLIC_RELEASE_RENDERER_VERSION,
      releaseId,
      records: sortedRecord(records),
      assets: sortedRecord(assets),
    });
    const manifestBytes = `${canonicalJson(manifest)}\n`;
    const manifestFile = await open(join(staging.path, 'manifest.json'), 'w', 0o644);
    try {
      await manifestFile.writeFile(manifestBytes, 'utf8');
      await manifestFile.sync();
    } finally {
      await manifestFile.close();
    }

    const releasePath = await installImmutableRelease(
      releasesRoot,
      staging,
      releaseId,
      manifestBytes,
    );
    if (options.activate !== false) {
      const prepared = await prepareActiveRelease(releasesRoot, { releaseId, path: releaseId });
      await activateRelease(prepared);
    }
    return { releaseId, releasePath, manifest };
  } finally {
    if (ownedTemporaryRoots.has(staging)) await cleanupOwnedTemporaryRoot(staging);
  }
}
