import { pathToFileURL } from 'node:url';

import { parseServerConfig } from './config/server-config.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import {
  createFixtureEmbeddingReceipt,
  PostgresAnswerReleaseIndexer,
  prepareEmbeddingSet,
} from './modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';
import { runPostgresMigrations } from './modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { createPostgresPool } from './modules/public-answer/infrastructure/postgres/postgres-pool.js';

export async function indexAnswerRelease(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  if (argv.length !== 1 || argv[0] !== '--embedding-mode=fixture') throw new Error('only explicit fixture indexing is installed');
  const config = await parseServerConfig(env);
  if (config.publicAskMode !== 'fixture') throw new Error('fixture indexing requires fixture mode');
  const answerSpecifier = '@beyondwin/content/answer-release';
  const releaseSpecifier = '@beyondwin/content/release';
  const answerApi = await import(answerSpecifier) as any;
  const releaseApi = await import(releaseSpecifier) as any;
  const approval = await answerApi.readPublicAnswerCorpusApproval(config.corpusApprovalPath);
  const content = await releaseApi.readActiveRelease(config.contentReleaseRoot);
  const answer = await answerApi.readActiveAnswerRelease(config.answerReleaseRoot, content, approval);
  await answerApi.verifyAnswerReleaseDirectory(answer.releasePath, content, approval);
  const pool = createPostgresPool(config.databaseUrl);
  try {
    await runPostgresMigrations(pool);
    const prepared = await prepareEmbeddingSet(answer, new DeterministicEmbeddingClient(config.nodeEnv), new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(prepared);
    const activated = await new PostgresAnswerReleaseIndexer(config.nodeEnv)
      .activate(answer, prepared, receipt, pool, new AbortController().signal);
    const reread = await pool.query<{
      binding_id: string; content_release_id: string; answer_release_id: string; embedding_receipt_hash: string;
      chunk_count: number; state: string;
    }>('SELECT binding_id,content_release_id,answer_release_id,embedding_receipt_hash,chunk_count,state FROM public_answer_release_bindings WHERE binding_id=$1', [activated.bindingId]);
    const row = reread.rows[0];
    if (!row || row.content_release_id !== answer.contentReleaseId || row.answer_release_id !== answer.answerReleaseId
      || row.embedding_receipt_hash !== receipt.receiptHash || row.chunk_count !== answer.chunks.length || row.state !== 'active') {
      throw new Error('activated binding reread did not match the verified receipt');
    }
    process.stdout.write(JSON.stringify({
      kind: 'success', contentReleaseId: answer.contentReleaseId.slice(0, 12), answerReleaseId: answer.answerReleaseId.slice(0, 12),
      approvalHash: answer.corpusApprovalHash.slice(0, 19), chunkCount: answer.chunks.length, model: receipt.model,
    }) + '\n');
  } finally { await pool.end(); }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await indexAnswerRelease(process.argv.slice(2), process.env).catch((error) => {
    process.stderr.write(`${JSON.stringify({ kind: 'failure', message: error instanceof Error ? error.message : 'unknown error' })}\n`);
    process.exitCode = 1;
  });
}
