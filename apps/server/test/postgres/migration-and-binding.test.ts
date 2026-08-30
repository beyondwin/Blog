import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { DeterministicEmbeddingClient } from '../../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import {
  createFixtureEmbeddingReceipt,
  PostgresAnswerReleaseIndexer,
  prepareEmbeddingSet,
} from '../../src/modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';
import { VerifiedAnswerReleaseCatalogSource } from '../../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
let pool: Pool;

beforeEach(async () => {
  pool = new Pool({ connectionString: databaseUrl, max: 4 });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runPostgresMigrations(pool);
});

afterEach(async () => {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.end();
});

describe('public answer Postgres migration', () => {
  it('installs extensions, exact tables, vector width, and one-active binding guard', async () => {
    const extensions = (await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm') ORDER BY extname",
    )).rows.map((row) => row.extname);
    expect(extensions).toEqual(['pg_trgm', 'vector']);
    const tables = (await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'public_answer_%' ORDER BY table_name",
    )).rows.map((row) => row.table_name);
    expect(tables).toEqual([
      'public_answer_chunks', 'public_answer_deletion_receipts', 'public_answer_embedding_cache',
      'public_answer_release_bindings', 'public_answer_tombstones',
    ]);
    const columnRows = (await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name LIKE 'public_answer_%' ORDER BY table_name,ordinal_position`,
    )).rows;
    const columns = Object.groupBy(columnRows, (row) => row.table_name);
    expect(columns.public_answer_release_bindings?.map((row) => row.column_name)).toEqual([
      'binding_id', 'content_release_id', 'answer_release_id', 'content_manifest_hash', 'answer_manifest_hash',
      'answer_artifact_hash', 'embedding_model', 'embedding_dimensions', 'embedding_source', 'embedding_receipt_hash',
      'chunk_count', 'index_checksum', 'state', 'created_at', 'activated_at',
    ]);
    expect(columns.public_answer_chunks?.map((row) => row.column_name)).toEqual([
      'binding_id', 'answer_release_id', 'chunk_id', 'chunk_checksum', 'record_id', 'canonical_path', 'title',
      'heading_path', 'body', 'search_text', 'search_vector', 'embedding_model', 'embedding_dimensions', 'embedding',
    ]);
    expect(columns.public_answer_embedding_cache?.map((row) => row.column_name)).toEqual([
      'chunk_checksum', 'embedding_model', 'embedding_dimensions', 'embedding_source', 'embedding_receipt_hash', 'embedding',
    ]);
    expect(columns.public_answer_tombstones?.map((row) => row.column_name)).toEqual([
      'entity_kind', 'entity_id', 'reason_code', 'created_at',
    ]);
    expect(columns.public_answer_deletion_receipts?.map((row) => row.column_name)).toEqual([
      'deletion_receipt_hash', 'entity_kind', 'entity_id', 'tombstone_hash', 'affected_answer_release_id',
      'affected_answer_artifact_hash', 'replacement_answer_release_id', 'replacement_binding_id',
      'active_index_absent_at', 'artifact_purge_evidence_checksum', 'backup_evidence_checksum',
      'backup_expires_at', 'verified_at',
    ]);
    const indexRows = (await pool.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'public_answer_%' ORDER BY indexname",
    )).rows;
    const indexes = indexRows.map((row) => row.indexname);
    expect(indexes).toEqual([
      'public_answer_chunks_exact_vector_scan', 'public_answer_chunks_pkey', 'public_answer_chunks_search_trigram',
      'public_answer_chunks_search_vector', 'public_answer_deletion_receip_entity_kind_entity_id_tombsto_key',
      'public_answer_deletion_receipts_pkey', 'public_answer_embedding_cache_pkey', 'public_answer_one_active_binding',
      'public_answer_release_bindings_pkey', 'public_answer_tombstones_pkey',
    ]);
    const normalizedIndexDefinitions = Object.fromEntries(indexRows.map((row) => [
      row.indexname, row.indexdef.replace(/\s+/gu, ' ').trim(),
    ]));
    expect(normalizedIndexDefinitions.public_answer_one_active_binding).toBe(
      "CREATE UNIQUE INDEX public_answer_one_active_binding ON public.public_answer_release_bindings USING btree (state) WHERE (state = 'active'::text)",
    );
    expect(normalizedIndexDefinitions.public_answer_chunks_search_vector).toBe(
      'CREATE INDEX public_answer_chunks_search_vector ON public.public_answer_chunks USING gin (search_vector)',
    );
    expect(normalizedIndexDefinitions.public_answer_chunks_search_trigram).toBe(
      'CREATE INDEX public_answer_chunks_search_trigram ON public.public_answer_chunks USING gin (search_text gin_trgm_ops)',
    );
    expect(normalizedIndexDefinitions.public_answer_chunks_exact_vector_scan).toBe(
      'CREATE INDEX public_answer_chunks_exact_vector_scan ON public.public_answer_chunks USING btree (binding_id, chunk_id)',
    );
    const constraints = (await pool.query<{ definition: string }>(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname`)).rows.map((row) => row.definition).join('\n');
    expect(constraints).toContain("CHECK ((embedding_model = 'text-embedding-3-large'::text))");
    expect(constraints).toContain('CHECK ((embedding_dimensions = 3072))');
    expect(constraints).toContain("CHECK ((state = ANY (ARRAY['building'::text, 'ready'::text, 'active'::text, 'retired'::text])))");
    expect(constraints).toContain("CHECK ((entity_kind = ANY (ARRAY['record'::text, 'evidence'::text])))");
    const migration = await readFile(resolve('apps/server/src/modules/public-answer/infrastructure/postgres/migrations/001_public_answer.sql'), 'utf8');
    expect(migration).not.toMatch(/hnsw|ivfflat/iu);
    expect(migration).toContain('vector(3072)');
    expect(migration).toContain("WHERE state = 'active'");
  });

  it('rolls back an injected failure without leaking rows', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO public_answer_release_bindings
        (binding_id,content_release_id,answer_release_id,content_manifest_hash,answer_manifest_hash,answer_artifact_hash,
         embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state,created_at)
        VALUES ('11111111-1111-4111-8111-111111111111',$1,$2,$3,$4,$5,'text-embedding-3-large',3072,'fixture',$6,0,$7,'building',now())`,
      ['a'.repeat(64), 'b'.repeat(64), `sha256:${'1'.repeat(64)}`, `sha256:${'2'.repeat(64)}`,
        `sha256:${'3'.repeat(64)}`, `sha256:${'4'.repeat(64)}`, `sha256:${'5'.repeat(64)}`]);
      throw new Error('injected');
    } catch {
      await client.query('ROLLBACK');
    } finally { client.release(); }
    expect((await pool.query('SELECT * FROM public_answer_release_bindings')).rowCount).toBe(0);
  });

  function release(seed: string, duplicate = false): any {
    const chunk = {
      chunkId: seed.repeat(64).slice(0, 64), chunkChecksum: `sha256:${seed.repeat(64).slice(0, 64)}`,
      recordId: 'articles/example', collection: 'articles', canonicalPath: '/articles/example/', title: 'Example',
      headingPath: ['Heading'], text: `public text ${seed}`, searchText: `public text ${seed}`,
    };
    const answerReleaseId = seed.repeat(64).slice(0, 64);
    return {
      contentReleaseId: 'c'.repeat(64), answerReleaseId,
      manifestHash: `sha256:${'d'.repeat(64)}`, artifactHash: `sha256:${'e'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'f'.repeat(64)}`,
      manifest: { identity: { contentManifestHash: `sha256:${'a'.repeat(64)}`, normalizerVersion: 'nfkc-lower-hangul-ngram-v1' } },
      indexInputs: duplicate ? [chunk, { ...chunk, text: `${chunk.text} duplicate` }] : [chunk],
      chunks: [{ chunkId: chunk.chunkId, recordId: chunk.recordId, canonicalPath: chunk.canonicalPath }],
      evidence: [{
        evidenceId: '9'.repeat(64), chunkId: chunk.chunkId, recordId: chunk.recordId, collectionLabel: '기록',
        recordTitle: chunk.title, canonicalPath: chunk.canonicalPath,
        locator: { kind: 'heading-paragraph', label: 'Heading', ordinal: 1 }, excerpt: chunk.text,
        excerptChecksum: `sha256:${'8'.repeat(64)}`,
      }],
    };
  }

  async function fixtureActivation(value: any) {
    const prepared = await prepareEmbeddingSet(value, new DeterministicEmbeddingClient('test'), new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(prepared);
    const result = await new PostgresAnswerReleaseIndexer('test').activate(value, prepared, receipt, pool, new AbortController().signal);
    return { prepared, receipt, result };
  }

  it('keeps the receipt and written payload detached from mutable verifier inputs and freezes prepared rows', async () => {
    const value = release('c');
    const prepared = await prepareEmbeddingSet(value, new DeterministicEmbeddingClient('test'), new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(prepared);
    expect(() => ((prepared.indexRows[0] as { title: string }).title = 'forged')).toThrow(TypeError);
    expect(() => ((prepared.indexRows[0]!.headingPath as string[])[0] = 'forged')).toThrow(TypeError);
    value.indexInputs[0].title = 'mutated original';
    value.indexInputs[0].headingPath[0] = 'mutated original';
    expect(createFixtureEmbeddingReceipt(prepared)).toEqual(receipt);
    await new PostgresAnswerReleaseIndexer('test').activate(
      value, prepared, receipt, pool, new AbortController().signal,
    );
    expect((await pool.query<{ title: string; heading_path: string[] }>(
      'SELECT title,heading_path FROM public_answer_chunks WHERE binding_id=$1', [receipt.bindingId],
    )).rows).toEqual([{ title: 'Example', heading_path: ['Heading'] }]);
  });

  it('atomically activates, idempotently reuses, and keeps test-only provider evidence byte-distinct and rollback-selectable', async () => {
    const value = release('1');
    const fixture = await fixtureActivation(value);
    const repeated = await new PostgresAnswerReleaseIndexer('test').activate(
      value, fixture.prepared, fixture.receipt, pool, new AbortController().signal,
    );
    expect(repeated.bindingId).toBe(fixture.result.bindingId);
    expect((await pool.query('SELECT count(*)::int AS count FROM public_answer_chunks')).rows[0].count).toBe(1);

    await expect(new PostgresAnswerReleaseIndexer('test').activate(
      value, fixture.prepared, { ...fixture.receipt, source: 'provider' } as any, pool, new AbortController().signal,
    )).rejects.toThrow(/Task 4 strict-reopened/u);
    const fixtureBytes = (await pool.query<{ embedding: string; chunk_checksum: string }>(
      'SELECT embedding::text,chunk_checksum FROM public_answer_chunks WHERE binding_id=$1', [fixture.receipt.bindingId])).rows[0]!;
    const providerBindingId = '22222222-2222-4222-8222-222222222222';
    const providerReceiptHash = `sha256:${'7'.repeat(64)}`;
    const providerIndexChecksum = `sha256:${'8'.repeat(64)}`;
    await pool.query('BEGIN');
    await pool.query(`INSERT INTO public_answer_release_bindings
      (binding_id,content_release_id,answer_release_id,content_manifest_hash,answer_manifest_hash,answer_artifact_hash,
       embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state,created_at,activated_at)
      SELECT $1,content_release_id,answer_release_id,content_manifest_hash,answer_manifest_hash,answer_artifact_hash,
       embedding_model,embedding_dimensions,'provider',$2,chunk_count,$3,'ready',now(),now()
      FROM public_answer_release_bindings WHERE binding_id=$4`,
    [providerBindingId, providerReceiptHash, providerIndexChecksum, fixture.receipt.bindingId]);
    await pool.query(`INSERT INTO public_answer_chunks
      (binding_id,answer_release_id,chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,
       search_text,embedding_model,embedding_dimensions,embedding)
      SELECT $1,answer_release_id,chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,
       search_text,embedding_model,embedding_dimensions,embedding
      FROM public_answer_chunks WHERE binding_id=$2`, [providerBindingId, fixture.receipt.bindingId]);
    await pool.query(`INSERT INTO public_answer_embedding_cache
      (chunk_checksum,embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,embedding)
      SELECT chunk_checksum,embedding_model,embedding_dimensions,'provider',$1,embedding
      FROM public_answer_chunks WHERE binding_id=$2`, [providerReceiptHash, fixture.receipt.bindingId]);
    await pool.query("UPDATE public_answer_release_bindings SET state='retired' WHERE binding_id=$1", [fixture.receipt.bindingId]);
    await pool.query("UPDATE public_answer_release_bindings SET state='active' WHERE binding_id=$1", [providerBindingId]);
    await pool.query('COMMIT');
    const bindings = (await pool.query<{ binding_id: string; state: string; embedding_source: string; embedding_receipt_hash: string }>(
      'SELECT binding_id,state,embedding_source,embedding_receipt_hash FROM public_answer_release_bindings ORDER BY embedding_source')).rows;
    expect(bindings).toEqual([
      expect.objectContaining({ binding_id: fixture.receipt.bindingId, state: 'retired', embedding_source: 'fixture', embedding_receipt_hash: fixture.receipt.receiptHash }),
      expect.objectContaining({ binding_id: providerBindingId, state: 'active', embedding_source: 'provider', embedding_receipt_hash: providerReceiptHash }),
    ]);
    const providerBytes = (await pool.query<{ embedding: string; chunk_checksum: string }>(
      'SELECT embedding::text,chunk_checksum FROM public_answer_chunks WHERE binding_id=$1', [providerBindingId])).rows[0]!;
    expect(providerBytes).toEqual(fixtureBytes);
    expect(providerIndexChecksum).not.toBe(fixture.receipt.indexChecksum);
    const cacheSources = (await pool.query<{ embedding_source: string }>(
      'SELECT embedding_source FROM public_answer_embedding_cache ORDER BY embedding_source')).rows.map((row) => row.embedding_source);
    expect(cacheSources).toEqual(['fixture', 'provider']);
    await pool.query('BEGIN');
    await pool.query("UPDATE public_answer_release_bindings SET state='retired' WHERE binding_id=$1", [providerBindingId]);
    await pool.query("UPDATE public_answer_release_bindings SET state='active' WHERE binding_id=$1", [fixture.receipt.bindingId]);
    await pool.query('COMMIT');
    expect((await pool.query<{ embedding: string; chunk_checksum: string }>(
      'SELECT embedding::text,chunk_checksum FROM public_answer_chunks WHERE binding_id=$1', [fixture.receipt.bindingId])).rows[0]).toEqual(fixtureBytes);
    await expect(new PostgresAnswerReleaseIndexer('production').activate(
      value, fixture.prepared, fixture.receipt, pool, new AbortController().signal,
    )).rejects.toThrow(/fixture provenance/u);
  });

  it('rejects same-ID database drift and same-vector substituted receipt provenance', async () => {
    const value = release('b');
    const active = await fixtureActivation(value);
    await expect(new PostgresAnswerReleaseIndexer('test').activate(
      value, active.prepared, { ...active.receipt, inputTokens: active.receipt.inputTokens + 1 } as any,
      pool, new AbortController().signal,
    )).rejects.toThrow(/checksum|hash/u);
    await pool.query('UPDATE public_answer_release_bindings SET answer_manifest_hash=$1 WHERE binding_id=$2', [
      `sha256:${'0'.repeat(64)}`, active.receipt.bindingId,
    ]);
    await expect(new PostgresAnswerReleaseIndexer('test').activate(
      value, active.prepared, active.receipt, pool, new AbortController().signal,
    )).rejects.toThrow(/identity or provenance drift/u);
  });

  it('rolls back a failed second release without mutating the active binding', async () => {
    const first = await fixtureActivation(release('2'));
    const before = await pool.query('SELECT * FROM public_answer_release_bindings WHERE binding_id=$1', [first.receipt.bindingId]);
    const invalid = release('3', true);
    const prepared = await prepareEmbeddingSet(invalid, new DeterministicEmbeddingClient('test'), new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(prepared);
    await expect(new PostgresAnswerReleaseIndexer('test').activate(
      invalid, prepared, receipt, pool, new AbortController().signal,
    )).rejects.toThrow(/duplicate key/u);
    const after = await pool.query('SELECT * FROM public_answer_release_bindings WHERE binding_id=$1', [first.receipt.bindingId]);
    expect(after.rows).toEqual(before.rows);
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_release_bindings WHERE state='active'"))).toMatchObject({ rows: [{ count: 1 }] });
  });

  it('serializes concurrent release activations and retains exactly one rollback candidate', async () => {
    const values = [release('4'), release('5')];
    const prepared = await Promise.all(values.map((value) => prepareEmbeddingSet(
      value, new DeterministicEmbeddingClient('test'), new AbortController().signal,
    )));
    const receipts = prepared.map(createFixtureEmbeddingReceipt);
    await Promise.all(values.map((value, index) => new PostgresAnswerReleaseIndexer('test').activate(
      value, prepared[index]!, receipts[index]!, pool, new AbortController().signal,
    )));
    expect((await pool.query("SELECT state,count(*)::int AS count FROM public_answer_release_bindings GROUP BY state ORDER BY state"))).toMatchObject({
      rows: [{ state: 'active', count: 1 }, { state: 'retired', count: 1 }],
    });
  });

  it('deletes only expired retired history while preserving the active and newest rollback binding', async () => {
    const first = await fixtureActivation(release('6'));
    const second = await fixtureActivation(release('7'));
    await pool.query("UPDATE public_answer_release_bindings SET activated_at=now()-interval '8 days' WHERE binding_id=$1", [first.receipt.bindingId]);
    const third = await fixtureActivation(release('8'));
    const ids = (await pool.query<{ binding_id: string }>('SELECT binding_id FROM public_answer_release_bindings ORDER BY binding_id')).rows.map((row) => row.binding_id);
    expect(ids).not.toContain(first.receipt.bindingId);
    expect(ids).toContain(second.receipt.bindingId);
    expect(ids).toContain(third.receipt.bindingId);
  });

  it('binds one repeatable-read catalog snapshot and excludes tombstoned evidence', async () => {
    const value = release('a');
    const active = await fixtureActivation(value);
    await pool.query("INSERT INTO public_answer_tombstones(entity_kind,entity_id,reason_code,created_at) VALUES ('evidence',$1,'legal',now())", ['9'.repeat(64)]);
    const config = {
      corpusApprovalPath: '/approval.json', contentReleaseRoot: '/content', answerReleaseRoot: '/answer',
    } as any;
    const approval = { schemaVersion: 1 as const, entries: [] };
    const content = { manifest: { records: { 'articles/example': { href: '/articles/example/' } } } };
    const readers = {
      async readApproval() { return approval; }, async readContent() { return content; },
      async readAnswer(_root: string, suppliedContent: unknown, suppliedApproval: unknown) {
        expect(suppliedContent).toBe(content); expect(suppliedApproval).toBe(approval); return value;
      },
      async verifyAnswer(_path: string, suppliedContent: unknown, suppliedApproval: unknown) {
        expect(suppliedContent).toBe(content); expect(suppliedApproval).toBe(approval); return value;
      },
    };
    const source = new VerifiedAnswerReleaseCatalogSource(config, pool, readers as any);
    await source.verifyDirectory('/answer/release');
    const snapshot = await source.snapshot(new AbortController().signal);
    expect(snapshot.bindingId).toBe(active.receipt.bindingId);
    expect(snapshot.evidenceFor(['9'.repeat(64)])).toEqual([]);
    expect(snapshot.chunkById.size).toBe(1);
    expect(() => (snapshot.chunkById as Map<string, unknown>).set('forged', {})).toThrow(/immutable/u);
    expect(() => (snapshot.tombstones as Set<string>).add('record:forged')).toThrow(/immutable/u);
  });
});
