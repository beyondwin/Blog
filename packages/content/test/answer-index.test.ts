import { describe, expect, it } from 'vitest';
import type { PublicAnswerChunk } from '@beyondwin/contracts';
import {
  buildAnswerIndexes,
  normalizeAnswerText,
  tokenizeAnswerText,
} from '../src/answer-release/build-index-inputs';
import { canonicalJsonLine } from '../src/answer-release/identity';

function chunk(id: string, text: string, ordinal: number): PublicAnswerChunk {
  return {
    chunkId: id.repeat(64),
    recordId: 'articles/public-fixture',
    collection: 'articles',
    canonicalPath: '/articles/public-fixture/',
    title: '공개 픽스처',
    headingPath: ['판단'],
    ordinal,
    text,
    checksum: `sha256:${id.repeat(64)}`,
  };
}

describe('public answer lexical inputs', () => {
  it('normalizes and tokenizes Korean terms without deduplicating repeated source words', () => {
    expect(normalizeAnswerText('  AI와\u3000책,  판단! ')).toBe('ai와 책 판단');
    expect(tokenizeAnswerText('판단')).toEqual(['판단']);
    expect(tokenizeAnswerText('판단 판단')).toEqual(['판단', '판단']);
    expect(tokenizeAnswerText('가나다')).toEqual(['가나다', '가나', '나다']);
  });

  it('builds stable sorted postings and public-only document inputs', () => {
    const chunks = [
      { ...chunk('a', '판단 판단', 2), title: 'public', headingPath: [] },
      { ...chunk('b', '가나다', 1), title: 'public', headingPath: [] },
    ];
    const first = buildAnswerIndexes(chunks);
    const second = buildAnswerIndexes([...chunks].reverse());

    expect(canonicalJsonLine(first)).toBe(canonicalJsonLine(second));
    expect(first.lexicalIndex.documents).toHaveLength(chunks.length);
    expect(first.lexicalIndex.postings['판단']).toEqual([{ document: 0, frequency: 2 }]);
    expect(first.indexInputs.map((item) => item.chunkId)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    expect(JSON.stringify(first)).not.toMatch(/bodyHtml|sourcePath|embedding|rawPrompt|<p/u);
  });

  it('returns the canonical empty lexical artifact', () => {
    expect(buildAnswerIndexes([])).toEqual({
      indexInputs: [],
      lexicalIndex: {
        schemaVersion: 1,
        normalizerVersion: 'nfkc-lower-hangul-ngram-v1',
        documents: [],
        postings: {},
      },
    });
  });
});
