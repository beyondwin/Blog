import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { fuseRankedCandidates, retrievalIsSufficient } from '../src/modules/public-answer/infrastructure/postgres/reciprocal-rank-fusion.js';

describe('reciprocal rank fusion', () => {
  it('uses one-based ranks, deterministic ties, and three-record diversity before filling', () => {
    const result = fuseRankedCandidates(
      [
        { chunkId: 'a', recordId: 'r1' }, { chunkId: 'b', recordId: 'r1' },
        { chunkId: 'c', recordId: 'r2' }, { chunkId: 'd', recordId: 'r3' },
      ],
      [{ chunkId: 'b', recordId: 'r1' }, { chunkId: 'a', recordId: 'r1' }, { chunkId: 'c', recordId: 'r2' }],
    );
    expect(result.map((item) => item.chunkId)).toEqual(['a', 'c', 'd', 'b']);
    expect(result[0]).toMatchObject({ lexicalRank: 1, vectorRank: 2 });
    expect(result).toHaveLength(4);
  });

  it('applies the frozen sufficiency thresholds exactly', () => {
    expect(retrievalIsSufficient([
      { chunkId: 'a', recordId: 'r1', lexicalRank: 1, vectorRank: 20, rrfScore: 1 / 61 },
      { chunkId: 'b', recordId: 'r2', lexicalRank: 20, vectorRank: 5, rrfScore: 1 / 70 },
    ])).toBe(true);
    expect(retrievalIsSufficient([
      { chunkId: 'a', recordId: 'r1', lexicalRank: 6, vectorRank: 6, rrfScore: 1 / 61 },
      { chunkId: 'b', recordId: 'r2', lexicalRank: 7, vectorRank: 7, rrfScore: 1 / 70 },
    ])).toBe(false);
  });
  it('freezes only the approved first slice and refuses corpus-wide metric claims', async () => {
    const policy = JSON.parse(await readFile(new URL('../src/modules/public-answer/infrastructure/postgres/retrieval-policy.v1.json', import.meta.url), 'utf8'));
    expect(policy.evaluation).toEqual({ runnable: 1, deferred: 19, aggregateThresholds: 'not_measured' });
    expect(policy).toMatchObject({ schemaVersion: 1, candidateLimitPerBranch: 20, rrfK: 60, maxEvidence: 6, diversityTargetRecords: 3, tieBreak: 'rrfScore-desc/chunkId-asc' });
  });
});
