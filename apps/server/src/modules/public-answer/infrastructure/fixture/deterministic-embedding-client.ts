import { createHash } from 'node:crypto';

import type { EmbeddingClient } from '../../application/ports/embedding-client.js';

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/gu, ' ').trim();
}

function vectorFor(value: string): readonly number[] {
  const seed = Buffer.from(normalized(value), 'utf8');
  const values = new Array<number>(3072);
  for (let offset = 0; offset < values.length; offset += 32) {
    const bytes = createHash('sha256').update(seed).update(String(offset / 32)).digest();
    for (let index = 0; index < bytes.length; index += 1) values[offset + index] = (bytes[index]! - 127.5) / 127.5;
  }
  const norm = Math.hypot(...values);
  return Object.freeze(values.map((item) => item / norm));
}

export class DeterministicEmbeddingClient implements EmbeddingClient {
  readonly model = 'text-embedding-3-large' as const;
  readonly dimensions = 3072 as const;

  constructor(nodeEnv: 'development' | 'test' | 'production') {
    if (nodeEnv === 'production') throw new Error('deterministic embeddings are fixture-only');
  }

  async embed(texts: readonly string[], signal: AbortSignal) {
    if (signal.aborted) throw signal.reason ?? new Error('embedding aborted');
    const vectors = texts.map(vectorFor);
    return {
      vectors: Object.freeze(vectors),
      usage: { inputTokens: texts.reduce((total, text) => total + normalized(text).split(' ').filter(Boolean).length, 0), outputTokens: 0 },
    };
  }
}
