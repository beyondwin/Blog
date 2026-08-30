import { describe, expect, it } from 'vitest';

import { ANSWER_QUERY_NORMALIZER_VERSION, normalizeAnswerQuery } from '../src/modules/public-answer/infrastructure/postgres/answer-query-normalizer.js';

describe('answer query normalizer', () => {
  it('mirrors the frozen NFKC/lower/letter-number whitespace algorithm', () => {
    expect(ANSWER_QUERY_NORMALIZER_VERSION).toBe('nfkc-lower-hangul-ngram-v1');
    expect(normalizeAnswerQuery('  AI와　책,  판단! ')).toBe('ai와 책 판단');
    expect(normalizeAnswerQuery('ＡＢＣ---42')).toBe('abc 42');
  });
});
