import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CancellablePgQueryRunner } from '../../src/modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { PostgresHybridRetriever } from '../../src/modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';
import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';

const databaseUrl=process.env.FORM_THOUGHT_TEST_DATABASE_URL;if(!databaseUrl)throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');let pool:Pool;
beforeEach(async()=>{pool=new Pool({connectionString:databaseUrl,max:4});await pool.query('DROP SCHEMA IF EXISTS public CASCADE');await pool.query('CREATE SCHEMA public');await runPostgresMigrations(pool);});
afterEach(async()=>{await pool.query('DROP SCHEMA IF EXISTS public CASCADE');await pool.query('CREATE SCHEMA public');await pool.end();});

describe('real Postgres hybrid retrieval isolation',()=>{
  it('orders deterministic vector ties and excludes competing binding, release, and inactive rows',async()=>{
    const bindingId='55555555-5555-4555-8555-555555555555',competingBindingId='66666666-6666-4666-8666-666666666666',answerReleaseId='a'.repeat(64),wrongReleaseId='9'.repeat(64);
    const binding=async(id:string,answer:string,state:'active'|'retired')=>pool.query(`INSERT INTO public_answer_release_bindings(binding_id,content_release_id,answer_release_id,content_manifest_hash,answer_manifest_hash,answer_artifact_hash,embedding_model,embedding_dimensions,embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state,created_at,activated_at) VALUES($1,$2,$3,$4,$5,$6,'text-embedding-3-large',3072,'fixture',$7,3,$8,$9,now(),now())`,[id,'c'.repeat(64),answer,`sha256:${'1'.repeat(64)}`,`sha256:${'2'.repeat(64)}`,`sha256:${'3'.repeat(64)}`,`sha256:${'4'.repeat(64)}`,`sha256:${'5'.repeat(64)}`,state]);
    await binding(bindingId,answerReleaseId,'active');await binding(competingBindingId,answerReleaseId,'retired');
    const vector=`[1,${Array(3071).fill(0).join(',')}]`;const insert=async(binding:string,answer:string,chunkId:string,recordId:string)=>pool.query(`INSERT INTO public_answer_chunks(binding_id,answer_release_id,chunk_id,chunk_checksum,record_id,canonical_path,title,heading_path,body,search_text,embedding_model,embedding_dimensions,embedding) VALUES($1,$2,$3,$4,$5,$6,$7,ARRAY['H'],'public text','public text','text-embedding-3-large',3072,$8::vector)`,[binding,answer,chunkId,`sha256:${chunkId}`,recordId,`/${recordId}/`,recordId,vector]);
    const chunkIds=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];for(const [index,chunkId] of chunkIds.entries())await insert(bindingId,answerReleaseId,chunkId,`articles/${String.fromCharCode(97+index)}`);
    await insert(competingBindingId,answerReleaseId,'0'.repeat(64),'articles/competitor');await insert(bindingId,wrongReleaseId,'1'.repeat(64),'articles/wrong-release');
    const evidence=chunkIds.map((chunkId,index)=>({evidenceId:String(index+1).repeat(64),chunkId,answerReleaseId,recordId:`articles/${String.fromCharCode(97+index)}`,collectionLabel:'기록',recordTitle:String.fromCharCode(65+index),canonicalPath:`/articles/${String.fromCharCode(97+index)}/`,locator:{kind:'heading-paragraph' as const,label:'H',ordinal:1},excerpt:'public text',excerptChecksum:`sha256:${String(index+6).repeat(64)}`}));
    const evidenceById=new Map(evidence.map((item)=>[item.evidenceId,item]));const catalog={bindingId,contentReleaseId:'c'.repeat(64),answerReleaseId,corpusApprovalHash:`sha256:${'f'.repeat(64)}`,chunkCount:3,normalizerVersion:'nfkc-lower-hangul-ngram-v1',embeddingSource:'fixture',embeddingReceiptHash:`sha256:${'4'.repeat(64)}`,tombstones:new Set(),evidenceById,chunkById:new Map(evidence.map((item)=>[item.chunkId,{chunkId:item.chunkId,recordId:item.recordId,canonicalPath:item.canonicalPath}])),chunkChecksumById:new Map(chunkIds.map((id)=>[id,`sha256:${id}`])),isBoundTo:()=>true,evidenceFor:(ids:readonly string[])=>ids.flatMap((id)=>evidenceById.get(id)??[])} as any;
    let embedCalls=0;const embedder={model:'text-embedding-3-large',dimensions:3072,embed:async()=>{embedCalls+=1;return{vectors:[[1,...Array(3071).fill(0)]],usage:{calls:1,inputTokens:2,outputTokens:0}};}} as any;const retriever=new PostgresHybridRetriever(embedder,new CancellablePgQueryRunner(pool));
    const first=await retriever.retrieve({question:'public text',catalog,limit:6,signal:new AbortController().signal});expect(first.evidence.map((item)=>item.evidenceId)).toEqual(['1'.repeat(64),'2'.repeat(64),'3'.repeat(64)]);expect(embedCalls).toBe(1);
    await pool.query("UPDATE public_answer_release_bindings SET state='retired' WHERE binding_id=$1",[bindingId]);const inactive=await retriever.retrieve({question:'public text',catalog,limit:6,signal:new AbortController().signal});expect(inactive).toMatchObject({evidence:[],candidateCount:0,sufficient:false});
  });
});
