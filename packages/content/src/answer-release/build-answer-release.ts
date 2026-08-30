import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  type FileHandle,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  publicAnswerCorpusApprovalSchema,
  publicAnswerReleaseManifestSchema,
  type PublicAnswerCorpusApproval,
  type PublicAnswerReleaseManifest,
} from '@beyondwin/contracts';
import type { VerifiedActivePublicRelease } from '../release/read-release';
import { buildAnswerIndexes } from './build-index-inputs';
import { buildPublicAnswerCorpus } from './chunk-public-records';
import {
  ANSWER_CHUNKER_VERSION,
  ANSWER_NORMALIZER_VERSION,
  canonicalJsonLine,
  codePointCompare,
  sha256Checksum,
  sha256Hex,
} from './identity';
import {
  readActiveAnswerRelease,
  verifyAnswerReleaseDirectory,
} from './read-answer-release';
import {
  assertOwnedAnswerDirectory,
  canonicalAnswerPrettyJson,
  readOwnedAnswerFile,
} from './verified-files';

export interface BuildPublicAnswerReleaseOptions {
  contentRelease: VerifiedActivePublicRelease;
  approval: PublicAnswerCorpusApproval;
  answerReleasesRoot: string;
  answerOnlyCapsules?: readonly unknown[];
  activate?: boolean;
}

export interface BuildPublicAnswerReleaseResult {
  answerReleaseId: string;
  releasePath: string;
  manifest: PublicAnswerReleaseManifest;
}

export interface OwnedAnswerTemporaryRoot {
  readonly path: string;
}

type MaterializedFile = {
  path: 'chunks.ndjson' | 'evidence.ndjson' | 'index-inputs.ndjson' | 'lexical-index.json';
  checksum: string;
  bytes: number;
  count: number;
};

const ownedTemporaryRoots = new WeakMap<object, string>();

