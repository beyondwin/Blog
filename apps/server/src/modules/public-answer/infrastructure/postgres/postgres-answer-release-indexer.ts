import { createHash } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import type { EmbeddingClient } from '../../application/ports/embedding-client.js';
import type { VerifiedActivePublicAnswerReleaseAuthority } from '../release/verified-answer-release-catalog.js';
import {
  createProviderEmbeddingReceipt,
  estimateEmbeddingCostMicroUsd,
  isLocalProviderEmbeddingReceipt,
  type DurableProviderEmbeddingReceipt,
} from '../openai/provider-embedding-receipt.js';
import { PROVIDER_MODEL_POLICY, providerOperationCostMicroUsd } from '../openai/provider-model-policy.js';

const MODEL = 'text-embedding-3-large' as const;
const DIMENSIONS = 3072 as const;
const GLOBAL_ACTIVATION_LOCK = 'form-thought:public-answer:global-activation:v1';

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite values are forbidden');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => codePointCompare(a, b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  throw new TypeError('canonical data must be JSON');
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')}`;
}

function writtenIndexMismatch(
  expectedRows: readonly PreparedIndexRow[],
  writtenRows: readonly PreparedIndexRow[],
): string {
  if (expectedRows.length !== writtenRows.length) {
    return `row-count ${writtenRows.length}!=${expectedRows.length}`;
  }
  const expectedById = new Map(expectedRows.map((row) => [row.chunkId, row]));
  let byIdVectorMismatches = 0;
  for (const written of writtenRows) {
    const expected = expectedById.get(written.chunkId);
    if (!expected || expected.vectorChecksum !== written.vectorChecksum) byIdVectorMismatches += 1;
  }
  for (let index = 0; index < expectedRows.length; index += 1) {
    const expected = expectedRows[index]!;
    const written = writtenRows[index]!;
    if (expected.chunkId !== written.chunkId) {
      return `order:chunkId@${index};byIdVectorMismatches:${byIdVectorMismatches}`;
    }
    const keys = Object.keys(expected).sort() as (keyof PreparedIndexRow)[];
    for (const key of keys) {
      if (canonical(expected[key]) !== canonical(written[key])) {
        return `field:${String(key)}@${index};byIdVectorMismatches:${byIdVectorMismatches}`;
      }
    }
  }
  return `provenance-or-canonicalization;byIdVectorMismatches:${byIdVectorMismatches}`;
}

function writtenVectorDrift(
  expectedVectors: readonly PreparedEmbeddingVector[],
  writtenVectors: readonly { chunkId: string; values: readonly number[]; vectorChecksum: string }[],
): string {
  const expectedById = new Map(expectedVectors.map((item) => [item.chunkId, item]));
  let driftedRows = 0;
  let driftedDims = 0;
  for (const written of writtenVectors) {
    const expected = expectedById.get(written.chunkId);
    if (!expected) {
      driftedRows += 1;
      continue;
    }
    let rowDrift = 0;
    for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) {
      if (expected.values[dimension] !== Math.fround(written.values[dimension]!)) rowDrift += 1;
    }
    if (rowDrift > 0 || expected.vectorChecksum !== written.vectorChecksum) {
      driftedRows += 1;
      driftedDims += rowDrift;
    }
  }
  return `rows=${driftedRows},dims=${driftedDims}`;
}

function detachedFrozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => detachedFrozen(item))) as T;
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, detachedFrozen(child)]))) as T;
  }
  return value;
}

