import type { Pool } from 'pg';

import type { ServerConfig } from '../config/server-config.js';
import { readProviderDataControlReceipt } from '../config/provider-data-control-receipt.js';
import type { AnswerReleaseCatalogSnapshot } from '../modules/public-answer/application/ports/answer-release-catalog.js';
import type { AnswerReleaseCatalogSource } from '../modules/public-answer/application/ports/answer-release-catalog.js';
import {
  readBundledProviderPricing,
  readProviderEmbeddingReceipt,
  type ProviderEmbeddingReceipt,
} from '../modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import type { VerifiedCatalogSnapshot } from '../modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';

export type RuntimeBinding = Readonly<Pick<AnswerReleaseCatalogSnapshot, 'contentReleaseId' | 'answerReleaseId'>>;

export interface RuntimeReadinessOptions<T extends RuntimeBinding = RuntimeBinding> {
  readonly startupCheck?: () => Promise<T>;
}

interface RuntimeStartupDependencies {
  readonly pool: Pick<Pool, 'query'>;
  readonly catalogSource: AnswerReleaseCatalogSource;
  readonly readProviderDataControl?: typeof readProviderDataControlReceipt;
  readonly readProviderEmbedding?: typeof readProviderEmbeddingReceipt;
  readonly readProviderPricing?: typeof readBundledProviderPricing;
}

interface RuntimeChunkRow {
  chunk_id: string;
  chunk_checksum: string;
  embedding_model: string;
  embedding_dimensions: number;
}

export async function runRuntimeStartupChecks(
  config: Readonly<Pick<ServerConfig,
    'publicAskMode' | 'providerDataControlReceiptPath' | 'providerEmbeddingReceiptRoot'>>,
  dependencies: RuntimeStartupDependencies,
): Promise<VerifiedCatalogSnapshot> {
  await dependencies.pool.query('SELECT 1');
  const catalog = await dependencies.catalogSource.snapshot(new AbortController().signal) as VerifiedCatalogSnapshot;
  if (!(catalog.chunkChecksumById instanceof Map) && Object.prototype.toString.call(catalog.chunkChecksumById) !== '[object Map]') {
    throw new Error('runtime readiness catalog authority drift');
  }
  if (config.publicAskMode === 'fixture' && catalog.embeddingSource !== 'fixture') {
    throw new Error('runtime readiness fixture provenance drift');
  }
  if (config.publicAskMode === 'provider' && catalog.embeddingSource !== 'provider') {
    throw new Error('runtime readiness provider provenance drift');
  }
  const chunks = await dependencies.pool.query<RuntimeChunkRow>(`
    SELECT chunk_id,chunk_checksum,embedding_model,embedding_dimensions
    FROM public_answer_chunks WHERE binding_id=$1 ORDER BY chunk_id
  `, [catalog.bindingId]);
  if (chunks.rows.length !== catalog.chunkChecksumById.size) throw new Error('runtime readiness database chunk count drift');
  for (const row of chunks.rows) {
    if (catalog.chunkChecksumById.get(row.chunk_id) !== row.chunk_checksum
      || row.embedding_model !== 'text-embedding-3-large' || row.embedding_dimensions !== 3072) {
      throw new Error('runtime readiness database chunk provenance drift');
    }
  }
  if (config.publicAskMode === 'provider') {
    if (!config.providerDataControlReceiptPath || !config.providerEmbeddingReceiptRoot) {
      throw new Error('runtime readiness provider evidence is missing');
    }
    const readControl = dependencies.readProviderDataControl ?? readProviderDataControlReceipt;
    const readEmbedding = dependencies.readProviderEmbedding ?? readProviderEmbeddingReceipt;
    const readPricing = dependencies.readProviderPricing ?? readBundledProviderPricing;
    const [control, pricing, embedding] = await Promise.all([
      readControl(config.providerDataControlReceiptPath),
      readPricing(),
      readEmbedding(config.providerEmbeddingReceiptRoot, catalog.answerReleaseId, catalog.embeddingReceiptHash),
    ]) as readonly [Readonly<{ receiptHash: string }>, Readonly<{ receiptHash: string }>, ProviderEmbeddingReceipt];
    if (embedding.contentReleaseId !== catalog.contentReleaseId || embedding.answerReleaseId !== catalog.answerReleaseId
      || embedding.embeddingModel !== 'text-embedding-3-large' || embedding.embeddingDimensions !== 3072
      || embedding.embeddingSource !== 'provider' || embedding.providerDataControlReceiptHash !== control.receiptHash
      || embedding.providerPricingReceiptHash !== pricing.receiptHash) {
      throw new Error('runtime readiness provider evidence drift');
    }
  }
  return catalog;
}

export class RuntimeReadiness<T extends RuntimeBinding = RuntimeBinding> {
  readonly #startupCheck?: () => Promise<T>;
  #initialization: Promise<T> | undefined;
  #binding: T | null = null;
  #ready = false;

  constructor(options: RuntimeReadinessOptions<T> = {}) {
    this.#startupCheck = options.startupCheck;
  }

  initialize(): Promise<T> {
    this.#initialization ??= this.#runStartupCheck();
    return this.#initialization;
  }

  status(): Readonly<{ ready: boolean; binding: T | null }> {
    return Object.freeze({ ready: this.#ready, binding: this.#binding });
  }

  startupBinding(): T | null {
    return this.#binding;
  }

  beginShutdown(): void {
    this.#ready = false;
  }

  hardFailure(): void {
    this.#ready = false;
  }

  async #runStartupCheck(): Promise<T> {
    if (!this.#startupCheck) throw new Error('runtime readiness startup check failed');
    try {
      const binding = await this.#startupCheck();
      this.#binding = binding;
      this.#ready = true;
      return binding;
    } catch {
      this.#ready = false;
      throw new Error('runtime readiness startup check failed');
    }
  }
}
