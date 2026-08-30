import type { ProviderTokenUsage } from './usage-guard.js';

export interface EmbeddingClient {
  readonly model: 'text-embedding-3-large';
  readonly dimensions: 3072;
  embed(texts: readonly string[], signal: AbortSignal): Promise<{
    vectors: readonly (readonly number[])[];
    usage: ProviderTokenUsage;
  }>;
}
