import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import {
  publicAnswerChunkSchema,
  publicAnswerCorpusApprovalSchema,
  publicAnswerEvidenceSchema,
  publicAnswerIndexInputSchema,
  publicAnswerLexicalIndexSchema,
  publicAnswerReleaseManifestSchema,
  type PublicAnswerChunk,
  type PublicAnswerCorpusApproval,
  type PublicAnswerEvidence,
  type PublicAnswerIndexInput,
  type PublicAnswerLexicalIndex,
  type PublicAnswerReleaseManifest,
} from '@beyondwin/contracts';
import { z } from 'zod';
import { findPublicBoundaryHits, type VerifiedActivePublicRelease } from '../release/read-release';
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
  assertOwnedAnswerDirectory,
  canonicalAnswerPrettyJson,
  hashAnswerReleaseArtifact,
  listAnswerReleaseFiles,
  readOwnedAnswerFile,
} from './verified-files';

const verifiedAnswerRelease = Symbol('VerifiedPublicAnswerRelease');
const answerReleaseIdSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const activeAnswerReleasePointerSchema = z.object({
  schemaVersion: z.literal(1),
  contentReleaseId: answerReleaseIdSchema,
  answerReleaseId: answerReleaseIdSchema,
  path: z.string(),
}).strict().superRefine((pointer, context) => {
  if (pointer.path !== `${pointer.contentReleaseId}/${pointer.answerReleaseId}`) {
    context.addIssue({ code: 'custom', path: ['path'], message: 'path must equal contentReleaseId/answerReleaseId' });
  }
});

export interface VerifiedPublicAnswerRelease {
  readonly [verifiedAnswerRelease]: true;
  readonly releasePath: string;
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly manifest: Readonly<PublicAnswerReleaseManifest>;
  readonly manifestHash: string;
  readonly artifactHash: string;
  readonly corpusApprovalHash: string;
  readonly chunks: readonly PublicAnswerChunk[];
  readonly evidence: readonly PublicAnswerEvidence[];
  readonly indexInputs: readonly PublicAnswerIndexInput[];
  readonly lexicalIndex: Readonly<PublicAnswerLexicalIndex>;
  readonly privateBoundaryHits: readonly [];
}

export interface VerifiedActivePublicAnswerRelease extends VerifiedPublicAnswerRelease {
  readonly activePointerHash: string;
}

type SchemaLike<T> = { parse(input: unknown): T };

const expectedInventory = new Set([
  'chunks.ndjson',
  'evidence.ndjson',
  'index-inputs.ndjson',
  'lexical-index.json',
  'manifest.json',
]);

