import { createHash, randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import type { EmbeddingClient } from '../../application/ports/embedding-client.js';

const MODEL = 'text-embedding-3-large' as const;
const DIMENSIONS = 3072 as const;
const GLOBAL_ACTIVATION_LOCK = 'form-thought:public-answer:global-activation:v1';

export interface VerifiedActivePublicAnswerReleaseShape {
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly manifestHash: string;
  readonly artifactHash: string;
  readonly corpusApprovalHash: string;
  readonly manifest: { readonly identity: { readonly contentManifestHash: string } };
  readonly indexInputs: readonly {
    readonly chunkId: string; readonly chunkChecksum: string; readonly recordId: string;
    readonly canonicalPath: string; readonly title: string; readonly headingPath: readonly string[];
    readonly text: string; readonly searchText: string;
  }[];
}

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

function vectorChecksum(values: readonly number[]): string {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatBE(Math.fround(value), index * 4));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export interface PreparedEmbeddingVector {
  readonly chunkId: string;
  readonly chunkChecksum: string;
  readonly values: readonly number[];
  readonly vectorChecksum: string;
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

function indexPayload(release: VerifiedActivePublicAnswerReleaseShape, vectors: readonly PreparedEmbeddingVector[], source = 'unbound') {
  const byChunk = new Map(vectors.map((item) => [item.chunkId, item]));
  return release.indexInputs.map((input) => {
    const vector = byChunk.get(input.chunkId);
    if (!vector) throw new Error('prepared vector is missing for an approved chunk');
    return {
      chunkId: input.chunkId, chunkChecksum: input.chunkChecksum, recordId: input.recordId,
      canonicalPath: input.canonicalPath, title: input.title, headingPath: input.headingPath,
      body: input.text, searchText: input.searchText, vectorChecksum: vector.vectorChecksum,
      model: MODEL, dimensions: DIMENSIONS, source,
    };
  });
}

function releaseHashes(release: VerifiedActivePublicAnswerReleaseShape) {
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
  release: VerifiedActivePublicAnswerReleaseShape,
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
    const values = Object.freeze(raw.map(Math.fround));
    const input = release.indexInputs[index]!;
    return Object.freeze({
      chunkId: input.chunkId, chunkChecksum: input.chunkChecksum, values,
      vectorChecksum: vectorChecksum(values),
    });
  });
  const vectorSetChecksum = checksum(vectors.map(({ chunkId, chunkChecksum, vectorChecksum }) => ({ chunkId, chunkChecksum, vectorChecksum })));
  const result: PreparedEmbeddingSet = {
    ...releaseHashes(release), model: MODEL, dimensions: DIMENSIONS, vectors: Object.freeze(vectors), vectorSetChecksum,
    indexChecksum: checksum(indexPayload(release, vectors)),
    usage: Object.freeze({ ...response.usage, estimatedCostUsdMicros: 0 }),
  };
  if (cache && response.usage.inputTokens === 0 && release.indexInputs.length > 0) assertReceipt(release, result, cache.receipt);
  return Object.freeze(result);
}

async function embedBatches(
  release: VerifiedActivePublicAnswerReleaseShape,
  client: EmbeddingClient,
  signal: AbortSignal,
  batchSize: number,
): Promise<{ vectors: readonly (readonly number[])[]; usage: { calls: number; inputTokens: number; outputTokens: number } }> {
  const vectors: (readonly number[])[] = [];
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  for (let start = 0; start < release.indexInputs.length; start += batchSize) {
    if (signal.aborted) throw signal.reason ?? new Error('embedding preparation aborted');
    const response = await client.embed(release.indexInputs.slice(start, start + batchSize).map((item) => item.text), signal);
    vectors.push(...response.vectors); usage.calls += 1;
    usage.inputTokens += response.usage.inputTokens; usage.outputTokens += response.usage.outputTokens;
  }
  return { vectors, usage };
}

