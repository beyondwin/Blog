import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type {
  PublicAnswerChunk,
  PublicAnswerCorpusApproval,
  PublicAnswerEvidence,
  PublicAnswerReleaseManifest,
} from '@beyondwin/contracts';
import { buildPublicAnswerRelease } from '../../src/answer-release/build-answer-release';
import { buildAnswerIndexes } from '../../src/answer-release/build-index-inputs';
import {
  ANSWER_CHUNKER_VERSION,
  canonicalJsonLine,
  canonicalPublicRecordChecksum,
  sha256Checksum,
  sha256Hex,
} from '../../src/answer-release/identity';
import {
  readActiveAnswerRelease,
  type VerifiedActivePublicAnswerRelease,
} from '../../src/answer-release/read-answer-release';
import { buildPublicRelease } from '../../src/release/build-release';
import {
  readActiveRelease,
  type VerifiedActivePublicRelease,
} from '../../src/release/read-release';
import { writeReleaseFixture } from './release-fixture';

export interface AnswerReleaseFixture {
  sandbox: string;
  sourceRoot: string;
  publicReleasesRoot: string;
  answerReleasesRoot: string;
  contentRelease: VerifiedActivePublicRelease;
  approval: PublicAnswerCorpusApproval;
}

export interface BuiltAnswerReleaseFixture extends AnswerReleaseFixture {
  releasePath: string;
  answerReleaseId: string;
  active: VerifiedActivePublicAnswerRelease;
}

function testCodePointCompare(left: string, right: string): number {
  const leftPoints = Array.from(left, (point) => point.codePointAt(0)!);
  const rightPoints = Array.from(right, (point) => point.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index]! - rightPoints[index]!;
  }
  return leftPoints.length - rightPoints.length;
}

function sortTestJsonObject(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record)
    .sort(testCodePointCompare)
    .map((key) => [key, record[key]]));
}

