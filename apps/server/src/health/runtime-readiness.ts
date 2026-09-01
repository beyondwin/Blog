import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

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
import { providerChecksum } from '../modules/public-answer/infrastructure/openai/provider-json.js';
import {
  EMBEDDING_MODEL,
  EVALUATOR_HASH,
  EVALUATOR_VERSION,
  GENERATION_MODEL,
  PROMPT_SCHEMA_HASH,
  PROMPT_SCHEMA_VERSION,
  readProductionEvaluationReport,
  RETRIEVER_VERSION,
  SEMANTIC_VERIFIER_HASH,
  SEMANTIC_VERIFIER_VERSION,
} from '../modules/public-answer/evaluation/evaluation-report.js';
import { readEvaluationUsageReceipt } from '../modules/public-answer/evaluation/evaluation-usage-receipt.js';

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
  readonly readProductionEvaluation?: typeof readProductionEvaluationReport;
  readonly readEvaluationUsage?: typeof readEvaluationUsageReceipt;
  readonly readPublicEvaluationManifest?: () => Promise<Buffer>;
}

interface RuntimeChunkRow {
  chunk_id: string;
  chunk_checksum: string;
  record_id: string;
  canonical_path: string;
  title: string;
  heading_path: string[];
  body: string;
  search_text: string;
  embedding_model: string;
  embedding_dimensions: number;
  embedding: string;
}