function canonicalNdjson(values: readonly unknown[]): Buffer {
  return Buffer.from(values.map((value) => `${canonicalJsonLine(value)}\n`).join(''));
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

async function writeOwnedFile(path: string, bytes: Buffer | string, mode = 0o644): Promise<void> {
  const file = await open(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    mode,
  );
  try {
    const state = await file.stat();
    if (!state.isFile() || state.nlink !== 1 || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error(`${path}: answer release output must be one regular owned file`);
    }
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function createOwnedAnswerTemporaryRoot(parent: string): Promise<OwnedAnswerTemporaryRoot> {
  const resolvedParent = resolve(parent);
  await mkdir(resolvedParent, { recursive: true });
  await assertOwnedAnswerDirectory(resolvedParent);
  const path = await mkdtemp(join(resolvedParent, '.tmp-public-answer-release-'));
  const owned = Object.freeze({ path });
  ownedTemporaryRoots.set(owned, path);
  return owned;
}

export async function cleanupOwnedAnswerTemporaryRoot(owned: OwnedAnswerTemporaryRoot): Promise<void> {
  const path = owned && typeof owned === 'object' ? ownedTemporaryRoots.get(owned) : undefined;
  if (!path || owned.path !== path) throw new Error('cleanup target is not an owned answer temporary root');
  ownedTemporaryRoots.delete(owned);
  await rm(path, { recursive: true, force: true });
}

function descriptor(path: MaterializedFile['path'], bytes: Buffer, count: number): MaterializedFile {
  return { path, checksum: sha256Checksum(bytes), bytes: bytes.byteLength, count };
}

async function installRelease(
  root: string,
  staging: OwnedAnswerTemporaryRoot,
  contentRelease: VerifiedActivePublicRelease,
  approval: PublicAnswerCorpusApproval,
  manifestBytes: string,
  answerReleaseId: string,
): Promise<string> {
  const contentDirectory = join(root, contentRelease.manifest.releaseId);
  await mkdir(contentDirectory, { recursive: true });
  await assertOwnedAnswerDirectory(contentDirectory);
  const releasePath = join(contentDirectory, answerReleaseId);
  try {
    const state = await lstat(releasePath);
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error(`${answerReleaseId}: immutable answer release path must be a real directory`);
    }
    const installed = await verifyAnswerReleaseDirectory(releasePath, contentRelease, approval);
    const currentManifest = await readOwnedAnswerFile(releasePath, 'manifest.json');
    if (currentManifest.bytes.toString('utf8') !== manifestBytes || installed.answerReleaseId !== answerReleaseId) {
      throw new Error(`${answerReleaseId}: immutable answer release already exists with different bytes`);
    }
    return releasePath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fsyncDirectory(staging.path);
  await rename(staging.path, releasePath);
  ownedTemporaryRoots.delete(staging);
  await fsyncDirectory(contentDirectory);
  await fsyncDirectory(root);
  return releasePath;
}

interface OpenedPointer {
  handle: FileHandle;
  dev: number;
  ino: number;
}

async function assertPointerIdentity(path: string, pointer: OpenedPointer): Promise<void> {
  const state = await lstat(path);
  const opened = await pointer.handle.stat();
  if (
    state.isSymbolicLink()
    || !state.isFile()
    || state.nlink !== 1
    || state.dev !== pointer.dev
    || state.ino !== pointer.ino
    || opened.dev !== pointer.dev
    || opened.ino !== pointer.ino
  ) {
    throw new Error('active answer release pointer inode changed during activation');
  }
}

async function writeActivePointer(
  root: string,
  releasePath: string,
  contentRelease: VerifiedActivePublicRelease,
  approval: PublicAnswerCorpusApproval,
  answerReleaseId: string,
): Promise<void> {
  await verifyAnswerReleaseDirectory(releasePath, contentRelease, approval);
  await assertOwnedAnswerDirectory(root);
  const pointer = {
    schemaVersion: 1 as const,
    contentReleaseId: contentRelease.manifest.releaseId,
    answerReleaseId,
    path: `${contentRelease.manifest.releaseId}/${answerReleaseId}`,
  };
  const bytes = canonicalAnswerPrettyJson(pointer);
  const temporaryPath = join(root, 'active.json.tmp');
  const activePath = join(root, 'active.json');
  let file: FileHandle;
  try {
    file = await open(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('active answer release temporary pointer must not be a symbolic link');
    }
    throw error;
  }
  const state = await file.stat();
  const opened: OpenedPointer = { handle: file, dev: state.dev, ino: state.ino };
  try {
    if (!state.isFile() || state.nlink !== 1 || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error('active answer release temporary pointer must be one regular owned single-link file');
    }
    await assertPointerIdentity(temporaryPath, opened);
    await file.truncate(0);
    await file.writeFile(bytes, 'utf8');
    await file.sync();
    await assertPointerIdentity(temporaryPath, opened);
    await verifyAnswerReleaseDirectory(releasePath, contentRelease, approval);
    await assertOwnedAnswerDirectory(root);
    await rename(temporaryPath, activePath);
    await assertPointerIdentity(activePath, opened);
    await fsyncDirectory(root);
  } finally {
    await file.close();
  }
  const active = await readActiveAnswerRelease(root, contentRelease, approval);
  if (active.answerReleaseId !== answerReleaseId) throw new Error('active answer release verification mismatch');
}

export async function buildPublicAnswerRelease(
  options: BuildPublicAnswerReleaseOptions,
): Promise<BuildPublicAnswerReleaseResult> {
  if (options.answerOnlyCapsules && options.answerOnlyCapsules.length > 0) {
    throw new Error('answer-only capsules are not supported in public answer release v1');
  }
  if (!Object.hasOwn(options, 'approval') || options.approval === undefined) {
    throw new Error('public answer corpus approval is required');
  }
  const approval = publicAnswerCorpusApprovalSchema.parse(options.approval);
  const corpus = buildPublicAnswerCorpus(options.contentRelease, { approval });
  const chunks = [...corpus.chunks].sort((left, right) => codePointCompare(left.chunkId, right.chunkId));
  const evidence = [...corpus.evidence].sort((left, right) => codePointCompare(left.evidenceId, right.evidenceId));
  const indexes = buildAnswerIndexes(chunks);
  const chunksBytes = canonicalNdjson(chunks);
  const evidenceBytes = canonicalNdjson(evidence);
  const indexInputsBytes = canonicalNdjson(indexes.indexInputs);
  const lexicalIndexBytes = Buffer.from(canonicalAnswerPrettyJson(indexes.lexicalIndex));
  const files = [
    descriptor('chunks.ndjson', chunksBytes, chunks.length),
    descriptor('evidence.ndjson', evidenceBytes, evidence.length),
    descriptor('index-inputs.ndjson', indexInputsBytes, indexes.indexInputs.length),
    descriptor('lexical-index.json', lexicalIndexBytes, indexes.lexicalIndex.documents.length),
  ];
  const identity = {
    schemaVersion: 1 as const,
    contentReleaseId: options.contentRelease.manifest.releaseId,
    contentManifestHash: options.contentRelease.manifestHash,
    contentArtifactHash: options.contentRelease.artifactHash,
    corpusApprovalHash: sha256Checksum(canonicalJsonLine(approval)),
    chunkerVersion: ANSWER_CHUNKER_VERSION,
    normalizerVersion: ANSWER_NORMALIZER_VERSION,
    collections: ['articles', 'reviews', 'thoughts'] as const,
  };
  const answerReleaseId = sha256Hex(canonicalJsonLine({ identity, files }));
  const manifest = publicAnswerReleaseManifestSchema.parse({
    schemaVersion: 1,
    answerReleaseId,
    identity,
    files: {
      chunks: files[0],
      evidence: files[1],
      indexInputs: files[2],
      lexicalIndex: files[3],
    },
    counts: {
      records: new Set(chunks.map((chunk) => chunk.recordId)).size,
      chunks: chunks.length,
      evidence: evidence.length,
      answerOnly: 0,
    },
  });
  const manifestBytes = canonicalAnswerPrettyJson(manifest);
  const answerReleasesRoot = resolve(options.answerReleasesRoot);
  const staging = await createOwnedAnswerTemporaryRoot(answerReleasesRoot);
  try {
    await Promise.all([
      writeOwnedFile(join(staging.path, 'chunks.ndjson'), chunksBytes),
      writeOwnedFile(join(staging.path, 'evidence.ndjson'), evidenceBytes),
      writeOwnedFile(join(staging.path, 'index-inputs.ndjson'), indexInputsBytes),
      writeOwnedFile(join(staging.path, 'lexical-index.json'), lexicalIndexBytes),
    ]);
    await writeOwnedFile(join(staging.path, 'manifest.json'), manifestBytes);
    const releasePath = await installRelease(
      answerReleasesRoot,
      staging,
      options.contentRelease,
      approval,
      manifestBytes,
      answerReleaseId,
    );
    if (options.activate !== false) {
      await writeActivePointer(
        answerReleasesRoot,
        releasePath,
        options.contentRelease,
        approval,
        answerReleaseId,
      );
    }
    return { answerReleaseId, releasePath, manifest };
  } finally {
    if (ownedTemporaryRoots.has(staging)) await cleanupOwnedAnswerTemporaryRoot(staging);
  }
}
