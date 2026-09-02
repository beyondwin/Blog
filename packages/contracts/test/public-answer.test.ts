import { describe, expect, it } from 'vitest';
import {
  answerReleaseIdentitySchema,
  publicAnswerChunkSchema,
  publicAnswerCorpusApprovalSchema,
  publicAnswerIndexInputSchema,
  publicAnswerLexicalIndexSchema,
  publicAnswerReleaseManifestSchema,
  publicAnswerScopeSchema,
  publicAskRequestSchema,
  publicAskResponseSchema,
} from '../src/public-answer';

const hex = 'a'.repeat(64);
const checksum = `sha256:${'b'.repeat(64)}`;

const chunk = {
  chunkId: hex,
  recordId: 'articles/public-record',
  collection: 'articles',
  canonicalPath: '/articles/public-record/',
  title: 'Public record',
  headingPath: ['판단'],
  ordinal: 1,
  text: '검증된 공개 문장입니다.',
  checksum,
};

const evidence = {
  evidenceId: 'c'.repeat(64),
  chunkId: hex,
  recordId: 'articles/public-record',
  collectionLabel: 'Articles',
  recordTitle: 'Public record',
  canonicalPath: '/articles/public-record/',
  locator: { kind: 'heading-paragraph', label: '판단', ordinal: 1 },
  excerpt: '검증된 공개 문장입니다.',
  excerptChecksum: checksum,
};

function manifestFile(path: string, count: number, bytes: number) {
  return { path, checksum, count, bytes };
}

function manifest() {
  return {
    schemaVersion: 1,
    answerReleaseId: hex,
    identity: {
      schemaVersion: 1,
      contentReleaseId: hex,
      contentManifestHash: checksum,
      contentArtifactHash: checksum,
      corpusApprovalHash: checksum,
      chunkerVersion: 'public-blocks-v2',
      normalizerVersion: 'nfkc-lower-hangul-ngram-v1',
      collections: ['articles', 'reviews', 'thoughts'],
    },
    files: {
      chunks: manifestFile('chunks.ndjson', 1, 1),
      evidence: manifestFile('evidence.ndjson', 1, 1),
      indexInputs: manifestFile('index-inputs.ndjson', 1, 1),
      lexicalIndex: manifestFile('lexical-index.json', 0, 1),
    },
    counts: { records: 1, chunks: 1, evidence: 1, answerOnly: 0 },
  };
}