function float32(value: number): number {
  const rounded = Math.fround(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vectorChecksum(values: readonly number[]): string {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatBE(float32(value), index * 4));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export interface PreparedEmbeddingVector {
  readonly chunkId: string;
  readonly chunkChecksum: string;
  readonly values: readonly number[];
  readonly vectorChecksum: string;
}

export interface PreparedIndexRow {
  readonly chunkId: string; readonly chunkChecksum: string; readonly recordId: string;
  readonly canonicalPath: string; readonly title: string; readonly headingPath: readonly string[];
  readonly body: string; readonly searchText: string; readonly vectorChecksum: string;
  readonly model: typeof MODEL; readonly dimensions: typeof DIMENSIONS; readonly source: string;
}

export interface PreparedEmbeddingSet {
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly contentManifestHash: string;
  readonly answerManifestHash: string;
  readonly answerArtifactHash: string;
  readonly corpusApprovalHash: string;
  readonly model: typeof MODEL;
  readonly dimensions: typeof DIMENSIONS;
  readonly vectors: readonly PreparedEmbeddingVector[];
  readonly indexRows: readonly PreparedIndexRow[];
  readonly vectorSetChecksum: string;
  readonly indexChecksum: string;
  readonly usage: Readonly<{ calls: number; inputTokens: number; outputTokens: number; estimatedCostUsdMicros: number }>;
}

export interface EmbeddingProvenanceReceipt {
  readonly schemaVersion: 1;
  readonly bindingId: string;
  readonly source: 'fixture' | 'provider';
  readonly model: typeof MODEL;
  readonly dimensions: typeof DIMENSIONS;
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly contentManifestHash: string;
  readonly answerManifestHash: string;
  readonly answerArtifactHash: string;
  readonly corpusApprovalHash: string;
  readonly vectorSetChecksum: string;
  readonly indexChecksum: string;
  readonly chunkCount: number;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsdMicros: number;
  readonly receiptHash: string;
}

export interface CompletedEmbeddingCache {
  readonly receipt: EmbeddingProvenanceReceipt;
  reopenReceipt(receiptHash: string): Promise<EmbeddingProvenanceReceipt>;
  lookup(input: Readonly<{
    chunkChecksum: string; model: typeof MODEL; dimensions: typeof DIMENSIONS;
    source: 'fixture' | 'provider'; receiptHash: string;
  }>): Promise<readonly number[] | null>;
}

function indexPayload(release: VerifiedActivePublicAnswerReleaseAuthority, vectors: readonly PreparedEmbeddingVector[], source = 'unbound') {
  const byChunk = new Map(vectors.map((item) => [item.chunkId, item]));
  return release.indexInputs.map((input) => {
    const vector = byChunk.get(input.chunkId);
    if (!vector) throw new Error('prepared vector is missing for an approved chunk');
    return {
      chunkId: input.chunkId, chunkChecksum: input.chunkChecksum, recordId: input.recordId,
      canonicalPath: input.canonicalPath, title: input.title, headingPath: [...input.headingPath],
      body: input.text, searchText: input.searchText, vectorChecksum: vector.vectorChecksum,
      model: MODEL, dimensions: DIMENSIONS, source,
    };
  });
}

function releaseHashes(release: VerifiedActivePublicAnswerReleaseAuthority) {
  return {
    contentReleaseId: release.contentReleaseId,
    answerReleaseId: release.answerReleaseId,
    contentManifestHash: release.manifest.identity.contentManifestHash,
    answerManifestHash: release.manifestHash,
    answerArtifactHash: release.artifactHash,
    corpusApprovalHash: release.corpusApprovalHash,
  };
}

export async function prepareEmbeddingSet(
  release: VerifiedActivePublicAnswerReleaseAuthority,
  client: EmbeddingClient,
  signal: AbortSignal,
  options: Readonly<{ completedCache?: CompletedEmbeddingCache; batchSize?: number }> = {},
): Promise<Readonly<PreparedEmbeddingSet>> {
  if (client.model !== MODEL || client.dimensions !== DIMENSIONS) throw new Error('embedding model contract mismatch');
  if (signal.aborted) throw signal.reason ?? new Error('embedding preparation aborted');
  const batchSize = options.batchSize ?? 64;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 256) throw new Error('embedding batch size is invalid');
  let response: { vectors: readonly (readonly number[])[]; usage: { calls: number; inputTokens: number; outputTokens: number } };
  const cache = options.completedCache;
  if (release.indexInputs.length > 0 && cache) {
    const reopened = await cache.reopenReceipt(cache.receipt.receiptHash);
    if (canonical(reopened) !== canonical(cache.receipt)) throw new Error('completed embedding receipt changed on strict reopen');
    const cached = await Promise.all(release.indexInputs.map((input) => cache.lookup({
      chunkChecksum: input.chunkChecksum, model: MODEL, dimensions: DIMENSIONS,
      source: reopened.source, receiptHash: reopened.receiptHash,
    })));
    response = cached.every((vector): vector is readonly number[] => vector !== null)
      ? { vectors: cached, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } }
      : await embedBatches(release, client, signal, batchSize);
  } else {
    response = release.indexInputs.length === 0
      ? { vectors: [], usage: { calls: 0, inputTokens: 0, outputTokens: 0 } }
      : await embedBatches(release, client, signal, batchSize);
  }
  if (response.vectors.length !== release.indexInputs.length) throw new Error('embedding count mismatch');
  const vectors = response.vectors.map((raw, index) => {
    if (raw.length !== DIMENSIONS || raw.some((value) => !Number.isFinite(value))) throw new Error('embedding dimensions or values are invalid');
    const values = Object.freeze(raw.map(float32));
    const input = release.indexInputs[index]!;
    return Object.freeze({
      chunkId: input.chunkId, chunkChecksum: input.chunkChecksum, values,
      vectorChecksum: vectorChecksum(values),
    });
  });
  const vectorSetChecksum = checksum(vectors.map(({ chunkId, chunkChecksum, vectorChecksum }) => ({ chunkId, chunkChecksum, vectorChecksum })));
  const indexRows = detachedFrozen(indexPayload(release, vectors));
  const result: PreparedEmbeddingSet = {
    ...releaseHashes(release), model: MODEL, dimensions: DIMENSIONS, vectors: Object.freeze(vectors), vectorSetChecksum,
    indexRows, indexChecksum: checksum(indexRows),
    usage: Object.freeze({ ...response.usage, estimatedCostUsdMicros: 0 }),
  };
  if (cache && response.usage.inputTokens === 0 && release.indexInputs.length > 0) assertReceipt(release, result, cache.receipt);
  return Object.freeze(result);
}

