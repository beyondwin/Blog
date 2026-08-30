import {
  publicAnswerIndexInputSchema,
  publicAnswerLexicalIndexSchema,
  type PublicAnswerChunk,
  type PublicAnswerIndexInput,
  type PublicAnswerLexicalIndex,
} from '@beyondwin/contracts';
import { ANSWER_NORMALIZER_VERSION, codePointCompare } from './identity';

export function normalizeAnswerText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

export function tokenizeAnswerText(value: string): string[] {
  const words = normalizeAnswerText(value).split(' ').filter(Boolean);
  const tokens: string[] = [];
  for (const word of words) {
    const wordTokens = new Set([word]);
    if (/\p{Script=Hangul}/u.test(word)) {
      const points = Array.from(word);
      for (let index = 0; index < points.length - 1; index += 1) wordTokens.add(`${points[index]}${points[index + 1]}`);
    }
    tokens.push(...wordTokens);
  }
  return tokens;
}

export function buildAnswerIndexes(chunks: readonly PublicAnswerChunk[]): {
  indexInputs: PublicAnswerIndexInput[];
  lexicalIndex: PublicAnswerLexicalIndex;
} {
  const sortedChunks = [...chunks].sort((left, right) => codePointCompare(left.chunkId, right.chunkId));
  const indexInputs = sortedChunks.map((chunk) => publicAnswerIndexInputSchema.parse({
    chunkId: chunk.chunkId,
    chunkChecksum: chunk.checksum,
    recordId: chunk.recordId,
    collection: chunk.collection,
    canonicalPath: chunk.canonicalPath,
    title: chunk.title,
    headingPath: chunk.headingPath,
    text: chunk.text,
    searchText: [chunk.title, ...chunk.headingPath, chunk.text].join(' '),
  }));
  const postingMap = new Map<string, Map<number, number>>();
  const documents = sortedChunks.map((chunk, document) => {
    const tokens = tokenizeAnswerText([chunk.title, ...chunk.headingPath, chunk.text].join(' '));
    for (const term of tokens) {
      const postings = postingMap.get(term) ?? new Map<number, number>();
      postings.set(document, (postings.get(document) ?? 0) + 1);
      postingMap.set(term, postings);
    }
    return { chunkId: chunk.chunkId, length: tokens.length };
  });
  const postings = Object.fromEntries([...postingMap.entries()]
    .sort(([left], [right]) => codePointCompare(left, right))
    .map(([term, entries]) => [term, [...entries.entries()]
      .sort(([left], [right]) => left - right)
      .map(([document, frequency]) => ({ document, frequency }))]));
  return {
    indexInputs,
    lexicalIndex: publicAnswerLexicalIndexSchema.parse({
      schemaVersion: 1,
      normalizerVersion: ANSWER_NORMALIZER_VERSION,
      documents,
      postings,
    }),
  };
}
