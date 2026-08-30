import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DeterministicEmbeddingClient } from '../../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import { CancellablePgQueryRunner } from '../../src/modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { PostgresHybridRetriever } from '../../src/modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';
import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { addPublicAnswerTombstone } from '../../src/tombstone-public-answer.js';

const databaseUrl=process.env.FORM_THOUGHT_TEST_DATABASE_URL;if(!databaseUrl)throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');let pool:Pool;
beforeEach(async()=>{pool=new Pool({connectionString:databaseUrl,max:4});await pool.query('DROP SCHEMA IF EXISTS public CASCADE');await pool.query('CREATE SCHEMA public');await runPostgresMigrations(pool);});
afterEach(async()=>{await pool.query('DROP SCHEMA IF EXISTS public CASCADE');await pool.query('CREATE SCHEMA public');await pool.end();});

describe('evidence tombstone exclusion',()=>{it('keeps the known chunk valid while discarding its tombstoned evidence through the real retriever',async()=>{
  const bindingId='33333333-3333-4333-8333-333333333333',answerReleaseId='b'.repeat(64),chunkId='a'.repeat(64),evidenceId='e'.repeat(64),checksum=`sha256:${'9'.repeat(64)}`;
  await pool.query(`INSERT INTO public_answer_release_bindings(binding_id,content_release_id,answer_release_id,content_manifest_hash,answer_manifest_hash,answer_artifact_hash,embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state,created_at,activated_at) VALUES($1,$2,$3,$4,$5,$6,'text-embedding-3-large',3072,'fixture',$7,1,$8,'active',now(),now())`,[bindingId,'c'.repeat(64),answerReleaseId,`sha256:${'1'.repeat(64)}`,`sha256:${'2'.repeat(64)}`,`sha256:${'3'.repeat(64)}`,`sha256:${'7'.repeat(64)}`,`sha256:${'6'.repeat(64)}`]);
  const vector=`[${Array(3072).fill(0).join(',')}]`;await pool.query(`INSERT INTO public_answer_chunks(binding_id,answer_release_id,chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,search_text,embedding_model,embedding_dimensions,embedding) VALUES($1,$2,$3,$4,'articles/example','/articles/example/','Example',ARRAY['H'],'public text','public text','text-embedding-3-large',3072,$5::vector)`,[bindingId,answerReleaseId,chunkId,checksum,vector]);
  const evidence={evidenceId,chunkId,answerReleaseId,recordId:'articles/example',collectionLabel:'기록',recordTitle:'Example',canonicalPath:'/articles/example/',locator:{kind:'heading-paragraph' as const,label:'H',ordinal:1},excerpt:'public text',excerptChecksum:`sha256:${'8'.repeat(64)}`};let calls=0;
  const catalog={snapshot:async()=>{calls+=1;const denied=calls>1;const evidenceById=new Map(denied?[]:[[evidenceId,evidence]]);return{bindingId,contentReleaseId:'c'.repeat(64),answerReleaseId,corpusApprovalHash:`sha256:${'f'.repeat(64)}`,chunkCount:1,normalizerVersion:'nfkc-lower-hangul-ngram-v1',embeddingSource:'fixture',embeddingReceiptHash:`sha256:${'7'.repeat(64)}`,tombstones:new Set(denied?[`evidence:${evidenceId}`]:[]),evidenceById,chunkById:new Map([[chunkId,{chunkId,recordId:'articles/example',canonicalPath:'/articles/example/'}]]),chunkChecksumById:new Map([[chunkId,checksum]]),isBoundTo:()=>true,evidenceFor:(ids:readonly string[])=>ids.flatMap((id)=>evidenceById.get(id)??[])} as any;}};
  const retriever=new PostgresHybridRetriever(new DeterministicEmbeddingClient('test'),new CancellablePgQueryRunner(pool));const result=await addPublicAnswerTombstone({pool,catalog:catalog as any,retriever,entityKind:'evidence',entityId:evidenceId,reasonCode:'legal-removal',signal:new AbortController().signal});
  expect(result.tombstoneHash).toMatch(/^sha256:/u);expect(calls).toBe(2);const after=await catalog.snapshot();expect(await retriever.retrieve({question:evidenceId,catalog:after,limit:6,signal:new AbortController().signal})).toMatchObject({evidence:[],candidateCount:0,sufficient:false});
});});