async function embedBatches(
  release: VerifiedActivePublicAnswerReleaseAuthority,
  client: EmbeddingClient,
  signal: AbortSignal,
  batchSize: number,
): Promise<{ vectors: readonly (readonly number[])[]; usage: { calls: number; inputTokens: number; outputTokens: number } }> {
  const unique = [...new Map(release.indexInputs.map((item) => [item.chunkChecksum, item])).values()];
  const byChecksum = new Map<string, readonly number[]>();
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  for (let start = 0; start < unique.length; start += batchSize) {
    if (signal.aborted) throw signal.reason ?? new Error('embedding preparation aborted');
    const batch = unique.slice(start, start + batchSize);
    const response = await client.embed(batch.map((item) => item.text), signal);
    if (response.vectors.length !== batch.length) throw new Error('embedding batch count mismatch');
    batch.forEach((item, index) => byChecksum.set(item.chunkChecksum, response.vectors[index]!)); usage.calls += 1;
    usage.inputTokens += response.usage.inputTokens; usage.outputTokens += response.usage.outputTokens;
  }
  return { vectors: release.indexInputs.map((item) => byChecksum.get(item.chunkChecksum)!), usage };
}

function deterministicUuid(hash: string): string {
  const hex = hash.replace(/^sha256:/u, '').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

export function createFixtureEmbeddingReceipt(prepared: PreparedEmbeddingSet): Readonly<EmbeddingProvenanceReceipt> {
  const provenance = {
    schemaVersion: 1 as const, source: 'fixture' as const, model: MODEL, dimensions: DIMENSIONS,
    contentReleaseId: prepared.contentReleaseId, answerReleaseId: prepared.answerReleaseId,
    contentManifestHash: prepared.contentManifestHash, answerManifestHash: prepared.answerManifestHash,
    answerArtifactHash: prepared.answerArtifactHash, corpusApprovalHash: prepared.corpusApprovalHash,
    vectorSetChecksum: prepared.vectorSetChecksum,
    chunkCount: prepared.vectors.length, calls: prepared.usage.calls,
    inputTokens: prepared.usage.inputTokens, outputTokens: prepared.usage.outputTokens, costUsdMicros: 0,
  };
  const rows = prepared.indexRows.map((row) => ({ ...row, source: 'fixture' }));
  const indexChecksum = checksum({ rows, provenance });
  const bindingId = deterministicUuid(checksum({ provenance, indexChecksum }));
  const receiptHash = checksum({ ...provenance, indexChecksum, bindingId });
  return Object.freeze({ ...provenance, indexChecksum, bindingId, receiptHash });
}

function receiptProvenance(receipt: EmbeddingProvenanceReceipt) {
  return {
    schemaVersion: receipt.schemaVersion, source: receipt.source, model: receipt.model, dimensions: receipt.dimensions,
    contentReleaseId: receipt.contentReleaseId, answerReleaseId: receipt.answerReleaseId,
    contentManifestHash: receipt.contentManifestHash, answerManifestHash: receipt.answerManifestHash,
    answerArtifactHash: receipt.answerArtifactHash, corpusApprovalHash: receipt.corpusApprovalHash,
    vectorSetChecksum: receipt.vectorSetChecksum, chunkCount: receipt.chunkCount, calls: receipt.calls,
    inputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens, costUsdMicros: receipt.costUsdMicros,
  };
}

function assertReceipt(release: VerifiedActivePublicAnswerReleaseAuthority, prepared: PreparedEmbeddingSet, receipt: EmbeddingProvenanceReceipt): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(receipt.bindingId)
    || !['fixture', 'provider'].includes(receipt.source)
    || !Number.isInteger(receipt.calls) || !Number.isInteger(receipt.inputTokens) || !Number.isInteger(receipt.outputTokens)
    || !Number.isInteger(receipt.costUsdMicros)
    || receipt.calls < 0 || receipt.inputTokens < 0 || receipt.outputTokens < 0 || receipt.costUsdMicros < 0) {
    throw new Error('embedding provenance receipt identity or usage is invalid');
  }
  const hashes = releaseHashes(release);
  for (const [key, value] of Object.entries(hashes)) {
    if (receipt[key as keyof EmbeddingProvenanceReceipt] !== value || prepared[key as keyof PreparedEmbeddingSet] !== value) {
      throw new Error(`embedding provenance ${key} mismatch`);
    }
  }
  if (receipt.model !== MODEL || receipt.dimensions !== DIMENSIONS || prepared.model !== MODEL || prepared.dimensions !== DIMENSIONS
    || receipt.vectorSetChecksum !== prepared.vectorSetChecksum || receipt.chunkCount !== prepared.vectors.length) {
    throw new Error('embedding provenance receipt does not bind the prepared vector set');
  }
  const expectedIndex = checksum({
    rows: prepared.indexRows.map((row) => ({ ...row, source: receipt.source })),
    provenance: receiptProvenance(receipt),
  });
  if (receipt.indexChecksum !== expectedIndex) throw new Error('embedding provenance index checksum mismatch');
  const { receiptHash, ...receiptBody } = receipt;
  if (receipt.source === 'fixture' ? receiptHash !== checksum(receiptBody)
    : !/^sha256:[a-f0-9]{64}$/u.test(receiptHash) || receipt.bindingId !== deterministicUuid(receiptHash)) {
    throw new Error('embedding provenance receipt hash mismatch');
  }
}

