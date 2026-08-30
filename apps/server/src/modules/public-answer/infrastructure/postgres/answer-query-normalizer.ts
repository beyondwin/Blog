export const ANSWER_QUERY_NORMALIZER_VERSION = 'nfkc-lower-hangul-ngram-v1' as const;

export function normalizeAnswerQuery(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('und').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}
