import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rm, unlink } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { canonicalProviderJson, exactObject, providerChecksum, strictOpenCanonicalJson } from './provider-json.js';

const HASH = /^sha256:[a-f0-9]{64}$/u; const ID = /^[a-f0-9]{64}$/u;
export interface ProviderEmbeddingReceiptInput {
  schemaVersion: 1; contentReleaseId: string; answerReleaseId: string;
  contentManifestHash: string; answerManifestHash: string; answerArtifactHash: string; corpusApprovalHash: string;
  providerDataControlReceiptHash: string; providerPricingReceiptHash: string;
  embeddingModel: 'text-embedding-3-large'; embeddingDimensions: 3072; embeddingSource: 'provider';
  entries: readonly { chunkChecksum: string; vectorChecksum: string }[];
  inputTokens: number; costMicroUsd: number; providerVectorSetChecksum: string; indexChecksum: string;
  createdAt: string; completedAt: string;
}
export type ProviderEmbeddingReceipt = Readonly<ProviderEmbeddingReceiptInput & { embeddingReceiptHash: string }>;

function exactTime(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && !Number.isNaN(Date.parse(value)); }
export function createProviderEmbeddingReceipt(input: ProviderEmbeddingReceiptInput): ProviderEmbeddingReceipt {
  const expectedKeys = ['schemaVersion','contentReleaseId','answerReleaseId','contentManifestHash','answerManifestHash','answerArtifactHash','corpusApprovalHash','providerDataControlReceiptHash','providerPricingReceiptHash','embeddingModel','embeddingDimensions','embeddingSource','entries','inputTokens','costMicroUsd','providerVectorSetChecksum','indexChecksum','createdAt','completedAt'];
  if (Object.keys(input).sort().join('\0') !== expectedKeys.sort().join('\0')) throw new Error('provider embedding receipt has missing or unknown fields');
  const ordered = { ...input, entries: input.entries.map((entry) => ({ chunkChecksum: entry.chunkChecksum, vectorChecksum: entry.vectorChecksum })) };
  if (input.schemaVersion !== 1 || !ID.test(input.contentReleaseId) || !ID.test(input.answerReleaseId)
    || ![input.contentManifestHash,input.answerManifestHash,input.answerArtifactHash,input.corpusApprovalHash,input.providerDataControlReceiptHash,input.providerPricingReceiptHash,input.providerVectorSetChecksum,input.indexChecksum]
      .every((value) => HASH.test(value))
    || input.embeddingModel !== 'text-embedding-3-large' || input.embeddingDimensions !== 3072 || input.embeddingSource !== 'provider'
    || !Number.isSafeInteger(input.inputTokens) || input.inputTokens < 0 || !Number.isSafeInteger(input.costMicroUsd) || input.costMicroUsd < 0
    || !exactTime(input.createdAt) || !exactTime(input.completedAt) || Date.parse(input.createdAt) > Date.parse(input.completedAt)
    || input.entries.some((entry) => !HASH.test(entry.chunkChecksum) || !HASH.test(entry.vectorChecksum))) throw new Error('provider embedding receipt is invalid');
  const entries = Object.freeze(ordered.entries.map((entry) => Object.freeze({ ...entry })));
  return Object.freeze({ ...ordered, entries, embeddingReceiptHash: providerChecksum(ordered) });
}

function parse(value: unknown): ProviderEmbeddingReceipt {
  const record = exactObject(value, ['schemaVersion','contentReleaseId','answerReleaseId','contentManifestHash','answerManifestHash','answerArtifactHash','corpusApprovalHash','providerDataControlReceiptHash','providerPricingReceiptHash','embeddingModel','embeddingDimensions','embeddingSource','entries','inputTokens','costMicroUsd','providerVectorSetChecksum','indexChecksum','createdAt','completedAt','embeddingReceiptHash']);
  if (!Array.isArray(record.entries)) throw new Error('provider embedding entries invalid');
  const entries = record.entries.map((entry) => exactObject(entry, ['chunkChecksum','vectorChecksum'])) as unknown as ProviderEmbeddingReceiptInput['entries'];
  const { embeddingReceiptHash, ...body } = record;
  const created = createProviderEmbeddingReceipt({ ...body, entries } as unknown as ProviderEmbeddingReceiptInput);
  if (embeddingReceiptHash !== created.embeddingReceiptHash) throw new Error('provider embedding receipt hash mismatch');
  return created;
}