function assertProviderAuthorization(prepared: PreparedEmbeddingSet, receipt: EmbeddingProvenanceReceipt, authority: DurableProviderEmbeddingReceipt): void {
  const exactEntries = prepared.vectors.map(({ chunkChecksum, vectorChecksum }) => ({ chunkChecksum, vectorChecksum }));
  if (isLocalProviderEmbeddingReceipt(authority)
    && (authority.providerAuthorityKind !== 'local-non-zdr'
      || authority.providerPolicyHash !== PROVIDER_MODEL_POLICY.policyHash
      || authority.providerPricingReceiptHash !== PROVIDER_MODEL_POLICY.pricingReceiptHash)) {
    throw new Error('provider activation receipt authority mismatch');
  }
  if (authority.embeddingReceiptHash !== receipt.receiptHash || authority.contentReleaseId !== receipt.contentReleaseId
    || authority.answerReleaseId !== receipt.answerReleaseId || authority.contentManifestHash !== receipt.contentManifestHash
    || authority.answerManifestHash !== receipt.answerManifestHash || authority.answerArtifactHash !== receipt.answerArtifactHash
    || authority.corpusApprovalHash !== receipt.corpusApprovalHash || authority.embeddingModel !== receipt.model
    || authority.embeddingDimensions !== receipt.dimensions || authority.embeddingSource !== receipt.source
    || authority.providerVectorSetChecksum !== receipt.vectorSetChecksum || authority.indexChecksum !== receipt.indexChecksum
    || authority.inputTokens !== receipt.inputTokens || authority.costMicroUsd !== receipt.costUsdMicros
    || canonical(authority.entries) !== canonical(exactEntries)) throw new Error('provider activation receipt authority mismatch');
}