function vectorChecksum(text: string): string {
  if (!/^\[(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:,-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)*)?\]$/iu.test(text)) {
    throw new Error('runtime readiness database vector drift');
  }
  const values = text.slice(1, -1).split(',').filter(Boolean).map(Number);
  if (values.length !== 3072 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('runtime readiness database vector drift');
  }
  const bytes = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatBE(Math.fround(value), index * 4));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function runRuntimeStartupChecks(
  config: Readonly<Pick<ServerConfig,
    'publicAskMode' | 'providerDataControlReceiptPath' | 'providerEmbeddingReceiptRoot'>
    & Partial<Pick<ServerConfig, 'nodeEnv' | 'productionEvalReportPath' | 'evaluationUsageReceiptPath' | 'providerAuthority'>>>,
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
    SELECT chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,search_text,
           embedding_model,embedding_dimensions,embedding::text
    FROM public_answer_chunks c WHERE binding_id=$1 AND NOT EXISTS (
      SELECT 1 FROM public_answer_tombstones t WHERE t.entity_kind='record' AND t.entity_id=c.record_id
    ) ORDER BY chunk_id
  `, [catalog.bindingId]);
  if (chunks.rows.length !== catalog.chunkChecksumById.size) throw new Error('runtime readiness database chunk count drift');
  const vectorEntries: Array<{ chunkId: string; chunkChecksum: string; vectorChecksum: string }> = [];
  const indexRows: Array<Record<string, unknown>> = [];
  for (const row of chunks.rows) {
    const expected = catalog.indexInputByChunkId.get(row.chunk_id);
    const expectedVector = catalog.vectorChecksumByChunkId.get(row.chunk_id);
    const actualVector = vectorChecksum(row.embedding);
    if (catalog.chunkChecksumById.get(row.chunk_id) !== row.chunk_checksum || !expected
      || expected.recordId !== row.record_id || expected.canonicalPath !== row.canonical_path || expected.title !== row.title
      || JSON.stringify(expected.headingPath) !== JSON.stringify(row.heading_path) || expected.body !== row.body
      || expected.searchText !== row.search_text || expectedVector !== actualVector
      || row.embedding_model !== 'text-embedding-3-large' || row.embedding_dimensions !== 3072) {
      throw new Error('runtime readiness database chunk provenance drift');
    }
    vectorEntries.push({ chunkId: row.chunk_id, chunkChecksum: row.chunk_checksum, vectorChecksum: actualVector });
    indexRows.push({
      chunkId: row.chunk_id, chunkChecksum: row.chunk_checksum, recordId: row.record_id,
      canonicalPath: row.canonical_path, title: row.title, headingPath: row.heading_path,
      body: row.body, searchText: row.search_text, vectorChecksum: actualVector,
      model: row.embedding_model, dimensions: row.embedding_dimensions, source: catalog.embeddingSource,
    });
  }
  if (providerChecksum(vectorEntries) !== catalog.vectorSetChecksum) throw new Error('runtime readiness database vector-set drift');
  if (providerChecksum(indexRows) !== catalog.indexRowsChecksum) throw new Error('runtime readiness database index-row checksum drift');
  if (config.providerAuthority?.kind === 'local-non-zdr') {
    if (config.nodeEnv === 'production') {
      throw new Error('runtime readiness production rejects local-non-zdr authority');
    }
  } else if (config.publicAskMode === 'provider') {
    if (config.nodeEnv === 'production' && config.providerAuthority?.kind !== 'production-zdr') {
      throw new Error('runtime readiness production requires production-zdr authority');
    }
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
    ]) as readonly [Awaited<ReturnType<typeof readProviderDataControlReceipt>>, Readonly<{ receiptHash: string }>, ProviderEmbeddingReceipt];
    if (embedding.contentReleaseId !== catalog.contentReleaseId || embedding.answerReleaseId !== catalog.answerReleaseId
      || embedding.embeddingModel !== 'text-embedding-3-large' || embedding.embeddingDimensions !== 3072
      || embedding.embeddingSource !== 'provider' || embedding.providerDataControlReceiptHash !== control.receiptHash
      || embedding.providerPricingReceiptHash !== pricing.receiptHash) {
      throw new Error('runtime readiness provider evidence drift');
    }
    if (config.nodeEnv === 'production') {
      if (!config.productionEvalReportPath || !config.evaluationUsageReceiptPath) throw new Error('runtime readiness production evaluation report or usage receipt is missing');
      const retrievalPolicy = await readFile(new URL('../modules/public-answer/infrastructure/postgres/retrieval-policy.v1.json', import.meta.url));
      const retrievalPolicyHash = providerChecksum(retrievalPolicy);
      const publicManifestBytes = dependencies.readPublicEvaluationManifest
        ? await dependencies.readPublicEvaluationManifest()
        : await readFile(new URL('../../../../tests/fixtures/public-answer/eval-manifest.v1.json', import.meta.url));
      const readProduction = dependencies.readProductionEvaluation ?? readProductionEvaluationReport;
      const readUsage = dependencies.readEvaluationUsage ?? readEvaluationUsageReceipt;
      const usage = await readUsage(config.evaluationUsageReceiptPath, {
        providerProjectHash: control.projectHash,
        providerDataControlReceiptHash: control.receiptHash,
        providerPricingReceiptHash: pricing.receiptHash,
        corpusApprovalHash: catalog.corpusApprovalHash,
        providerEmbeddingReceiptHash: catalog.embeddingReceiptHash,
        retrievalPolicyHash,
      });
      const report = await readProduction(config.productionEvalReportPath, {
        contentReleaseId: catalog.contentReleaseId,
        answerReleaseId: catalog.answerReleaseId,
        contentManifestHash: catalog.contentManifestHash,
        answerManifestHash: catalog.answerManifestHash,
        answerArtifactHash: catalog.answerArtifactHash,
        publicManifestHash: providerChecksum(publicManifestBytes),
        corpusApprovalHash: catalog.corpusApprovalHash,
        embeddingSource: 'provider',
        embeddingModel: EMBEDDING_MODEL,
        embeddingReceiptHash: catalog.embeddingReceiptHash,
        generationModel: GENERATION_MODEL,
        retrieverVersion: RETRIEVER_VERSION,
        retrievalPolicyHash,
        evaluatorVersion: EVALUATOR_VERSION,
        evaluatorHash: EVALUATOR_HASH,
        promptSchemaVersion: PROMPT_SCHEMA_VERSION,
        promptSchemaHash: PROMPT_SCHEMA_HASH,
        semanticVerifierVersion: SEMANTIC_VERIFIER_VERSION,
        semanticVerifierHash: SEMANTIC_VERIFIER_HASH,
        providerDataControlReceiptHash: control.receiptHash,
        providerPricingReceiptHash: pricing.receiptHash,
        evaluationUsageReceiptHash: usage.receiptHash,
      });
      if (usage.receiptHash !== report.evaluationUsageReceiptHash || usage.hiddenManifestHash !== report.hiddenManifestHash) {
        throw new Error('runtime readiness evaluation usage receipt drift');
      }
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
