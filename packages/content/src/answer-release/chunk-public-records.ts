import { parseFragment } from 'parse5';
import {
  publicAnswerChunkSchema,
  publicAnswerCorpusApprovalSchema,
  publicAnswerEvidenceSchema,
  type PublicAnswerChunk,
  type PublicAnswerCorpusApproval,
  type PublicAnswerEvidence,
  type PublicRecord,
} from '@beyondwin/contracts';
import type { VerifiedActivePublicRelease } from '../release/read-release';
import {
  ANSWER_CHUNKER_VERSION,
  canonicalJsonLine,
  canonicalPublicRecordChecksum,
  sha256Checksum,
  sha256Hex,
} from './identity';
import { normalizeAnswerText } from './build-index-inputs';

export interface BuildPublicAnswerCorpusOptions {
  approval: PublicAnswerCorpusApproval;
  answerOnlyCapsules?: readonly unknown[];
}

type HtmlNode = {
  nodeName?: string;
  tagName?: string;
  value?: string;
  childNodes?: HtmlNode[];
};

const evidenceTags = new Set(['p', 'li', 'blockquote', 'pre', 'tr']);
const nonRenderedTags = new Set(['script', 'style', 'template']);
const sentenceBoundary = new Set(['.', '!', '?', '。', '！', '？']);
const MAX_BLOCK_CODE_POINTS = 1200;
const BLOCK_MERGE_SEPARATOR = '\n\n';
const collectionLabels: Record<'articles' | 'reviews' | 'thoughts', string> = {
  articles: '아티클',
  reviews: '서평',
  thoughts: '생각',
};
type AnswerPublicRecord = Extract<PublicRecord, { collection: 'articles' | 'reviews' | 'thoughts' }>;