export type ProviderEmbeddingAuthorityInput = Readonly<{
  createdAt: string;
  completedAt: string;
  providerPricingReceiptHash: string;
} & (
  | { providerDataControlReceiptHash: string }
  | {
      providerAuthorityKind: 'local-non-zdr';
      providerAuthorityHash: string;
      providerPolicyHash: string;
    }
)>;

export function createProviderEmbeddingAuthorities(
  release: VerifiedActivePublicAnswerReleaseAuthority,
  prepared: PreparedEmbeddingSet,
  input: ProviderEmbeddingAuthorityInput,
): Readonly<{ durable: DurableProviderEmbeddingReceipt; activation: EmbeddingProvenanceReceipt }> {
  const costUsdMicros = 'providerAuthorityKind' in input
    ? providerOperationCostMicroUsd('corpus-embedding', { inputTokens: prepared.usage.inputTokens, outputTokens: 0 })
    : estimateEmbeddingCostMicroUsd(prepared.usage.inputTokens);
  const provenance = {
    schemaVersion: 1 as const, source: 'provider' as const, model: MODEL, dimensions: DIMENSIONS,
    ...releaseHashes(release), vectorSetChecksum: prepared.vectorSetChecksum, chunkCount: prepared.vectors.length,
    calls: prepared.usage.calls, inputTokens: prepared.usage.inputTokens, outputTokens: prepared.usage.outputTokens,
    costUsdMicros,
  };
  const rows = prepared.indexRows.map((row) => ({ ...row, source: 'provider' }));
  const indexChecksum = checksum({ rows, provenance });
  const hashes = releaseHashes(release);
  const durable = createProviderEmbeddingReceipt('providerAuthorityKind' in input ? {
    schemaVersion: 1, ...hashes, providerAuthorityKind: 'local-non-zdr',
    providerAuthorityHash: input.providerAuthorityHash, providerPolicyHash: input.providerPolicyHash,
    providerPricingReceiptHash: input.providerPricingReceiptHash, embeddingModel: MODEL, embeddingDimensions: DIMENSIONS,
    embeddingSource: 'provider', entries: prepared.vectors.map((entry) => ({ chunkChecksum: entry.chunkChecksum, vectorChecksum: entry.vectorChecksum })),
    inputTokens: prepared.usage.inputTokens, costMicroUsd: provenance.costUsdMicros,
    providerVectorSetChecksum: prepared.vectorSetChecksum, indexChecksum, createdAt: input.createdAt, completedAt: input.completedAt,
  } : {
    schemaVersion: 1, ...hashes, providerDataControlReceiptHash: input.providerDataControlReceiptHash,
    providerPricingReceiptHash: input.providerPricingReceiptHash, embeddingModel: MODEL, embeddingDimensions: DIMENSIONS,
    embeddingSource: 'provider', entries: prepared.vectors.map((entry) => ({ chunkChecksum: entry.chunkChecksum, vectorChecksum: entry.vectorChecksum })),
    inputTokens: prepared.usage.inputTokens, costMicroUsd: provenance.costUsdMicros,
    providerVectorSetChecksum: prepared.vectorSetChecksum, indexChecksum, createdAt: input.createdAt, completedAt: input.completedAt,
  });
  const activation = Object.freeze({ ...provenance, indexChecksum, bindingId: deterministicUuid(durable.embeddingReceiptHash), receiptHash: durable.embeddingReceiptHash });
  assertReceipt(release, prepared, activation);
  return Object.freeze({ durable, activation });
}

function vectorText(values: readonly number[]): string { return `[${values.join(',')}]`; }