function hash(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function equalBytes(left: Buffer, right: Buffer, label: string): void {
  if (!left.equals(right)) throw new Error(`${label}: bytes do not match the authority-derived canonical artifact`);
}

function parseCanonicalNdjson<T>(
  bytes: Buffer,
  schema: SchemaLike<T>,
  id: (item: T) => string,
  label: string,
): T[] {
  if (bytes.byteLength === 0) return [];
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) throw new Error(`${label}: canonical NDJSON requires one final newline`);
  const lines = text.slice(0, -1).split('\n');
  if (lines.some((line) => line.length === 0)) throw new Error(`${label}: blank NDJSON rows are forbidden`);
  const values = lines.map((line, index) => {
    const input = JSON.parse(line) as unknown;
    const value = schema.parse(input);
    if (canonicalJsonLine(value) !== line) throw new Error(`${label}[${index}]: row is not canonical JSON`);
    return value;
  });
  const ids = values.map(id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label}: IDs must be unique`);
  for (let index = 1; index < ids.length; index += 1) {
    if (codePointCompare(ids[index - 1]!, ids[index]!) > 0) {
      throw new Error(`${label}: rows must be code-point sorted by ID`);
    }
  }
  return values;
}

function canonicalNdjson(values: readonly unknown[]): Buffer {
  return Buffer.from(values.map((value) => `${canonicalJsonLine(value)}\n`).join(''));
}

const forbiddenAnswerKey = /^(?:bodyHtml|markdown|status|draft|includeInAnswers|provider|providerOutput|vector)$/iu;
const htmlMarkup = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|<![A-Z][^>]*>|<\?[\s\S]*?\?>/u;
const markdownBlock = /(?:^|\n) {0,3}(?:#{1,6}[\t ]|>[\t ]?|(?:[-*+]|\d{1,9}[.)])[\t ]+|(?:`{3,}|~{3,})|\[[^\]]+\]:[\t ]*\S)|(?:^|\n).+\n {0,3}(?:=+|-+)[\t ]*(?:\n|$)|(?:^|\n) {0,3}(?:(?:\*[\t ]*){3,}|(?:-[\t ]*){3,}|(?:_[\t ]*){3,})[\t ]*(?:\n|$)|(?:^|\n) {0,3}\|?(?:[\t ]*:?-{3,}:?[\t ]*\|)+/u;
const markdownLinkOrCode = /!?\[[^\]]+\](?:\([^)]+\)|\[[^\]]*\])|`+[^`\n]+`+|<(?:(?:https?:\/\/|mailto:)[^>]+|[^@<>\s]+@[^@<>\s]+)>/u;
const markdownAsteriskEmphasis = /(?:^|[^\p{L}\p{N}\\])\*(?![\s*])[^*\n]*?\S\*(?!\*)/u;
const markdownUnderscoreEmphasis = /(?:^|[^\p{L}\p{N}_\\])_(?![\s_])[^_\n]*?\S_(?![\p{L}\p{N}_])/u;
const markdownStrongOrStrike = /\*\*(?!\s)[^*\n]*?\S\*\*|__(?!\s)[^_\n]*?\S__|~~(?!\s)[^~\n]*?\S~~/u;

function containsAnswerMarkup(value: string): boolean {
  return htmlMarkup.test(value)
    || markdownBlock.test(value)
    || markdownLinkOrCode.test(value)
    || markdownAsteriskEmphasis.test(value)
    || markdownUnderscoreEmphasis.test(value)
    || markdownStrongOrStrike.test(value);
}

function answerBoundaryHits(value: unknown, path: string, skipObjectKeys = false): unknown[] {
  const hits: unknown[] = [...findPublicBoundaryHits(value, path)];
  const visit = (child: unknown, childPath: string, skipKeys: boolean): void => {
    if (Array.isArray(child)) {
      child.forEach((item, index) => visit(item, `${childPath}[${index}]`, false));
      return;
    }
    if (typeof child === 'string') {
      if (containsAnswerMarkup(child)) hits.push({ path: childPath, kind: 'answer-markup', marker: 'HTML or Markdown' });
      return;
    }
    if (!child || typeof child !== 'object') return;
    for (const [key, item] of Object.entries(child as Record<string, unknown>)) {
      if (!skipKeys && forbiddenAnswerKey.test(key)) {
        hits.push({ path: `${childPath}.${key}`, kind: 'forbidden-key', marker: key });
      }
      visit(item, `${childPath}.${key}`, false);
    }
  };
  visit(value, path, skipObjectKeys);
  return hits;
}

function assertPrivateBoundary(
  manifest: PublicAnswerReleaseManifest,
  chunks: readonly PublicAnswerChunk[],
  evidence: readonly PublicAnswerEvidence[],
  indexInputs: readonly PublicAnswerIndexInput[],
  lexicalIndex: PublicAnswerLexicalIndex,
): void {
  const lexicalForScan = {
    schemaVersion: lexicalIndex.schemaVersion,
    normalizerVersion: lexicalIndex.normalizerVersion,
    documents: lexicalIndex.documents,
    postings: Object.values(lexicalIndex.postings),
  };
  const hits = [
    ...answerBoundaryHits(manifest, 'manifest'),
    ...answerBoundaryHits(chunks, 'chunks'),
    ...answerBoundaryHits(evidence, 'evidence'),
    ...answerBoundaryHits(indexInputs, 'indexInputs'),
    ...answerBoundaryHits(lexicalForScan, 'lexicalIndex'),
  ];
  if (hits.length > 0) throw new Error(`public answer private boundary hit; total=${hits.length}`);
}

function assertDescriptor(
  actual: { path: string; checksum: string; bytes: number; count: number },
  file: { path: string; bytes: Buffer; checksum: string },
  count: number,
): void {
  if (
    actual.path !== file.path
    || actual.checksum !== file.checksum
    || actual.bytes !== file.bytes.byteLength
    || actual.count !== count
  ) {
    throw new Error(`${file.path}: descriptor checksum, byte count, or row count mismatch`);
  }
}

function sortBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => codePointCompare(key(left), key(right)));
}

function addBrand<T extends object>(value: T): T & { readonly [verifiedAnswerRelease]: true } {
  Object.defineProperty(value, verifiedAnswerRelease, { value: true, enumerable: false });
  return value as T & { readonly [verifiedAnswerRelease]: true };
}

export async function verifyAnswerReleaseDirectory(
  releasePath: string,
  contentRelease: VerifiedActivePublicRelease,
  approval: PublicAnswerCorpusApproval,
): Promise<VerifiedPublicAnswerRelease> {
  const parsedApproval = publicAnswerCorpusApprovalSchema.parse(approval);
  const resolvedReleasePath = resolve(releasePath);
  const contentDirectory = dirname(resolvedReleasePath);
  const answerReleasesRoot = dirname(contentDirectory);
  await assertOwnedAnswerDirectory(answerReleasesRoot);
  await assertOwnedAnswerDirectory(contentDirectory);
  await assertOwnedAnswerDirectory(resolvedReleasePath);
  const realRoot = await realpath(answerReleasesRoot);
  const realContentDirectory = await realpath(contentDirectory);
  const realReleasePath = await realpath(resolvedReleasePath);
  if (
    !realContentDirectory.startsWith(`${realRoot}${sep}`)
    || !realReleasePath.startsWith(`${realContentDirectory}${sep}`)
  ) {
    throw new Error('answer release directory escapes owned root containment');
  }
  const files = await listAnswerReleaseFiles(resolvedReleasePath);
  if (
    files.size !== expectedInventory.size
    || [...files].some((path) => !expectedInventory.has(path))
  ) {
    throw new Error(`answer release requires exact five-file inventory: ${[...files].join(',')}`);
  }

  const [manifestFile, chunksFile, evidenceFile, indexInputsFile, lexicalFile] = await Promise.all([
    readOwnedAnswerFile(resolvedReleasePath, 'manifest.json'),
    readOwnedAnswerFile(resolvedReleasePath, 'chunks.ndjson'),
    readOwnedAnswerFile(resolvedReleasePath, 'evidence.ndjson'),
    readOwnedAnswerFile(resolvedReleasePath, 'index-inputs.ndjson'),
    readOwnedAnswerFile(resolvedReleasePath, 'lexical-index.json'),
  ]);
  const manifestInput = JSON.parse(manifestFile.bytes.toString('utf8')) as unknown;
  const manifest = publicAnswerReleaseManifestSchema.parse(manifestInput);
  if (canonicalAnswerPrettyJson(manifest) !== manifestFile.bytes.toString('utf8')) {
    throw new Error('manifest.json must use canonical pretty JSON with one final newline');
  }
  if (
    basename(resolvedReleasePath) !== manifest.answerReleaseId
    || basename(dirname(resolvedReleasePath)) !== manifest.identity.contentReleaseId
  ) {
    throw new Error('answer release directory path does not match content and answer release IDs');
  }

  const chunks = parseCanonicalNdjson(chunksFile.bytes, publicAnswerChunkSchema, (item) => item.chunkId, 'chunks.ndjson');
  const evidence = parseCanonicalNdjson(evidenceFile.bytes, publicAnswerEvidenceSchema, (item) => item.evidenceId, 'evidence.ndjson');
  const indexInputs = parseCanonicalNdjson(indexInputsFile.bytes, publicAnswerIndexInputSchema, (item) => item.chunkId, 'index-inputs.ndjson');
  const lexicalInput = JSON.parse(lexicalFile.bytes.toString('utf8')) as unknown;
  const lexicalIndex = publicAnswerLexicalIndexSchema.parse(lexicalInput);
  if (canonicalAnswerPrettyJson(lexicalIndex) !== lexicalFile.bytes.toString('utf8')) {
    throw new Error('lexical-index.json must use canonical pretty JSON with one final newline');
  }

  assertDescriptor(manifest.files.chunks, chunksFile, chunks.length);
  assertDescriptor(manifest.files.evidence, evidenceFile, evidence.length);
  assertDescriptor(manifest.files.indexInputs, indexInputsFile, indexInputs.length);
  assertDescriptor(manifest.files.lexicalIndex, lexicalFile, lexicalIndex.documents.length);

  const contentReleaseId = contentRelease.manifest.releaseId;
  const corpusApprovalHash = sha256Checksum(canonicalJsonLine(parsedApproval));
  if (
    manifest.identity.contentReleaseId !== contentReleaseId
    || manifest.identity.contentManifestHash !== contentRelease.manifestHash
    || manifest.identity.contentArtifactHash !== contentRelease.artifactHash
    || manifest.identity.corpusApprovalHash !== corpusApprovalHash
    || manifest.identity.chunkerVersion !== ANSWER_CHUNKER_VERSION
    || manifest.identity.normalizerVersion !== ANSWER_NORMALIZER_VERSION
  ) {
    throw new Error('answer release identity does not match supplied verified content and approval authority');
  }
  const descriptors = [
    manifest.files.chunks,
    manifest.files.evidence,
    manifest.files.indexInputs,
    manifest.files.lexicalIndex,
  ];
  const answerReleaseId = sha256Hex(canonicalJsonLine({ identity: manifest.identity, files: descriptors }));
  if (answerReleaseId !== manifest.answerReleaseId) throw new Error('answer release ID does not match canonical identity');

  if (
    chunks.some((chunk) => chunk.collection === 'answer-only' || chunk.recordId.startsWith('answer-only/') || chunk.canonicalPath.startsWith('/evidence/'))
    || evidence.some((item) => item.locator.kind === 'evidence-page' || item.recordId.startsWith('answer-only/') || item.canonicalPath.startsWith('/evidence/'))
    || indexInputs.some((item) => item.collection === 'answer-only' || item.recordId.startsWith('answer-only/') || item.canonicalPath.startsWith('/evidence/'))
    || manifest.counts.answerOnly !== 0
  ) {
    throw new Error('answer-only producer domain must be empty in public answer release v1');
  }
  const chunksPerRecord = new Map<string, number>();
  for (const chunk of chunks) chunksPerRecord.set(chunk.recordId, (chunksPerRecord.get(chunk.recordId) ?? 0) + 1);
  if ([...chunksPerRecord.values()].some((count) => count > 256)) {
    throw new Error('answer release permits at most 256 chunks per record');
  }
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  if (
    evidence.length !== chunks.length
    || indexInputs.length !== chunks.length
    || evidence.some((item) => !chunkIds.has(item.chunkId))
    || indexInputs.some((item) => !chunkIds.has(item.chunkId))
    || new Set(evidence.map((item) => item.chunkId)).size !== chunks.length
    || new Set(indexInputs.map((item) => item.chunkId)).size !== chunks.length
  ) {
    throw new Error('answer release requires exactly one evidence and index input per chunk');
  }

  const expectedCorpus = buildPublicAnswerCorpus(contentRelease, { approval: parsedApproval });
  const expectedChunks = sortBy(expectedCorpus.chunks, (item) => item.chunkId);
  const expectedEvidence = sortBy(expectedCorpus.evidence, (item) => item.evidenceId);
  const expectedIndexes = buildAnswerIndexes(expectedChunks);
  equalBytes(chunksFile.bytes, canonicalNdjson(expectedChunks), 'chunks.ndjson');
  equalBytes(evidenceFile.bytes, canonicalNdjson(expectedEvidence), 'evidence.ndjson');
  equalBytes(indexInputsFile.bytes, canonicalNdjson(expectedIndexes.indexInputs), 'index-inputs.ndjson');
  equalBytes(lexicalFile.bytes, Buffer.from(canonicalAnswerPrettyJson(expectedIndexes.lexicalIndex)), 'lexical-index.json');

  const expectedCounts = {
    records: new Set(expectedChunks.map((chunk) => chunk.recordId)).size,
    chunks: expectedChunks.length,
    evidence: expectedEvidence.length,
    answerOnly: 0 as const,
  };
  if (canonicalJsonLine(manifest.counts) !== canonicalJsonLine(expectedCounts)) {
    throw new Error('answer release manifest counts do not match the complete authority-derived row domain');
  }
  assertPrivateBoundary(manifest, chunks, evidence, indexInputs, lexicalIndex);
  const artifactHash = await hashAnswerReleaseArtifact(resolvedReleasePath, files);
  const sealedFiles = await Promise.all([
    readOwnedAnswerFile(resolvedReleasePath, 'manifest.json'),
    readOwnedAnswerFile(resolvedReleasePath, 'chunks.ndjson'),
    readOwnedAnswerFile(resolvedReleasePath, 'evidence.ndjson'),
    readOwnedAnswerFile(resolvedReleasePath, 'index-inputs.ndjson'),
    readOwnedAnswerFile(resolvedReleasePath, 'lexical-index.json'),
  ]);
  const initialChecksums = new Map([
    [manifestFile.path, manifestFile.checksum],
    [chunksFile.path, chunksFile.checksum],
    [evidenceFile.path, evidenceFile.checksum],
    [indexInputsFile.path, indexInputsFile.checksum],
    [lexicalFile.path, lexicalFile.checksum],
  ]);
  if (sealedFiles.some((file) => initialChecksums.get(file.path) !== file.checksum)) {
    throw new Error('answer release artifact changed between semantic verification and artifact hashing');
  }

  return addBrand({
    releasePath: resolvedReleasePath,
    contentReleaseId,
    answerReleaseId,
    manifest,
    manifestHash: hash(manifestFile.bytes),
    artifactHash,
    corpusApprovalHash,
    chunks,
    evidence,
    indexInputs,
    lexicalIndex,
    privateBoundaryHits: [] as const,
  });
}

export async function readActiveAnswerRelease(
  answerReleasesRoot: string,
  contentRelease: VerifiedActivePublicRelease,
  approval: PublicAnswerCorpusApproval,
): Promise<VerifiedActivePublicAnswerRelease> {
  const parsedApproval = publicAnswerCorpusApprovalSchema.parse(approval);
  const root = resolve(answerReleasesRoot);
  await assertOwnedAnswerDirectory(root);
  const before = await readOwnedAnswerFile(root, 'active.json');
  const pointer = activeAnswerReleasePointerSchema.parse(JSON.parse(before.bytes.toString('utf8')));
  if (canonicalAnswerPrettyJson(pointer) !== before.bytes.toString('utf8')) {
    throw new Error('active answer release pointer must be canonical JSON');
  }
  if (pointer.contentReleaseId !== contentRelease.manifest.releaseId) {
    throw new Error('active answer release pointer content ID does not match supplied release');
  }
  const releasePath = resolve(root, pointer.path);
  if (!releasePath.startsWith(`${root}${sep}`)) throw new Error('active answer release pointer escapes containment');
  const realRoot = await realpath(root);
  const realReleasePath = await realpath(releasePath);
  if (!realReleasePath.startsWith(`${realRoot}${sep}`)) {
    throw new Error('active answer release real path escapes containment');
  }
  const verified = await verifyAnswerReleaseDirectory(releasePath, contentRelease, parsedApproval);
  if (verified.answerReleaseId !== pointer.answerReleaseId) {
    throw new Error('active answer release pointer ID does not match verified release');
  }
  const after = await readOwnedAnswerFile(root, 'active.json');
  if (!after.bytes.equals(before.bytes)) throw new Error('active answer release pointer changed during verification');
  return addBrand({
    ...verified,
    activePointerHash: hash(before.bytes),
  });
}
