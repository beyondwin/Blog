import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { DeterministicEmbeddingClient } from '../../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import {
  createFixtureEmbeddingReceipt,
  createProviderEmbeddingReceipt,
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
      manifest: { identity: { contentManifestHash: `sha256:${'a'.repeat(64)}` } },
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

  it('atomically activates, idempotently reuses, and separates fixture/provider provenance', async () => {
    const value = release('1');
    const fixture = await fixtureActivation(value);
    const repeated = await new PostgresAnswerReleaseIndexer('test').activate(
      value, fixture.prepared, fixture.receipt, pool, new AbortController().signal,
    );
    expect(repeated.bindingId).toBe(fixture.result.bindingId);
    expect((await pool.query('SELECT count(*)::int AS count FROM public_answer_chunks')).rows[0].count).toBe(1);

    const alternateClient = {
      model: 'text-embedding-3-large' as const, dimensions: 3072 as const,
      async embed(texts: readonly string[]) {
        const unit = Math.fround(1 / Math.sqrt(3072));
        return { vectors: texts.map(() => Array.from({ length: 3072 }, () => unit)), usage: { inputTokens: 2, outputTokens: 0 } };
      },
    };
    const providerPrepared = await prepareEmbeddingSet(value, alternateClient, new AbortController().signal);
    const providerReceipt = createProviderEmbeddingReceipt(providerPrepared, { calls: 1, inputTokens: 2, outputTokens: 0, costUsdMicros: 7 });
    await new PostgresAnswerReleaseIndexer('test').activate(
      value, providerPrepared, providerReceipt, pool, new AbortController().signal,
    );
    const bindings = (await pool.query<{ binding_id: string; state: string; embedding_source: string; embedding_receipt_hash: string }>(
      'SELECT binding_id,state,embedding_source,embedding_receipt_hash FROM public_answer_release_bindings ORDER BY embedding_source')).rows;
    expect(bindings).toEqual([
      expect.objectContaining({ binding_id: fixture.receipt.bindingId, state: 'retired', embedding_source: 'fixture', embedding_receipt_hash: fixture.receipt.receiptHash }),
      expect.objectContaining({ binding_id: providerReceipt.bindingId, state: 'active', embedding_source: 'provider', embedding_receipt_hash: providerReceipt.receiptHash }),
    ]);
    expect(providerPrepared.vectorSetChecksum).not.toBe(fixture.prepared.vectorSetChecksum);
    const cacheSources = (await pool.query<{ embedding_source: string }>(
      'SELECT embedding_source FROM public_answer_embedding_cache ORDER BY embedding_source')).rows.map((row) => row.embedding_source);
    expect(cacheSources).toEqual(['fixture', 'provider']);
    await expect(new PostgresAnswerReleaseIndexer('production').activate(
      value, fixture.prepared, fixture.receipt, pool, new AbortController().signal,
    )).rejects.toThrow(/fixture provenance/u);
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
    const source = new VerifiedAnswerReleaseCatalogSource(config, pool, readers);
    await source.verifyDirectory('/answer/release');
    const snapshot = await source.snapshot(new AbortController().signal);
    expect(snapshot.bindingId).toBe(active.receipt.bindingId);
    expect(snapshot.evidenceFor(['9'.repeat(64)])).toEqual([]);
    expect(snapshot.chunkById.size).toBe(1);
    expect(() => (snapshot.chunkById as Map<string, unknown>).set('forged', {})).toThrow(/immutable/u);
    expect(() => (snapshot.tombstones as Set<string>).add('record:forged')).toThrow(/immutable/u);
  });
});