async function assertExisting(client: PoolClient, receipt: EmbeddingProvenanceReceipt, prepared: PreparedEmbeddingSet): Promise<void> {
  const existing = await client.query<{
    content_release_id: string; answer_release_id: string; content_manifest_hash: string; answer_manifest_hash: string;
    answer_artifact_hash: string; embedding_model: string; embedding_dimensions: number; embedding_source: string;
    embedding_receipt_hash: string; chunk_count: number; index_checksum: string;
  }>('SELECT * FROM public_answer_release_bindings WHERE binding_id=$1', [receipt.bindingId]);
  if (existing.rowCount === 0) return;
  const row = existing.rows[0]!;
  const exact = row.content_release_id === receipt.contentReleaseId && row.answer_release_id === receipt.answerReleaseId
    && row.content_manifest_hash === receipt.contentManifestHash && row.answer_manifest_hash === receipt.answerManifestHash
    && row.answer_artifact_hash === receipt.answerArtifactHash && row.embedding_model === MODEL
    && row.embedding_dimensions === DIMENSIONS && row.embedding_source === receipt.source
    && row.embedding_receipt_hash === receipt.receiptHash && row.chunk_count === receipt.chunkCount
    && row.index_checksum === receipt.indexChecksum;
  const chunks = await client.query<{ chunk_id: string; chunk_checksum: string }>(
    'SELECT chunk_id,chunk_checksum FROM public_answer_chunks WHERE binding_id=$1 ORDER BY chunk_id', [receipt.bindingId]);
  const expected = [...prepared.vectors].sort((a, b) => codePointCompare(a.chunkId, b.chunkId));
  if (!exact || chunks.rows.length !== expected.length || chunks.rows.some((chunk, index) => (
    chunk.chunk_id !== expected[index]!.chunkId || chunk.chunk_checksum !== expected[index]!.chunkChecksum
  ))) throw new Error('existing binding has identity or provenance drift');
}

export class PostgresAnswerReleaseIndexer {
  constructor(private readonly nodeEnv: 'development' | 'test' | 'production') {}

