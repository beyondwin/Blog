import { mkdtemp, readdir, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createProviderEmbeddingReceipt, estimateEmbeddingCostMicroUsd, readBundledProviderPricing, readProviderEmbeddingReceipt, writeProviderEmbeddingReceipt } from '../src/modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import { PROVIDER_MODEL_POLICY } from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';
import { DeterministicEmbeddingClient } from '../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import { createProviderEmbeddingAuthorities, PostgresAnswerReleaseIndexer, prepareEmbeddingSet } from '../src/modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';
import { parseIndexEmbeddingMode, providerIndexBudget } from '../src/index-answer-release.js';
import { VerifiedAnswerReleaseCatalogSource } from '../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { parseTombstoneCommand, providerPurgeCostWarning, runTombstoneCliWithExit, tombstoneSuccessAudit } from '../src/tombstone-public-answer.js';

const roots: string[] = []; afterEach(async () => { const { rm } = await import('node:fs/promises'); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
function input() { return { schemaVersion: 1 as const, contentReleaseId: 'a'.repeat(64), answerReleaseId: 'b'.repeat(64), contentManifestHash: `sha256:${'1'.repeat(64)}`, answerManifestHash: `sha256:${'2'.repeat(64)}`, answerArtifactHash: `sha256:${'3'.repeat(64)}`, corpusApprovalHash: `sha256:${'4'.repeat(64)}`, providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`, providerPricingReceiptHash: `sha256:${'6'.repeat(64)}`, embeddingModel: 'text-embedding-3-large' as const, embeddingDimensions: 3072 as const, embeddingSource: 'provider' as const, entries: [{ chunkChecksum: `sha256:${'7'.repeat(64)}`, vectorChecksum: `sha256:${'8'.repeat(64)}` }], inputTokens: 1, costMicroUsd: 1, providerVectorSetChecksum: `sha256:${'9'.repeat(64)}`, indexChecksum: `sha256:${'a'.repeat(64)}`, createdAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z' }; }

describe('provider embedding receipt', () => {
  it('rounds cost upward and writes, fsyncs, strict-reopens canonical provenance without secret payloads', async () => {
    expect(estimateEmbeddingCostMicroUsd(1)).toBe(1); expect(estimateEmbeddingCostMicroUsd(100_000)).toBe(13_000);
    await expect(readBundledProviderPricing()).resolves.toEqual({
      receiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
      embeddingInputMicroUsdPerMillionTokens: 130000,
    });
    const root = await mkdtemp(join(tmpdir(), 'provider-embedding-')); roots.push(root);
    const receipt = createProviderEmbeddingReceipt(input()); const path = await writeProviderEmbeddingReceipt(root, receipt);
    const reopened = await readProviderEmbeddingReceipt(root, receipt.answerReleaseId, receipt.embeddingReceiptHash);
    expect(reopened).toEqual(receipt); const bytes = await readFile(path, 'utf8');
    expect(bytes).not.toMatch(/question|vectorValues|apiKey|providerBody|canonicalPath/u);
    await expect(writeProviderEmbeddingReceipt(root, receipt)).rejects.toThrow(/exists/u);
  });
  it('rejects unknown fields, hash substitution, traversal, and symlinks', async () => {
    expect(() => createProviderEmbeddingReceipt({ ...input(), unknown: true } as any)).toThrow(/unknown/u);
    const root = await mkdtemp(join(tmpdir(), 'provider-embedding-')); roots.push(root);
    const receipt = createProviderEmbeddingReceipt(input()); const path = await writeProviderEmbeddingReceipt(root, receipt);
    await expect(readProviderEmbeddingReceipt(root, receipt.answerReleaseId, `sha256:${'0'.repeat(64)}`)).rejects.toThrow();
    const linkRoot = await mkdtemp(join(tmpdir(), 'provider-link-')); roots.push(linkRoot);
    const dir = join(linkRoot, receipt.answerReleaseId); const { mkdir } = await import('node:fs/promises'); await mkdir(dir);
    await symlink(path, join(dir, `${receipt.embeddingReceiptHash.slice(7)}.json`));
    await expect(readProviderEmbeddingReceipt(linkRoot, receipt.answerReleaseId, receipt.embeddingReceiptHash)).rejects.toThrow(/no-follow|regular/u);
  });
  it('rejects parent-directory symlink escapes for both read and write', async () => {
    const outside=await mkdtemp(join(tmpdir(),'provider-outside-'));roots.push(outside);const receipt=createProviderEmbeddingReceipt(input());await writeProviderEmbeddingReceipt(outside,receipt);
    const readRoot=await mkdtemp(join(tmpdir(),'provider-read-root-'));roots.push(readRoot);await symlink(join(outside,receipt.answerReleaseId),join(readRoot,receipt.answerReleaseId));
    await expect(readProviderEmbeddingReceipt(readRoot,receipt.answerReleaseId,receipt.embeddingReceiptHash)).rejects.toThrow(/real directory|outer root/u);
    const writeRoot=await mkdtemp(join(tmpdir(),'provider-write-root-'));roots.push(writeRoot);await symlink(join(outside,receipt.answerReleaseId),join(writeRoot,receipt.answerReleaseId));
    await expect(writeProviderEmbeddingReceipt(writeRoot,receipt)).rejects.toThrow(/real directory|outer root/u);
  });
  it('removes and fsyncs only the invocation-created final link after post-link failure', async () => {
    const root=await mkdtemp(join(tmpdir(),'provider-fault-'));roots.push(root);const receipt=createProviderEmbeddingReceipt(input());
    await expect(writeProviderEmbeddingReceipt(root,receipt,{afterFinalLink:async()=>{throw new Error('fault-after-link');}})).rejects.toThrow(/fault-after-link/u);
    expect(await readdir(join(root,receipt.answerReleaseId))).toEqual([]);
    await writeProviderEmbeddingReceipt(root,receipt);const before=await readFile(join(root,receipt.answerReleaseId,`${receipt.embeddingReceiptHash.slice(7)}.json`));
    await expect(writeProviderEmbeddingReceipt(root,receipt,{afterFinalLink:async()=>{throw new Error('must-not-run');}})).rejects.toThrow(/exists/u);
    expect(await readFile(join(root,receipt.answerReleaseId,`${receipt.embeddingReceiptHash.slice(7)}.json`))).toEqual(before);
  });
  it('binds every prepared chunk/vector and index checksum into the durable activation authority', async () => {
    const release = { contentReleaseId: 'a'.repeat(64), answerReleaseId: 'b'.repeat(64), manifestHash: `sha256:${'2'.repeat(64)}`, artifactHash: `sha256:${'3'.repeat(64)}`, corpusApprovalHash: `sha256:${'4'.repeat(64)}`, manifest: { identity: { contentManifestHash: `sha256:${'1'.repeat(64)}` } }, chunks: [{ chunkId: 'c'.repeat(64), recordId: 'articles/example', canonicalPath: '/articles/example/' }], evidence: [{ evidenceId: 'e'.repeat(64), chunkId: 'c'.repeat(64), recordId: 'articles/example' }], indexInputs: [{ chunkId: 'c'.repeat(64), chunkChecksum: `sha256:${'7'.repeat(64)}`, recordId: 'articles/example', canonicalPath: '/articles/example/', title: 'Example', headingPath: ['H'], text: 'public text', searchText: 'public text' }] } as any;
    const prepared = await prepareEmbeddingSet(release, new DeterministicEmbeddingClient('test'), new AbortController().signal);
    const authority = createProviderEmbeddingAuthorities(release, prepared, { providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`, providerPricingReceiptHash: `sha256:${'6'.repeat(64)}`, createdAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z' });
    expect(authority.durable.entries).toEqual(prepared.vectors.map(({ chunkChecksum, vectorChecksum }) => ({ chunkChecksum, vectorChecksum })));
    expect(authority.activation).toMatchObject({ source: 'provider', receiptHash: authority.durable.embeddingReceiptHash, indexChecksum: authority.durable.indexChecksum });
    await expect(new PostgresAnswerReleaseIndexer('production').activate(release,prepared,authority.activation,{} as any,new AbortController().signal,{...authority.durable,providerVectorSetChecksum:`sha256:${'0'.repeat(64)}`})).rejects.toThrow(/authority mismatch/u);
    await expect(new PostgresAnswerReleaseIndexer('production').activate(release,prepared,authority.activation,{} as any,new AbortController().signal,{...authority.durable,indexChecksum:`sha256:${'0'.repeat(64)}`})).rejects.toThrow(/authority mismatch/u);
  });
  it('keeps provider indexing behind two explicit flags and deduplicated pre-call maxima', () => {
    expect(parseIndexEmbeddingMode(['--embedding-mode=fixture'])).toBe('fixture');
    expect(parseIndexEmbeddingMode(['--embedding-mode=provider','--confirm-live-provider'])).toBe('provider');
    for (const argv of [[],['--embedding-mode=provider'],['--confirm-live-provider'],['--embedding-mode=provider','--confirm-live-provider','extra']]) expect(() => parseIndexEmbeddingMode(argv)).toThrow(/confirmation|explicit/u);
    expect(providerIndexBudget([{ chunkChecksum: 'same', text: '한' }, { chunkChecksum: 'same', text: '한' }])).toEqual({ tokenUpperBound: 3, costUpperBoundMicroUsd: 1 });
    expect(() => providerIndexBudget([{ chunkChecksum: 'large', text: 'x'.repeat(100_001) }])).toThrow(/maximum/u);
  });
  it('refuses a DB-only provider receipt hash at catalog startup/readiness', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-readiness-')); roots.push(root);
    const answer = { contentReleaseId: 'a'.repeat(64), answerReleaseId: 'b'.repeat(64), manifestHash: `sha256:${'2'.repeat(64)}`, artifactHash: `sha256:${'3'.repeat(64)}`, corpusApprovalHash: `sha256:${'4'.repeat(64)}`, releasePath: '/answer/release', manifest: { identity: { contentManifestHash: `sha256:${'1'.repeat(64)}`, normalizerVersion: 'nfkc-lower-hangul-ngram-v1' } }, chunks: [], evidence: [], indexInputs: [] } as any;
    const client = { query: async (sql: string) => sql.startsWith('BEGIN') ? { rows: [], rowCount: 0 } : { rows: [{ binding_id: '11111111-1111-4111-8111-111111111111', content_release_id: answer.contentReleaseId, answer_release_id: answer.answerReleaseId, content_manifest_hash: answer.manifest.identity.contentManifestHash, answer_manifest_hash: answer.manifestHash, answer_artifact_hash: answer.artifactHash, embedding_source: 'provider', embedding_receipt_hash: `sha256:${'9'.repeat(64)}`, chunk_count: 0, index_checksum: `sha256:${'8'.repeat(64)}` }], rowCount: 1 }, release: () => undefined };
    const pool = { connect: async () => client } as any; const readers = { readApproval: async () => ({ schemaVersion: 1, entries: [] }), readContent: async () => ({ manifest: { records: {} } }), readAnswer: async () => answer, verifyAnswer: async () => undefined };
    await expect(new VerifiedAnswerReleaseCatalogSource({ corpusApprovalPath: '/approval', contentReleaseRoot: '/content', answerReleaseRoot: '/answer', providerEmbeddingReceiptRoot: root } as any, pool, readers as any).snapshot(new AbortController().signal)).rejects.toThrow();
  });
  it.each([undefined,'future-normalizer-v2'])('fails catalog admission when normalizer authority is %s',async(normalizerVersion)=>{
    const answer={contentReleaseId:'a'.repeat(64),answerReleaseId:'b'.repeat(64),manifestHash:`sha256:${'2'.repeat(64)}`,artifactHash:`sha256:${'3'.repeat(64)}`,corpusApprovalHash:`sha256:${'4'.repeat(64)}`,releasePath:'/answer/release',manifest:{identity:{contentManifestHash:`sha256:${'1'.repeat(64)}`,...(normalizerVersion?{normalizerVersion}:{})}},chunks:[],evidence:[],indexInputs:[]} as any;
    const client={query:async(sql:string)=>sql.startsWith('BEGIN')?{rows:[],rowCount:0}:{rows:[{binding_id:'11111111-1111-4111-8111-111111111111',content_release_id:answer.contentReleaseId,answer_release_id:answer.answerReleaseId,content_manifest_hash:answer.manifest.identity.contentManifestHash,answer_manifest_hash:answer.manifestHash,answer_artifact_hash:answer.artifactHash,embedding_source:'fixture',embedding_receipt_hash:`sha256:${'9'.repeat(64)}`,chunk_count:0,index_checksum:`sha256:${'8'.repeat(64)}`}],rowCount:1},release:()=>undefined};
    const readers={readApproval:async()=>({schemaVersion:1,entries:[]}),readContent:async()=>({manifest:{records:{}}}),readAnswer:async()=>answer,verifyAnswer:async()=>undefined};
    await expect(new VerifiedAnswerReleaseCatalogSource({corpusApprovalPath:'/approval',contentReleaseRoot:'/content',answerReleaseRoot:'/answer'} as any,{connect:async()=>client} as any,readers as any).snapshot(new AbortController().signal)).rejects.toThrow(/normalizer/u);
  });
  it('parses exact tombstone args and emits deterministic allowlisted audits',async()=>{
    const add=parseTombstoneCommand(['add','--entity-kind=record','--entity-id=articles/example','--reason=legal-removal','--confirm-tombstone']);
    expect(tombstoneSuccessAudit(add,{tombstoneHash:`sha256:${'1'.repeat(64)}`,createdAt:'2026-08-30T00:00:00.000Z'})).toBe(`{"kind":"success","operation":"add","entityKind":"record","entityId":"articles/example","tombstoneHash":"sha256:${'1'.repeat(64)}","createdAt":"2026-08-30T00:00:00.000Z"}\n`);
    expect(parseTombstoneCommand(['add','--entity-kind=record','--entity-id=answer-only/example','--reason=legal-removal','--confirm-tombstone'])).toMatchObject({entityId:'answer-only/example'});
    const verify=parseTombstoneCommand(['verify-purge','--receipt=/var/lib/beyondwin/deletion/receipt.json']);expect(verify).toMatchObject({confirmLiveProvider:false});
    expect(tombstoneSuccessAudit(verify,{deletionReceiptHash:`sha256:${'2'.repeat(64)}`,activeIndexAbsentAt:'2026-08-30T00:00:01.000Z'})).toBe(`{"kind":"success","operation":"verify-purge","deletionReceiptHash":"sha256:${'2'.repeat(64)}","activeIndexAbsentAt":"2026-08-30T00:00:01.000Z"}\n`);
    expect(parseTombstoneCommand(['verify-purge','--receipt=/var/lib/beyondwin/deletion/receipt.json','--confirm-live-provider'])).toMatchObject({confirmLiveProvider:true});
    expect(()=>parseTombstoneCommand(['verify-purge','--receipt=/var/lib/beyondwin/deletion/receipt.json','--confirm-live-provider=true'])).toThrow(/confirmation|invalid/u);
    expect(providerPurgeCostWarning(verify,0,'')).toBeNull();
    expect(()=>providerPurgeCostWarning(verify,1,'articles/example')).toThrow(/confirmation/u);
    expect(providerPurgeCostWarning(parseTombstoneCommand(['verify-purge','--receipt=/var/lib/beyondwin/deletion/receipt.json','--confirm-live-provider']),1,'articles/example')).toBe('{"kind":"cost-warning","maxEmbeddingCalls":1,"maxInputTokens":16,"maxMicroUsd":3}\n');
    expect(()=>parseTombstoneCommand(['add','--entity-kind=record','--entity-id=articles/example','--reason=legal-removal'])).toThrow(/confirmation/u);
    expect(()=>parseTombstoneCommand(['add','--entity-kind=record','--entity-id=articles/example','--reason=legal-removal','--confirm-tombstone','--confirm-live-provider=true'])).toThrow(/confirmation/u);
    expect(()=>parseTombstoneCommand(['add','--entity-kind=record','--entity-id=articles/example','--reason=INVALID REASON','--confirm-tombstone'])).toThrow(/identity/u);
    expect(()=>parseTombstoneCommand(['add','--entity-kind=record','--entity-id=articles/example','--reason=legal-removal','--confirm-tombstone','--unknown'])).toThrow(/unknown/u);
    const stderr:string[]=[];expect(await runTombstoneCliWithExit([],{}, {stdout:()=>undefined,stderr:(value)=>stderr.push(value)},(async()=>{throw new Error('secret');}) as any)).toBe(1);expect(stderr).toEqual(['{"kind":"failure"}\n']);
  });
});