function deterministicUuid(hash: string): string {
  const hex = hash.replace(/^sha256:/u, '').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

export function createFixtureEmbeddingReceipt(prepared: PreparedEmbeddingSet): Readonly<EmbeddingProvenanceReceipt> {
  const base = {
    schemaVersion: 1 as const, source: 'fixture' as const, model: MODEL, dimensions: DIMENSIONS,
    contentReleaseId: prepared.contentReleaseId, answerReleaseId: prepared.answerReleaseId,
    contentManifestHash: prepared.contentManifestHash, answerManifestHash: prepared.answerManifestHash,
    answerArtifactHash: prepared.answerArtifactHash, corpusApprovalHash: prepared.corpusApprovalHash,
    vectorSetChecksum: prepared.vectorSetChecksum,
    indexChecksum: checksum({ prepared: prepared.indexChecksum, source: 'fixture' }),
    chunkCount: prepared.vectors.length, calls: prepared.usage.calls,
    inputTokens: prepared.usage.inputTokens, outputTokens: prepared.usage.outputTokens, costUsdMicros: 0,
  };
  const bindingId = deterministicUuid(checksum(base));
  const receiptHash = checksum({ ...base, bindingId });
  return Object.freeze({ ...base, bindingId, receiptHash });
}

function assertReceipt(release: VerifiedActivePublicAnswerReleaseShape, prepared: PreparedEmbeddingSet, receipt: EmbeddingProvenanceReceipt): void {
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
  const expectedIndex = checksum({ prepared: prepared.indexChecksum, source: receipt.source });
  if (receipt.indexChecksum !== expectedIndex) throw new Error('embedding provenance index checksum mismatch');
  const { receiptHash, ...receiptBody } = receipt;
  if (receiptHash !== checksum(receiptBody)) throw new Error('embedding provenance receipt hash mismatch');
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
    release: VerifiedActivePublicAnswerReleaseShape,
    prepared: PreparedEmbeddingSet,
    receipt: EmbeddingProvenanceReceipt,
    pool: Pool,
    signal: AbortSignal,
  ): Promise<Readonly<{ bindingId: string; answerReleaseId: string; state: 'active' }>> {
    if (signal.aborted) throw signal.reason ?? new Error('index activation aborted');
    if (this.nodeEnv === 'production' && receipt.source === 'fixture') throw new Error('fixture provenance is forbidden in production');
    assertReceipt(release, prepared, receipt);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('form-thought:public-answer:global-activation:v1', 0))");
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
      for (const input of release.indexInputs) {
        if (signal.aborted) throw signal.reason ?? new Error('index activation aborted');
        const vector = vectors.get(input.chunkId)!;
        await client.query(`INSERT INTO public_answer_chunks
          (binding_id,answer_release_id,chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,
           search_text,embedding_model,embedding_dimensions,embedding)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector)`, [
          receipt.bindingId, receipt.answerReleaseId, input.chunkId, input.chunkChecksum, input.recordId,
          input.canonicalPath, input.title, input.headingPath, input.text, input.searchText, MODEL, DIMENSIONS,
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
      const writtenPayload = written.rows.map((row, index) => ({
        chunkId: row.chunk_id, chunkChecksum: row.chunk_checksum, recordId: row.record_id,
        canonicalPath: row.canonical_path, title: row.title, headingPath: row.heading_path,
        body: row.body, searchText: row.search_text, vectorChecksum: writtenVectors[index]!.vectorChecksum,
        model: row.embedding_model, dimensions: row.embedding_dimensions, source: 'unbound',
      }));
      if (checksum(writtenPayload) !== prepared.indexChecksum) {
        throw new Error('written binding index checksum mismatch');
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

export function createProviderEmbeddingReceipt(
  prepared: PreparedEmbeddingSet,
  measured: Readonly<{ calls: number; inputTokens: number; outputTokens: number; costUsdMicros: number }>,
): Readonly<EmbeddingProvenanceReceipt> {
  if (!Number.isInteger(measured.calls) || !Number.isInteger(measured.inputTokens) || !Number.isInteger(measured.outputTokens)
    || !Number.isInteger(measured.costUsdMicros)
    || measured.calls < 0 || measured.inputTokens < 0 || measured.outputTokens < 0 || measured.costUsdMicros < 0) {
    throw new Error('provider usage and cost must be non-negative integers');
  }
  if (prepared.vectors.length === 0 && (measured.calls !== 0 || measured.inputTokens !== 0 || measured.outputTokens !== 0 || measured.costUsdMicros !== 0)) {
    throw new Error('empty provider receipt must record zero calls, tokens, and cost');
  }
  const base = {
    schemaVersion: 1 as const, source: 'provider' as const, model: MODEL, dimensions: DIMENSIONS,
    contentReleaseId: prepared.contentReleaseId, answerReleaseId: prepared.answerReleaseId,
    contentManifestHash: prepared.contentManifestHash, answerManifestHash: prepared.answerManifestHash,
    answerArtifactHash: prepared.answerArtifactHash, corpusApprovalHash: prepared.corpusApprovalHash,
    vectorSetChecksum: prepared.vectorSetChecksum, indexChecksum: checksum({ prepared: prepared.indexChecksum, source: 'provider' }),
    chunkCount: prepared.vectors.length, ...measured,
  };
  const bindingId = randomUUID();
  const receiptHash = checksum({ ...base, bindingId });
  return Object.freeze({ ...base, bindingId, receiptHash });
}