describe('public answer contracts', () => {
  it('models all three public scopes', () => {
    expect(publicAnswerScopeSchema.parse({ scope: 'private' })).toEqual({ scope: 'private' });
    expect(publicAnswerScopeSchema.parse({ scope: 'answer-only', includeInAnswers: true }))
      .toEqual({ scope: 'answer-only', includeInAnswers: true });
    expect(publicAnswerScopeSchema.parse({ scope: 'published', includeInAnswers: false }))
      .toEqual({ scope: 'published', includeInAnswers: false });
    expect(() => publicAnswerScopeSchema.parse({ scope: 'answer-only', includeInAnswers: false })).toThrow();
    expect(() => publicAnswerScopeSchema.parse({ scope: 'private', includeInAnswers: true })).toThrow();
  });

  it('rejects HTML, private fields, embeddings, and unknown chunk keys', () => {
    expect(publicAnswerChunkSchema.parse(chunk)).toEqual(chunk);
    expect(() => publicAnswerChunkSchema.parse({ ...chunk, text: '<p>HTML</p>' })).toThrow();
    expect(() => publicAnswerChunkSchema.parse({ ...chunk, text: '[link](https://example.com)' })).toThrow();
    expect(() => publicAnswerChunkSchema.parse({ ...chunk, privatePath: '/Users/example/private' })).toThrow();
    expect(() => publicAnswerChunkSchema.parse({ ...chunk, embedding: [0.1] })).toThrow();
    expect(() => publicAnswerChunkSchema.parse({ ...chunk, markdown: '[private](https://example.com)' })).toThrow();
  });

  it('uses Unicode code points for chunk, evidence, claim, and question limits', () => {
    expect(publicAnswerChunkSchema.parse({ ...chunk, text: '🙂'.repeat(1200) }).text).toHaveLength(2400);
    expect(() => publicAnswerChunkSchema.parse({ ...chunk, text: '🙂'.repeat(1201) })).toThrow();
    expect(publicAskRequestSchema.parse({
      version: 1,
      question: '🙂'.repeat(500),
      contentReleaseId: hex,
      answerReleaseId: hex,
    }).question).toBe('🙂'.repeat(500));
    expect(() => publicAskRequestSchema.parse({
      version: 1,
      question: '🙂'.repeat(501),
      contentReleaseId: hex,
      answerReleaseId: hex,
    })).toThrow();
    expect(() => publicAskRequestSchema.parse({
      version: 1,
      question: '왜 읽나요?',
      contentReleaseId: hex,
      answerReleaseId: hex,
      rawPrompt: 'secret',
    })).toThrow();
    expect(() => publicAskResponseSchema.parse({
      kind: 'answer',
      answerReleaseId: hex,
      claims: [{ id: 'claim-1', text: '🙂'.repeat(601), evidenceIds: [evidence.evidenceId] }],
      evidence: [evidence],
    })).toThrow();
  });

  it('accepts 1200 excerpt code points and rejects 1201 with an otherwise-valid answer', () => {
    const response = {
      kind: 'answer' as const,
      answerReleaseId: hex,
      claims: [{
        id: 'claim-1',
        text: '공개 근거를 짧게 요약한 주장입니다.',
        evidenceIds: [evidence.evidenceId],
      }],
      evidence: [{ ...evidence, excerpt: '🙂'.repeat(1200) }],
    };

    const accepted = publicAskResponseSchema.parse(response);
    expect(accepted.kind).toBe('answer');
    if (accepted.kind !== 'answer') throw new Error('expected an answer response');
    expect(Array.from(accepted.evidence[0]!.excerpt)).toHaveLength(1200);
    expect(() => publicAskResponseSchema.parse({
      ...response,
      evidence: [{ ...response.evidence[0], excerpt: '🙂'.repeat(1201) }],
    })).toThrow();
  });

  it('requires a closed, internally referenced answer response', () => {
    const response = {
      kind: 'answer',
      answerReleaseId: hex,
      claims: [{ id: 'claim-1', text: '공개 근거에 따른 답변입니다.', evidenceIds: [evidence.evidenceId] }],
      evidence: [evidence],
    };
    expect(publicAskResponseSchema.parse(response)).toEqual(response);
    expect(() => publicAskResponseSchema.parse({ ...response, claims: [] })).toThrow();
    expect(() => publicAskResponseSchema.parse({
      ...response,
      claims: [{ ...response.claims[0], evidenceIds: ['d'.repeat(64)] }],
    })).toThrow();
    expect(() => publicAskResponseSchema.parse({ ...response, evidence: [evidence, evidence] })).toThrow();
    expect(() => publicAskResponseSchema.parse({
      ...response,
      claims: [response.claims[0], response.claims[0]],
    })).toThrow();
    expect(publicAskResponseSchema.parse({ kind: 'search', reason: 'insufficient-evidence' }))
      .toEqual({ kind: 'search', reason: 'insufficient-evidence' });
    expect(publicAskResponseSchema.parse({
      kind: 'search',
      reason: 'budget-exhausted',
    })).toEqual({ kind: 'search', reason: 'budget-exhausted' });
    expect(publicAskResponseSchema.parse({ kind: 'error', code: 'timeout', retryable: true }))
      .toEqual({ kind: 'error', code: 'timeout', retryable: true });
    expect(() => publicAskResponseSchema.parse({ kind: 'search', reason: 'other' })).toThrow();
    expect(() => publicAskResponseSchema.parse({ kind: 'error', code: 'unknown', retryable: false })).toThrow();
    expect(() => publicAskResponseSchema.parse({ ...response, unknown: true })).toThrow();
    expect(() => publicAskResponseSchema.parse({
      ...response,
      claims: Array.from({ length: 6 }, (_, index) => ({
        id: `claim-${index + 1}`,
        text: '공개 근거에 따른 답변입니다.',
        evidenceIds: [evidence.evidenceId],
      })),
    })).toThrow();
    expect(() => publicAskResponseSchema.parse({
      ...response,
      evidence: Array.from({ length: 7 }, (_, index) => ({ ...evidence, evidenceId: `${index}`.repeat(64) })),
    })).toThrow();
  });

  it('requires sorted unique approvals while allowing the canonical empty approval', () => {
    expect(publicAnswerCorpusApprovalSchema.parse({ schemaVersion: 1, entries: [] }))
      .toEqual({ schemaVersion: 1, entries: [] });
    expect(publicAnswerCorpusApprovalSchema.parse({
      schemaVersion: 1,
      entries: [{ recordId: 'thoughts/why-i-read-in-the-ai-era', recordChecksum: checksum }],
    }).entries).toHaveLength(1);
    expect(() => publicAnswerCorpusApprovalSchema.parse({
      schemaVersion: 1,
      entries: [
        { recordId: 'thoughts/z-last', recordChecksum: checksum },
        { recordId: 'articles/a-first', recordChecksum: checksum },
      ],
    })).toThrow();
    expect(() => publicAnswerCorpusApprovalSchema.parse({
      schemaVersion: 1,
      entries: [
        { recordId: 'articles/repeated', recordChecksum: checksum },
        { recordId: 'articles/repeated', recordChecksum: checksum },
      ],
    })).toThrow();
    expect(() => publicAnswerCorpusApprovalSchema.parse({
      schemaVersion: 1,
      entries: [{ recordId: 'articles/a-first', recordChecksum: 'sha256:not-a-checksum' }],
    })).toThrow();
    expect(() => publicAnswerCorpusApprovalSchema.parse({ schemaVersion: 1, entries: [], approved: true })).toThrow();
  });

  it('keeps answer artifacts closed and validates descriptor byte invariants', () => {
    expect(answerReleaseIdentitySchema.parse(manifest().identity)).toEqual(manifest().identity);
    expect(publicAnswerIndexInputSchema.parse({
      chunkId: hex,
      chunkChecksum: checksum,
      recordId: 'answer-only/editorial-note',
      collection: 'answer-only',
      canonicalPath: '/evidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
      title: 'Editorial note',
      headingPath: ['근거'],
      text: '검증된 공개 문장입니다.',
      searchText: '검증된 공개 문장입니다.',
    }).recordId).toBe('answer-only/editorial-note');
    expect(publicAnswerLexicalIndexSchema.parse({
      schemaVersion: 1,
      normalizerVersion: 'nfkc-lower-hangul-ngram-v1',
      documents: [{ chunkId: hex, length: 1 }],
      postings: { 공개: [{ document: 0, frequency: 1 }] },
    }).documents).toHaveLength(1);
    expect(publicAnswerReleaseManifestSchema.parse(manifest())).toEqual(manifest());
    expect(() => publicAnswerReleaseManifestSchema.parse({ ...manifest(), unexpected: true })).toThrow();
    for (const [key, path] of [
      ['chunks', 'wrong.ndjson'],
      ['evidence', 'wrong.ndjson'],
      ['indexInputs', 'wrong.ndjson'],
      ['lexicalIndex', 'wrong.ndjson'],
    ] as const) {
      expect(() => publicAnswerReleaseManifestSchema.parse({
        ...manifest(),
        files: { ...manifest().files, [key]: manifestFile(path, 1, 1) },
      })).toThrow();
    }
    expect(() => publicAnswerReleaseManifestSchema.parse({
      ...manifest(),
      files: { ...manifest().files, evidence: manifestFile('evidence.ndjson', 0, 1) },
    })).toThrow();
    expect(() => publicAnswerReleaseManifestSchema.parse({
      ...manifest(),
      files: { ...manifest().files, indexInputs: manifestFile('index-inputs.ndjson', 1, 0) },
    })).toThrow();
    expect(() => publicAnswerReleaseManifestSchema.parse({
      ...manifest(),
      files: { ...manifest().files, lexicalIndex: manifestFile('lexical-index.json', 0, 0) },
    })).toThrow();
  });
});
