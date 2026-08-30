import { describe, expect, it } from 'vitest';

import { DeterministicEmbeddingClient } from '../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import {
  createFixtureEmbeddingReceipt,
  createProviderEmbeddingReceipt,
  prepareEmbeddingSet,
} from '../src/modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';

describe('deterministic fixture embedding preparation', () => {
  it('creates stable finite normalized 3072-dimensional vectors and provenance-bound checksums', async () => {
    const client = new DeterministicEmbeddingClient('test');
    const release = {
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`,
      indexInputs: [{
        chunkId: '1'.repeat(64), chunkChecksum: `sha256:${'2'.repeat(64)}`, recordId: 'articles/example',
        collection: 'articles', canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'],
        text: 'Deterministic public text', searchText: 'deterministic public text',
      }],
    } as any;
    const first = await prepareEmbeddingSet(release, client, new AbortController().signal);
    const second = await prepareEmbeddingSet(release, client, new AbortController().signal);
    expect(first).toEqual(second);
    expect(first.vectors[0]?.values).toHaveLength(3072);
    expect(first.vectors[0]?.values.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...first.vectors[0]!.values)).toBeCloseTo(1, 7);
    expect(first.indexChecksum).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(first.usage).toEqual({ calls: 1, inputTokens: 3, outputTokens: 0, estimatedCostUsdMicros: 0 });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('does not call the embedding client for an empty verified release', async () => {
    let calls = 0;
    const client = {
      model: 'text-embedding-3-large' as const, dimensions: 3072 as const,
      async embed() { calls += 1; throw new Error('must not call'); },
    };
    const prepared = await prepareEmbeddingSet({
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`, indexInputs: [],
    } as any, client, new AbortController().signal);
    expect(calls).toBe(0);
    expect(prepared.vectors).toEqual([]);
    expect(prepared.usage).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsdMicros: 0 });
  });

  it('rejects fixture construction in production', () => {
    expect(() => new DeterministicEmbeddingClient('production')).toThrow(/fixture/u);
  });

  it('rejects impossible negative provider usage before creating provenance', async () => {
    const release = {
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`, indexInputs: [],
    } as any;
    const prepared = await prepareEmbeddingSet(release, new DeterministicEmbeddingClient('test'), new AbortController().signal);
    expect(() => createProviderEmbeddingReceipt(prepared, { calls: -1, inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }))
      .toThrow(/usage/u);
  });

  it('reuses vectors only after strict-reopening the exact completed provenance receipt', async () => {
    const client = new DeterministicEmbeddingClient('test');
    const release = {
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`,
      indexInputs: [{
        chunkId: '1'.repeat(64), chunkChecksum: `sha256:${'2'.repeat(64)}`, recordId: 'articles/example',
        canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'], text: 'cached text', searchText: 'cached text',
      }],
    } as any;
    const original = await prepareEmbeddingSet(release, client, new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(original);
    const cached = await prepareEmbeddingSet(release, {
      model: 'text-embedding-3-large', dimensions: 3072,
      async embed() { throw new Error('cache miss would call adapter'); },
    }, new AbortController().signal, {
      completedCache: {
        receipt,
        async reopenReceipt(hash) { expect(hash).toBe(receipt.receiptHash); return receipt; },
        async lookup(input) {
          expect(input).toEqual({
            chunkChecksum: `sha256:${'2'.repeat(64)}`, model: 'text-embedding-3-large', dimensions: 3072,
            source: 'fixture', receiptHash: receipt.receiptHash,
          });
          return original.vectors[0]!.values;
        },
      },
    });
    expect(cached.vectorSetChecksum).toBe(original.vectorSetChecksum);
    expect(cached.usage).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsdMicros: 0 });

    await expect(prepareEmbeddingSet(release, client, new AbortController().signal, {
      completedCache: {
        receipt,
        async reopenReceipt() { return { ...receipt, answerReleaseId: 'f'.repeat(64) }; },
        async lookup() { return original.vectors[0]!.values; },
      },
    })).rejects.toThrow(/changed on strict reopen/u);
  });
});
