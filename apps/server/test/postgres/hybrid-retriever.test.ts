import { describe, expect, it, vi } from 'vitest';

import { PostgresHybridRetriever } from '../../src/modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';

function catalog() {
  const evidence = Object.freeze({ evidenceId: 'e1', chunkId: 'a', answerReleaseId: 'r'.repeat(64), recordId: 'record-a', collectionLabel: '기록', recordTitle: 'A', canonicalPath: '/a/', locator: { kind: 'heading-paragraph' as const, label: 'H', ordinal: 1 }, excerpt: 'A', excerptChecksum: `sha256:${'1'.repeat(64)}` });
  return Object.freeze({
    bindingId: '11111111-1111-4111-8111-111111111111', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'r'.repeat(64), corpusApprovalHash: `sha256:${'2'.repeat(64)}`, chunkCount: 1,
    normalizerVersion: 'nfkc-lower-hangul-ngram-v1' as const, embeddingSource: 'fixture' as const, embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
    tombstones: new Set<string>(), evidenceById: new Map([['e1', evidence]]),
    chunkById: new Map([['a', Object.freeze({ chunkId: 'a', recordId: 'record-a', canonicalPath: '/a/' })]]),
    chunkChecksumById: new Map([['a', `sha256:${'4'.repeat(64)}`]]),
    isBoundTo: () => true, evidenceFor: (ids: readonly string[]) => ids.flatMap((id) => id === 'e1' ? [evidence] : []),
  });
}

describe('PostgresHybridRetriever', () => {
  it('embeds normalized query once, scopes both branches to immutable binding/release, and resolves catalog evidence', async () => {
    const embed = vi.fn(async () => ({ vectors: [Array(3072).fill(0.1)], usage: { calls: 1, inputTokens: 3, outputTokens: 0 } }));
    const query = vi.fn(async (_sql: string, _values: readonly unknown[], _signal: AbortSignal, _budget: number) => ({ rows: [{ chunk_id: 'a', chunk_checksum: `sha256:${'4'.repeat(64)}`, record_id: 'record-a', score: 1 }] }));
    const result = await new PostgresHybridRetriever({ model: 'text-embedding-3-large', dimensions: 3072, embed }, { query } as any)
      .retrieve({ question: '  AI와　책,  판단! ', catalog: catalog(), limit: 6, signal: new AbortController().signal });
    expect(embed).toHaveBeenCalledOnce(); expect(embed).toHaveBeenCalledWith(['ai와 책 판단'], expect.any(AbortSignal));
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![1]).toEqual(['11111111-1111-4111-8111-111111111111', 'r'.repeat(64), 'ai와 책 판단']);
    expect(query.mock.calls[1]![1]![0]).toBe('11111111-1111-4111-8111-111111111111');
    expect(query.mock.calls[1]![1]![2]).toBe('r'.repeat(64));
    expect(result.evidence).toEqual([expect.objectContaining({ evidenceId: 'e1' })]);
  });

  it('fails closed on normalizer drift and unknown or mismatched DB chunks', async () => {
    const embed = vi.fn(async () => ({ vectors: [Array(3072).fill(0.1)], usage: { calls: 1, inputTokens: 1, outputTokens: 0 } }));
    const query = vi.fn(async (_sql: string, _values: readonly unknown[], _signal: AbortSignal, _budget: number) => ({ rows: [{ chunk_id: 'unknown', chunk_checksum: `sha256:${'5'.repeat(64)}`, record_id: 'record-x', score: 1 }] }));
    await expect(new PostgresHybridRetriever({ model: 'text-embedding-3-large', dimensions: 3072, embed }, { query } as any)
      .retrieve({ question: 'q', catalog: catalog(), limit: 6, signal: new AbortController().signal })).rejects.toThrow(/catalog|chunk/u);
    await expect(new PostgresHybridRetriever({ model: 'text-embedding-3-large', dimensions: 3072, embed }, { query } as any)
      .retrieve({ question: 'q', catalog: { ...catalog(), normalizerVersion: 'v2' } as any, limit: 6, signal: new AbortController().signal })).rejects.toThrow(/normalizer/u);
  });
});