  async activate(
    release: VerifiedActivePublicAnswerReleaseAuthority,
    prepared: PreparedEmbeddingSet,
    receipt: EmbeddingProvenanceReceipt,
    pool: Pool,
    signal: AbortSignal,
    providerAuthorization?: DurableProviderEmbeddingReceipt,
  ): Promise<Readonly<{ bindingId: string; answerReleaseId: string; state: 'active' }>> {
    if (signal.aborted) throw signal.reason ?? new Error('index activation aborted');
    if (receipt.source === 'provider') {
      if (!providerAuthorization) throw new Error('provider activation requires Task 4 strict-reopened authorization');
      if (this.nodeEnv === 'production' && isLocalProviderEmbeddingReceipt(providerAuthorization)) {
        throw new Error('production rejects local-non-zdr embedding receipts');
      }
      assertProviderAuthorization(prepared, receipt, providerAuthorization);
    }
    if (this.nodeEnv === 'production' && receipt.source !== 'provider') throw new Error('fixture provenance is forbidden in production');
    assertReceipt(release, prepared, receipt);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [GLOBAL_ACTIVATION_LOCK]);
      const candidateIds = prepared.indexRows.flatMap((row) => [
        { kind: 'record', id: row.recordId },
        ...release.evidence.filter((item) => item.chunkId === row.chunkId).map((item) => ({ kind: 'evidence', id: item.evidenceId })),
      ]);
      for (const candidate of candidateIds) {
        const forbidden = await client.query(`SELECT 1 FROM public_answer_tombstones t WHERE t.entity_kind=$1 AND t.entity_id=$2
          UNION ALL SELECT 1 FROM public_answer_deletion_receipts d WHERE d.entity_kind=$1 AND d.entity_id=$2 LIMIT 1`, [candidate.kind, candidate.id]);
        if (forbidden.rowCount) throw new Error('candidate release reintroduces a tombstoned or verified-deleted entity');
      }
      const exists = await client.query('SELECT state FROM public_answer_release_bindings WHERE binding_id=$1', [receipt.bindingId]);
      if (exists.rowCount) {
        await assertExisting(client, receipt, prepared);
        if (exists.rows[0]!.state !== 'active') throw new Error('identical binding exists but is not active');
        await client.query('COMMIT');
        return Object.freeze({ bindingId: receipt.bindingId, answerReleaseId: receipt.answerReleaseId, state: 'active' });
      }
      await client.query(`INSERT INTO public_answer_release_bindings
        (binding_id,content_release_id,answer_release_id,content_manifest_hash,answer_manifest_hash,answer_artifact_hash,
         embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'building',now())`, [
        receipt.bindingId, receipt.contentReleaseId, receipt.answerReleaseId, receipt.contentManifestHash,
        receipt.answerManifestHash, receipt.answerArtifactHash, MODEL, DIMENSIONS, receipt.source, receipt.receiptHash,
        receipt.chunkCount, receipt.indexChecksum,
      ]);
      const vectors = new Map(prepared.vectors.map((item) => [item.chunkId, item]));
      for (const input of prepared.indexRows) {
        if (signal.aborted) throw signal.reason ?? new Error('index activation aborted');
        const vector = vectors.get(input.chunkId)!;
        await client.query(`INSERT INTO public_answer_chunks
          (binding_id,answer_release_id,chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,
           search_text,embedding_model,embedding_dimensions,embedding)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector)`, [
          receipt.bindingId, receipt.answerReleaseId, input.chunkId, input.chunkChecksum, input.recordId,
          input.canonicalPath, input.title, input.headingPath, input.body, input.searchText, MODEL, DIMENSIONS,
          vectorText(vector.values),
        ]);
        await client.query(`INSERT INTO public_answer_embedding_cache
          (chunk_checksum,embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,embedding)
          VALUES ($1,$2,$3,$4,$5,$6::vector) ON CONFLICT DO NOTHING`, [
          input.chunkChecksum, MODEL, DIMENSIONS, receipt.source, receipt.receiptHash, vectorText(vector.values),
        ]);
      }
      const count = Number((await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public_answer_chunks WHERE binding_id=$1', [receipt.bindingId])).rows[0]!.count);
      if (count !== receipt.chunkCount) throw new Error('written binding row count mismatch');
      const written = await client.query<{
        chunk_id: string; chunk_checksum: string; record_id: string; canonical_path: string; title: string;
        heading_path: string[]; body: string; search_text: string; embedding_model: string;
        embedding_dimensions: number; embedding: string;
      }>(`SELECT chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,search_text,
                 embedding_model,embedding_dimensions,embedding::text
          FROM public_answer_chunks WHERE binding_id=$1 ORDER BY chunk_id`, [receipt.bindingId]);
      const writtenVectors = written.rows.map((row) => {
        const values = row.embedding.slice(1, -1).split(',').filter(Boolean).map(Number);
        if (values.length !== DIMENSIONS || values.some((value) => !Number.isFinite(value))) throw new Error('written vector failed strict reread');
        return { chunkId: row.chunk_id, chunkChecksum: row.chunk_checksum, values, vectorChecksum: vectorChecksum(values) };
      });
      const writtenPayload = written.rows.map((row, index) => {
        if (row.embedding_model !== MODEL || row.embedding_dimensions !== DIMENSIONS) {
          throw new Error('written embedding identity mismatch');
        }
        return {
          chunkId: row.chunk_id, chunkChecksum: row.chunk_checksum, recordId: row.record_id,
          canonicalPath: row.canonical_path, title: row.title, headingPath: row.heading_path,
          body: row.body, searchText: row.search_text, vectorChecksum: writtenVectors[index]!.vectorChecksum,
          model: row.embedding_model, dimensions: row.embedding_dimensions, source: receipt.source,
        };
      });
      if (checksum({ rows: writtenPayload, provenance: receiptProvenance(receipt) }) !== receipt.indexChecksum) {
        throw new Error(`written binding index checksum mismatch: ${writtenIndexMismatch(
          prepared.indexRows.map((row) => ({ ...row, source: receipt.source })),
          writtenPayload,
        )}; vectorDrift:${writtenVectorDrift(prepared.vectors, writtenVectors)}`);
      }
      await client.query("UPDATE public_answer_release_bindings SET state='ready' WHERE binding_id=$1 AND state='building'", [receipt.bindingId]);
      await client.query("UPDATE public_answer_release_bindings SET state='retired' WHERE state='active'");
      await client.query("UPDATE public_answer_release_bindings SET state='active',activated_at=now() WHERE binding_id=$1 AND state='ready'", [receipt.bindingId]);
      await client.query(`DELETE FROM public_answer_release_bindings WHERE binding_id IN (
        SELECT binding_id FROM public_answer_release_bindings WHERE state='retired' AND activated_at < now() - interval '7 days'
        AND binding_id <> COALESCE((SELECT binding_id FROM public_answer_release_bindings WHERE state='retired'
          ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid)
      )`);
      await client.query(`DELETE FROM public_answer_embedding_cache cache WHERE NOT EXISTS (
        SELECT 1 FROM public_answer_release_bindings binding
        WHERE binding.embedding_receipt_hash=cache.embedding_receipt_hash AND binding.state IN ('active','retired')
      )`);
      await client.query('COMMIT');
      return Object.freeze({ bindingId: receipt.bindingId, answerReleaseId: receipt.answerReleaseId, state: 'active' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