async function validatedOuterRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new Error('provider receipt root must be absolute');
  const state = await lstat(root);
  if (state.isSymbolicLink() || !state.isDirectory() || (typeof process.getuid === 'function' && state.uid !== process.getuid())) throw new Error('provider receipt outer root must be one owned real directory');
  return realpath(root);
}
async function fsyncDirectory(path: string): Promise<void> { const handle=await open(path,constants.O_RDONLY);try{await handle.sync();}finally{await handle.close();} }
async function validatedReleaseDirectory(root: string, answerReleaseId: string, create: boolean): Promise<string> {
  const realRoot=await validatedOuterRoot(root);const directory=resolve(root,answerReleaseId);
  if (relative(root,directory).startsWith('..')) throw new Error('provider receipt escaped root');
  if(create){try{await mkdir(directory,{mode:0o700});await fsyncDirectory(root);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
  const state=await lstat(directory);
  if(state.isSymbolicLink()||!state.isDirectory()||(typeof process.getuid==='function'&&state.uid!==process.getuid()))throw new Error('provider receipt release directory must be one owned real directory');
  const realDirectory=await realpath(directory);if(!realDirectory.startsWith(`${realRoot}${sep}`))throw new Error('provider receipt release directory escaped outer root');
  return directory;
}

export async function writeProviderEmbeddingReceipt(root: string, receipt: ProviderEmbeddingReceipt, faults: Readonly<{ afterFinalLink?(): Promise<void> }> = {}): Promise<string> {
  parse(receipt); const directory=await validatedReleaseDirectory(root,receipt.answerReleaseId,true);
  const path = join(directory, `${receipt.embeddingReceiptHash.slice(7)}.json`); const stage = `${path}.stage-${process.pid}-${Date.now()}`;
  const handle = await open(stage, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { await handle.writeFile(`${canonicalProviderJson(receipt)}\n`); await handle.sync(); } catch (error) { await handle.close().catch(() => undefined); await rm(stage, { force: true }); throw error; }
  await handle.close();
  let createdFinal=false;
  try { await link(stage, path);createdFinal=true;await faults.afterFinalLink?.();await unlink(stage);await fsyncDirectory(dirname(path)); }
  catch (error) { if(createdFinal)await rm(path,{force:true});await rm(stage,{force:true});await fsyncDirectory(dirname(path));if(!createdFinal&&(error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('provider receipt already exists');throw error; }
  return path;
}

export async function readProviderEmbeddingReceipt(root: string, answerReleaseId: string, hash: string): Promise<ProviderEmbeddingReceipt> {
  if (!isAbsolute(root) || !ID.test(answerReleaseId) || !HASH.test(hash)) throw new Error('provider receipt identity invalid');
  const directory=await validatedReleaseDirectory(root,answerReleaseId,false);
  const opened = await strictOpenCanonicalJson(directory, `${hash.slice(7)}.json`, 8 * 1024 * 1024, false);
  if (opened.checksum === hash) throw new Error('receipt content hash must bind its body rather than self-containing bytes');
  const receipt = parse(opened.value); if (receipt.answerReleaseId !== answerReleaseId || receipt.embeddingReceiptHash !== hash) throw new Error('provider receipt path binding mismatch');
  return receipt;
}

export function estimateEmbeddingCostMicroUsd(tokens: number, pricePerMillion = 130_000): number {
  if (!Number.isSafeInteger(tokens) || tokens < 0 || !Number.isSafeInteger(pricePerMillion) || pricePerMillion < 0) throw new Error('provider price arithmetic invalid');
  return Math.ceil(tokens * pricePerMillion / 1_000_000);
}

export async function readBundledProviderPricing(): Promise<Readonly<{ receiptHash: string; embeddingInputMicroUsdPerMillionTokens: number }>> {
  const bytes = await readFile(new URL('./provider-pricing.v1.json', import.meta.url));
  const parsed = exactObject(JSON.parse(bytes.toString('utf8')), ['canonicalHash','models','observedAt','rounding','schemaVersion','sources']);
  const models = exactObject(parsed.models, ['gpt-5.4-mini-2026-03-17','text-embedding-3-large']);
  const embedding = exactObject(models['text-embedding-3-large'], ['inputMicroUsdPerMillionTokens','outputMicroUsdPerMillionTokens']);
  const responses = exactObject(models['gpt-5.4-mini-2026-03-17'], ['inputMicroUsdPerMillionTokens','outputMicroUsdPerMillionTokens']);
  const { canonicalHash, ...body } = parsed;
  if (parsed.schemaVersion !== 1 || parsed.observedAt !== '2026-08-30' || parsed.rounding !== 'ceil-micro-usd-per-operation'
    || !Array.isArray(parsed.sources) || parsed.sources.some((source) => typeof source !== 'string' || !source.startsWith('https://platform.openai.com/'))
    || embedding.inputMicroUsdPerMillionTokens !== 130_000 || embedding.outputMicroUsdPerMillionTokens !== 0
    || responses.inputMicroUsdPerMillionTokens !== 750_000 || responses.outputMicroUsdPerMillionTokens !== 4_500_000
    || canonicalHash !== providerChecksum(body) || bytes.toString('utf8') !== `${canonicalProviderJson(parsed)}\n`) throw new Error('bundled provider pricing receipt is invalid');
  return Object.freeze({ receiptHash: canonicalHash as string, embeddingInputMicroUsdPerMillionTokens: 130_000 });
}