function isAnswerPublicRecord(record: PublicRecord): record is AnswerPublicRecord {
  return record.collection === 'articles' || record.collection === 'reviews' || record.collection === 'thoughts';
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function sameHeadingPath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeSameHeadingBlocks(
  blocks: ReadonlyArray<{ headingPath: string[]; text: string }>,
): Array<{ headingPath: string[]; text: string }> {
  const merged: Array<{ headingPath: string[]; text: string }> = [];
  for (const block of blocks) {
    const current = merged.at(-1);
    if (!current) {
      merged.push({ headingPath: [...block.headingPath], text: block.text });
      continue;
    }
    const joinedLength = codePointLength(current.text)
      + codePointLength(BLOCK_MERGE_SEPARATOR)
      + codePointLength(block.text);
    if (sameHeadingPath(current.headingPath, block.headingPath) && joinedLength <= MAX_BLOCK_CODE_POINTS) {
      current.text = `${current.text}${BLOCK_MERGE_SEPARATOR}${block.text}`;
      continue;
    }
    merged.push({ headingPath: [...block.headingPath], text: block.text });
  }
  return merged;
}

function normalizedBlockText(node: HtmlNode): string {
  const pieces: string[] = [];
  const visit = (current: HtmlNode): void => {
    if (current.tagName && nonRenderedTags.has(current.tagName)) return;
    if (current.nodeName === '#text' && current.value) pieces.push(current.value);
    for (const child of current.childNodes ?? []) visit(child);
  };
  visit(node);
  return pieces.join('').replace(/\s+/gu, ' ').trim();
}

function containsDescendantEvidenceBlock(node: HtmlNode): boolean {
  for (const child of node.childNodes ?? []) {
    if (child.tagName && evidenceTags.has(child.tagName)) return true;
    if (containsDescendantEvidenceBlock(child)) return true;
  }
  return false;
}

function splitBlock(text: string): string[] {
  const points = Array.from(text);
  const parts: string[] = [];
  let start = 0;
  while (start < points.length) {
    const limit = Math.min(start + MAX_BLOCK_CODE_POINTS, points.length);
    if (limit === points.length) {
      const last = points.slice(start).join('').trim();
      if (last) parts.push(last);
      break;
    }
    let cut = -1;
    for (let index = limit - 1; index >= start; index -= 1) {
      if (sentenceBoundary.has(points[index]!)) {
        cut = index + 1;
        break;
      }
    }
    if (cut <= start) {
      for (let index = limit - 1; index >= start; index -= 1) {
        if (/\s/u.test(points[index]!)) {
          cut = index;
          break;
        }
      }
    }
    if (cut <= start) cut = limit;
    const part = points.slice(start, cut).join('').trim();
    if (part) parts.push(part);
    start = cut;
    while (start < points.length && /\s/u.test(points[start]!)) start += 1;
  }
  return parts;
}

function blocksForRecord(record: PublicRecord): Array<{ headingPath: string[]; text: string }> {
  const blocks: Array<{ headingPath: string[]; text: string }> = [];
  let headingPath: string[] = [];
  const visit = (node: HtmlNode): void => {
    const tag = node.tagName?.toLowerCase();
    if (tag && /^h[2-6]$/u.test(tag)) {
      const text = normalizedBlockText(node);
      if (text) {
        const depth = Number(tag.slice(1)) - 2;
        headingPath = [...headingPath.slice(0, depth), text];
      }
      return;
    }
    if (tag && evidenceTags.has(tag) && !containsDescendantEvidenceBlock(node)) {
      const text = normalizedBlockText(node);
      if (text) {
        for (const part of splitBlock(text)) blocks.push({ headingPath: [...headingPath], text: part });
      }
      return;
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parseFragment(record.bodyHtml) as HtmlNode);
  return blocks;
}

function assertApprovedRecords(
  release: VerifiedActivePublicRelease,
  approval: PublicAnswerCorpusApproval,
): AnswerPublicRecord[] {
  const allRecords = Object.values(release.manifest.records);
  return approval.entries.map((entry) => {
    const matches = allRecords.filter((record) => `${record.collection}/${record.id}` === entry.recordId);
    if (matches.length !== 1) throw new Error(`${entry.recordId}: approval must resolve to exactly one materialized record`);
    const record = matches[0]!;
    if (!isAnswerPublicRecord(record)) {
      throw new Error(`${entry.recordId}: answer approval must select a primary collection`);
    }
    if (!record.includeInAnswers) throw new Error(`${entry.recordId}: includeInAnswers must be true`);
    if (canonicalPublicRecordChecksum(record) !== entry.recordChecksum) {
      throw new Error(`${entry.recordId}: approval record checksum drifted`);
    }
    return record;
  });
}

function recordChunks(record: AnswerPublicRecord): { chunks: PublicAnswerChunk[]; evidence: PublicAnswerEvidence[] } {
  const recordId = `${record.collection}/${record.id}`;
  const blocks = blocksForRecord(record);
  if (blocks.length === 0) throw new Error(`${recordId}: approved record has no evidence blocks`);
  if (blocks.length > 256) throw new Error(`${recordId}: approved record exceeds 256 pre-merge blocks`);
  const merged = mergeSameHeadingBlocks(blocks);
  const chunks: PublicAnswerChunk[] = [];
  const evidence: PublicAnswerEvidence[] = [];
  for (const [index, block] of merged.entries()) {
    const ordinal = index + 1;
    const chunkId = sha256Hex(canonicalJsonLine({
      version: ANSWER_CHUNKER_VERSION,
      recordId,
      canonicalPath: record.href,
      headingPath: block.headingPath,
      ordinal,
      normalizedText: normalizeAnswerText(block.text),
    }));
    const chunk = publicAnswerChunkSchema.parse({
      chunkId,
      recordId,
      collection: record.collection,
      canonicalPath: record.href,
      title: record.title,
      headingPath: block.headingPath,
      ordinal,
      text: block.text,
      checksum: sha256Checksum(canonicalJsonLine({
        chunkId,
        recordId,
        collection: record.collection,
        canonicalPath: record.href,
        title: record.title,
        headingPath: block.headingPath,
        ordinal,
        text: block.text,
      })),
    });
    const excerptChecksum = sha256Checksum(chunk.text);
    const end = codePointLength(chunk.text);
    const locatorLabel = chunk.headingPath.at(-1)
      ? `${chunk.headingPath.at(-1)} · 문단 ${ordinal}`
      : `문단 ${ordinal}`;
    const evidenceItem = publicAnswerEvidenceSchema.parse({
      evidenceId: sha256Hex(canonicalJsonLine({
        version: ANSWER_CHUNKER_VERSION,
        chunkId,
        start: 0,
        end,
        excerptChecksum,
      })),
      chunkId,
      recordId,
      collectionLabel: collectionLabels[record.collection],
      recordTitle: record.title,
      canonicalPath: record.href,
      locator: { kind: 'heading-paragraph', label: locatorLabel, ordinal },
      excerpt: chunk.text,
      excerptChecksum,
    });
    chunks.push(chunk);
    evidence.push(evidenceItem);
  }
  return { chunks, evidence };
}

export function buildPublicAnswerCorpus(
  release: VerifiedActivePublicRelease,
  options: BuildPublicAnswerCorpusOptions,
): { chunks: PublicAnswerChunk[]; evidence: PublicAnswerEvidence[] } {
  if (options?.answerOnlyCapsules && options.answerOnlyCapsules.length > 0) {
    throw new Error('answer-only capsules are not supported');
  }
  if (!options || !Object.hasOwn(options, 'approval') || options.approval === undefined) {
    throw new Error('public answer corpus approval is required');
  }
  const approval = publicAnswerCorpusApprovalSchema.parse(options.approval);
  const chunks: PublicAnswerChunk[] = [];
  const evidence: PublicAnswerEvidence[] = [];
  for (const record of assertApprovedRecords(release, approval)) {
    const output = recordChunks(record);
    chunks.push(...output.chunks);
    evidence.push(...output.evidence);
  }
  return { chunks, evidence };
}

export { canonicalPublicRecordChecksum };
