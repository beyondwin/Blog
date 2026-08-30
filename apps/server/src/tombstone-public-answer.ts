import { lstat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';

import { parseServerConfig, type ServerConfig } from './config/server-config.js';
import type { Retriever } from './modules/public-answer/application/ports/retriever.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import { OpenAIEmbeddingClient } from './modules/public-answer/infrastructure/openai/openai-embedding-client.js';
import { providerChecksum } from './modules/public-answer/infrastructure/openai/provider-json.js';
import { CancellablePgQueryRunner } from './modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { PostgresHybridRetriever } from './modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';
import { runPostgresMigrations } from './modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { createPostgresPool } from './modules/public-answer/infrastructure/postgres/postgres-pool.js';
import { readDeletionEvidenceBundle } from './modules/public-answer/infrastructure/release/deletion-evidence-receipt.js';
import { readVerifiedAnswerReleaseAuthority, VerifiedAnswerReleaseCatalogSource } from './modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';

const GLOBAL_ACTIVATION_LOCK = 'form-thought:public-answer:global-activation:v1';
export type TombstoneKind = 'record' | 'evidence';
function tombstoneHash(kind: TombstoneKind, id: string, reasonCode: string, createdAt: string): string {
  return providerChecksum({ schemaVersion: 1, entityKind: kind, entityId: id, reasonCode, createdAt });
}

export async function addPublicAnswerTombstone(input: Readonly<{
  pool: Pool; catalog: Pick<VerifiedAnswerReleaseCatalogSource, 'snapshot'>; retriever: Retriever;
  entityKind: TombstoneKind; entityId: string; reasonCode: string; signal: AbortSignal;
}>): Promise<Readonly<{ tombstoneHash: string; createdAt: string }>> {
  if (!/^[A-Za-z0-9][A-Za-z0-9/._:-]{0,255}$/u.test(input.entityId) || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(input.reasonCode)) throw new Error('tombstone identity or reason is invalid');
  const before = await input.catalog.snapshot(input.signal);
  const exists = input.entityKind === 'record' ? [...before.chunkById.values()].some((item) => item.recordId === input.entityId) : before.evidenceById.has(input.entityId);
  if (!exists) throw new Error('tombstone entity is not catalog-valid');
  await input.pool.query(`INSERT INTO public_answer_tombstones(entity_kind,entity_id,reason_code,created_at)
    VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT(entity_kind,entity_id) DO NOTHING`, [input.entityKind, input.entityId, input.reasonCode]);
  const row = (await input.pool.query<{ reason_code: string; created_at: string }>(`SELECT reason_code,
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
    FROM public_answer_tombstones WHERE entity_kind=$1 AND entity_id=$2`, [input.entityKind, input.entityId])).rows[0];
  if (!row || row.reason_code !== input.reasonCode) throw new Error('existing tombstone has different authority');
  const after = await input.catalog.snapshot(input.signal);
  const result = await input.retriever.retrieve({ question: input.entityId, catalog: after, limit: 6, signal: input.signal });
  if (result.evidence.some((item) => item.recordId === input.entityId || item.evidenceId === input.entityId)) throw new Error('production retriever did not exclude tombstoned entity');
  return Object.freeze({ tombstoneHash: tombstoneHash(input.entityKind, input.entityId, row.reason_code, row.created_at), createdAt: row.created_at });
}

export async function verifyPublicAnswerPurge(input: Readonly<{
  pool: Pool; catalog: Pick<VerifiedAnswerReleaseCatalogSource, 'snapshot'>; config: ServerConfig; receiptPath: string; signal: AbortSignal;
  authorityReader?: typeof readVerifiedAnswerReleaseAuthority;
}>): Promise<Readonly<{ deletionReceiptHash: string; activeIndexAbsentAt: string }>> {
  if (!input.config.deletionReceiptRoot || !isAbsolute(input.receiptPath) || resolve(dirname(input.receiptPath)) !== resolve(input.config.deletionReceiptRoot)) throw new Error('deletion receipt must be directly contained by configured root');
  const bundle = await readDeletionEvidenceBundle(input.config.deletionReceiptRoot!, basename(input.receiptPath));
  const affectedPath = resolve(input.config.answerReleaseRoot, bundle.receipt.affectedContentReleaseId, bundle.receipt.affectedAnswerReleaseId);
  try { await lstat(affectedPath); throw new Error('affected answer release bytes remain'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const authority = await (input.authorityReader ?? readVerifiedAnswerReleaseAuthority)(input.config);
  if (authority.answer.contentReleaseId !== bundle.receipt.replacementContentReleaseId
    || authority.answer.answerReleaseId !== bundle.receipt.replacementAnswerReleaseId
    || authority.answer.manifestHash !== bundle.receipt.replacementAnswerManifestHash
    || authority.answer.artifactHash !== bundle.receipt.replacementAnswerArtifactHash) throw new Error('replacement filesystem authority mismatch');
  const snapshot = await input.catalog.snapshot(input.signal);
  if (snapshot.bindingId !== bundle.receipt.replacementBindingId || snapshot.answerReleaseId !== bundle.receipt.replacementAnswerReleaseId
    || [...snapshot.chunkById.values()].some((item) => item.recordId === bundle.receipt.entityId)
    || snapshot.evidenceById.has(bundle.receipt.entityId)) throw new Error('replacement active surfaces retain deleted entity');
  const client = await input.pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [GLOBAL_ACTIVATION_LOCK]);
    const tombstone = (await client.query<{ reason_code: string; created_at: string }>(`SELECT reason_code,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
      FROM public_answer_tombstones WHERE entity_kind=$1 AND entity_id=$2`, [bundle.receipt.entityKind, bundle.receipt.entityId])).rows[0];
    if (!tombstone || tombstoneHash(bundle.receipt.entityKind, bundle.receipt.entityId, tombstone.reason_code, tombstone.created_at) !== bundle.receipt.tombstoneHash) throw new Error('stored tombstone hash mismatch');
    const active = await client.query(`SELECT 1 FROM public_answer_release_bindings WHERE state='active' AND binding_id=$1 AND answer_release_id=$2`, [bundle.receipt.replacementBindingId, bundle.receipt.replacementAnswerReleaseId]);
    const retained = await client.query(`SELECT 1 FROM public_answer_chunks WHERE binding_id=$1 AND record_id=$2 LIMIT 1`, [bundle.receipt.replacementBindingId, bundle.receipt.entityId]);
    if (active.rowCount !== 1 || retained.rowCount) throw new Error('final locked active-index absence check failed');
    const prior = await client.query<{ deletion_receipt_hash: string; artifact_purge_evidence_checksum: string; backup_evidence_checksum: string; active_index_absent_at: string }>(`SELECT deletion_receipt_hash,artifact_purge_evidence_checksum,backup_evidence_checksum,
      to_char(active_index_absent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS active_index_absent_at
      FROM public_answer_deletion_receipts WHERE entity_kind=$1 AND entity_id=$2 AND tombstone_hash=$3 AND replacement_answer_release_id=$4`,
    [bundle.receipt.entityKind,bundle.receipt.entityId,bundle.receipt.tombstoneHash,bundle.receipt.replacementAnswerReleaseId]);
    if (prior.rowCount) {
      const row = prior.rows[0]!;
      if (row.deletion_receipt_hash !== bundle.deletionReceiptHash || row.artifact_purge_evidence_checksum !== bundle.receipt.artifactPurgeEvidenceChecksum
        || row.backup_evidence_checksum !== bundle.receipt.backupEvidenceChecksum) throw new Error('idempotent purge verification requires the exact original evidence bundle');
      await client.query('COMMIT'); return Object.freeze({ deletionReceiptHash: row.deletion_receipt_hash, activeIndexAbsentAt: row.active_index_absent_at });
    }
    const inserted = await client.query<{ active_index_absent_at: string }>(`INSERT INTO public_answer_deletion_receipts
      (deletion_receipt_hash,entity_kind,entity_id,tombstone_hash,affected_answer_release_id,affected_answer_artifact_hash,
       replacement_answer_release_id,replacement_binding_id,active_index_absent_at,artifact_purge_evidence_checksum,
       backup_evidence_checksum,backup_expires_at,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9,$10,$11,$12)
      RETURNING to_char(active_index_absent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS active_index_absent_at`, [
      bundle.deletionReceiptHash,bundle.receipt.entityKind,bundle.receipt.entityId,bundle.receipt.tombstoneHash,
      bundle.receipt.affectedAnswerReleaseId,bundle.receipt.affectedAnswerArtifactHash,bundle.receipt.replacementAnswerReleaseId,
      bundle.receipt.replacementBindingId,bundle.receipt.artifactPurgeEvidenceChecksum,bundle.receipt.backupEvidenceChecksum,
      bundle.receipt.backupExpiresAt,bundle.receipt.verifiedAt,
    ]);
    await client.query('COMMIT');
    return Object.freeze({ deletionReceiptHash: bundle.deletionReceiptHash, activeIndexAbsentAt: inserted.rows[0]!.active_index_absent_at });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function runTombstoneCli(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const config = await parseServerConfig(env); if (!config.deletionReceiptRoot) throw new Error('deletion receipt root is required');
  const pool = createPostgresPool(config.databaseUrl);
  try {
    await runPostgresMigrations(pool); const catalog = new VerifiedAnswerReleaseCatalogSource(config, pool);
    if (argv[0] === 'add') {
      const options = Object.fromEntries(argv.slice(1).map((arg) => { const [key, ...rest] = arg.split('='); return [key, rest.join('=') || true]; }));
      if (options['--confirm-tombstone'] !== true) throw new Error('tombstone confirmation is required');
      if (config.publicAskMode === 'provider' && options['--confirm-live-provider'] !== true) throw new Error('provider tombstone proof requires explicit live-provider confirmation');
      const embedder = config.publicAskMode === 'provider'
        ? new OpenAIEmbeddingClient(config.openAiApiKey!) : new DeterministicEmbeddingClient(config.nodeEnv);
      await addPublicAnswerTombstone({ pool, catalog, retriever: new PostgresHybridRetriever(embedder, new CancellablePgQueryRunner(pool)),
        entityKind: options['--entity-kind'] as TombstoneKind, entityId: String(options['--entity-id'] ?? ''), reasonCode: String(options['--reason'] ?? ''), signal: new AbortController().signal });
    } else if (argv[0] === 'verify-purge' && argv.length === 2 && argv[1]!.startsWith('--receipt=')) {
      await verifyPublicAnswerPurge({ pool, catalog, config, receiptPath: argv[1]!.slice('--receipt='.length), signal: new AbortController().signal });
    } else throw new Error('tombstone command is invalid');
  } finally { await pool.end(); }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  try { await runTombstoneCli(process.argv.slice(2), process.env); } catch { process.stderr.write('{"kind":"failure"}\n'); process.exitCode = 1; }
}