export function canonicalPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, sortTestJsonObject, 2)}\n`;
}

export async function createAnswerReleaseFixture(options: {
  emptyApproval?: boolean;
  secondRecord?: boolean;
  prose?: string;
} = {}): Promise<AnswerReleaseFixture> {
  const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-answer-release-'));
  const sourceRoot = join(sandbox, 'source');
  const publicReleasesRoot = join(sandbox, 'public-releases');
  const answerReleasesRoot = join(sandbox, 'public-answer-releases');
  await writeReleaseFixture(sourceRoot, { featuredMedia: false });
  await writeFile(join(sourceRoot, 'src/content/articles/public-fixture.mdx'), [
    '---',
    'title: Public fixture',
    'description: A public answer fixture.',
    'createdAt: "2026-08-30"',
    'updatedAt: "2026-08-30"',
    'status: published',
    'draft: false',
    'recordKind: essay',
    'includeInAnswers: true',
    '---',
    '',
    '## Stable heading',
    '',
    options.prose ?? 'Public evidence preserves judgment and context.',
    '',
  ].join('\n'));
  if (options.secondRecord) {
    await writeFile(join(sourceRoot, 'src/content/thoughts/second-fixture.mdx'), [
      '---',
      'title: Second fixture',
      'description: A second approved answer fixture.',
      'createdAt: "2026-08-30"',
      'updatedAt: "2026-08-30"',
      'status: published',
      'draft: false',
      'includeInAnswers: true',
      '---',
      '',
      'Second public evidence remains independently approved.',
      '',
    ].join('\n'));
  }
  await buildPublicRelease({ root: sourceRoot, releasesRoot: publicReleasesRoot });
  const contentRelease = await readActiveRelease(publicReleasesRoot);
  const approval: PublicAnswerCorpusApproval = {
    schemaVersion: 1,
    entries: options.emptyApproval ? [] : Object.values(contentRelease.manifest.records)
      .filter((record) => (
        (record.collection === 'articles' || record.collection === 'reviews' || record.collection === 'thoughts')
        && record.includeInAnswers === true
      ))
      .map((record) => ({
        recordId: `${record.collection}/${record.id}`,
        recordChecksum: canonicalPublicRecordChecksum(record),
      }))
      .sort((left, right) => testCodePointCompare(left.recordId, right.recordId)),
  };
  return { sandbox, sourceRoot, publicReleasesRoot, answerReleasesRoot, contentRelease, approval };
}

export async function writeAnswerReleaseFixture(options: {
  emptyApproval?: boolean;
  secondRecord?: boolean;
  prose?: string;
} = {}): Promise<BuiltAnswerReleaseFixture> {
  const fixture = await createAnswerReleaseFixture(options);
  const built = await buildPublicAnswerRelease({
    contentRelease: fixture.contentRelease,
    approval: fixture.approval,
    answerReleasesRoot: fixture.answerReleasesRoot,
  });
  const active = await readActiveAnswerRelease(
    fixture.answerReleasesRoot,
    fixture.contentRelease,
    fixture.approval,
  );
  return { ...fixture, releasePath: built.releasePath, answerReleaseId: built.answerReleaseId, active };
}

export async function readAnswerManifest(releasePath: string): Promise<PublicAnswerReleaseManifest> {
  return JSON.parse(await readFile(join(releasePath, 'manifest.json'), 'utf8')) as PublicAnswerReleaseManifest;
}

export async function writeCanonicalNdjson(path: string, rows: readonly unknown[]): Promise<void> {
  await writeFile(path, rows.map((row) => `${canonicalJsonLine(row)}\n`).join(''));
}

function lineCount(bytes: Buffer): number {
  if (bytes.byteLength === 0) return 0;
  return bytes.toString('utf8').split('\n').length - 1;
}

export async function rehashAnswerRelease(
  releasePath: string,
  options: { preserveCounts?: boolean; updatePointer?: boolean } = {},
): Promise<string> {
  const manifest = await readAnswerManifest(releasePath);
  const paths = ['chunks.ndjson', 'evidence.ndjson', 'index-inputs.ndjson', 'lexical-index.json'] as const;
  const bytes = Object.fromEntries(await Promise.all(paths.map(async (path) => (
    [path, await readFile(join(releasePath, path))] as const
  )))) as Record<(typeof paths)[number], Buffer>;
  const descriptor = (path: (typeof paths)[number], count: number) => ({
    path,
    checksum: sha256Checksum(bytes[path]),
    bytes: bytes[path].byteLength,
    count,
  });
  const chunks = bytes['chunks.ndjson'].byteLength === 0
    ? []
    : bytes['chunks.ndjson'].toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line) as PublicAnswerChunk);
  const lexical = JSON.parse(bytes['lexical-index.json'].toString('utf8')) as { documents: unknown[] };
  manifest.files = {
    chunks: descriptor('chunks.ndjson', lineCount(bytes['chunks.ndjson'])),
    evidence: descriptor('evidence.ndjson', lineCount(bytes['evidence.ndjson'])),
    indexInputs: descriptor('index-inputs.ndjson', lineCount(bytes['index-inputs.ndjson'])),
    lexicalIndex: descriptor('lexical-index.json', lexical.documents.length),
  };
  if (!options.preserveCounts) {
    manifest.counts = {
      records: new Set(chunks.map((chunk) => chunk.recordId)).size,
      chunks: chunks.length,
      evidence: lineCount(bytes['evidence.ndjson']),
      answerOnly: 0,
    };
  }
  const files = [
    manifest.files.chunks,
    manifest.files.evidence,
    manifest.files.indexInputs,
    manifest.files.lexicalIndex,
  ];
  const answerReleaseId = sha256Hex(canonicalJsonLine({ identity: manifest.identity, files }));
  manifest.answerReleaseId = answerReleaseId;
  await writeFile(join(releasePath, 'manifest.json'), canonicalPrettyJson(manifest));

  const oldPath = releasePath;
  const newPath = join(dirname(dirname(oldPath)), basename(dirname(oldPath)), answerReleaseId);
  if (oldPath !== newPath) await rename(oldPath, newPath);
  if (options.updatePointer !== false) {
    await writeFile(join(dirname(dirname(newPath)), 'active.json'), canonicalPrettyJson({
      schemaVersion: 1,
      contentReleaseId: manifest.identity.contentReleaseId,
      answerReleaseId,
      path: `${manifest.identity.contentReleaseId}/${answerReleaseId}`,
    }));
  }
  return newPath;
}

const collectionLabel = {
  articles: '아티클',
  reviews: '서평',
  thoughts: '생각',
  'answer-only': '답변 전용',
} as const;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function evidenceForChunk(chunk: PublicAnswerChunk): PublicAnswerEvidence {
  const excerptChecksum = sha256Checksum(chunk.text);
  const label = chunk.headingPath.at(-1)
    ? `${chunk.headingPath.at(-1)} · 문단 ${chunk.ordinal}`
    : `문단 ${chunk.ordinal}`;
  const locator = chunk.collection === 'answer-only'
    ? { kind: 'evidence-page' as const, label, ordinal: chunk.ordinal }
    : { kind: 'heading-paragraph' as const, label, ordinal: chunk.ordinal };
  return {
    evidenceId: sha256Hex(canonicalJsonLine({
      version: ANSWER_CHUNKER_VERSION,
      chunkId: chunk.chunkId,
      start: 0,
      end: codePointLength(chunk.text),
      excerptChecksum,
    })),
    chunkId: chunk.chunkId,
    recordId: chunk.recordId,
    collectionLabel: collectionLabel[chunk.collection],
    recordTitle: chunk.title,
    canonicalPath: chunk.canonicalPath,
    locator,
    excerpt: chunk.text,
    excerptChecksum,
  };
}

export function rechunk(overrides: Partial<PublicAnswerChunk>, base: PublicAnswerChunk): PublicAnswerChunk {
  const value = { ...base, ...overrides };
  const chunkId = overrides.chunkId ?? sha256Hex(canonicalJsonLine({
    version: ANSWER_CHUNKER_VERSION,
    recordId: value.recordId,
    canonicalPath: value.canonicalPath,
    headingPath: value.headingPath,
    ordinal: value.ordinal,
    normalizedText: value.text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' '),
  }));
  const withoutChecksum = { ...value, chunkId };
  delete (withoutChecksum as { checksum?: string }).checksum;
  return {
    ...value,
    chunkId,
    checksum: sha256Checksum(canonicalJsonLine(withoutChecksum)),
  };
}

export async function writeProjection(
  releasePath: string,
  chunks: readonly PublicAnswerChunk[],
  evidence: readonly PublicAnswerEvidence[] = chunks.map(evidenceForChunk),
): Promise<void> {
  const indexes = buildAnswerIndexes(chunks);
  await Promise.all([
    writeCanonicalNdjson(join(releasePath, 'chunks.ndjson'), chunks),
    writeCanonicalNdjson(join(releasePath, 'evidence.ndjson'), evidence),
    writeCanonicalNdjson(join(releasePath, 'index-inputs.ndjson'), indexes.indexInputs),
    writeFile(join(releasePath, 'lexical-index.json'), canonicalPrettyJson(indexes.lexicalIndex)),
  ]);
}

export function sha256(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}
