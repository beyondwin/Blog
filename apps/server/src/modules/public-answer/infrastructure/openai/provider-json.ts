import { OpenAIEmbeddingError } from './openai-errors.js';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export async function readCappedJson(response: Response, cap: number, signal?: AbortSignal): Promise<unknown> {
  if (!Number.isInteger(cap) || cap < 1) throw new Error('JSON byte cap is invalid');
  if (!response.body) throw new OpenAIEmbeddingError('invalid-json');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new OpenAIEmbeddingError('aborted');
      const read = reader.read();
      let abortListener: (() => void) | undefined;
      try {
        const interrupted = new Promise<never>((_resolve, reject) => {
          if (!signal) return;
          abortListener = () => reject(signal.reason ?? new OpenAIEmbeddingError('aborted'));
          signal.addEventListener('abort', abortListener, { once: true });
          if (signal.aborted) abortListener();
        });
        const { done, value } = await Promise.race([read, interrupted]); if (done) break;
        total += value.byteLength; if (total > cap) { void reader.cancel().catch(() => undefined); throw new OpenAIEmbeddingError('body-too-large'); }
        chunks.push(value);
      } finally {
        if (abortListener) signal?.removeEventListener('abort', abortListener);
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      void reader.cancel(signal.reason).catch(() => undefined);
      throw signal.reason ?? new OpenAIEmbeddingError('aborted');
    }
    if (error instanceof OpenAIEmbeddingError) throw error;
    throw new OpenAIEmbeddingError('invalid-json', { cause: error });
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { throw new OpenAIEmbeddingError('invalid-json', { cause: error }); }
}

export function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenAIEmbeddingError('invalid-response');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('\0') !== [...keys].sort().join('\0')) throw new OpenAIEmbeddingError('invalid-response');
  return record;
}

function compare(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!; if (difference) return difference;
  }
  return a.length - b.length;
}
export function canonicalProviderJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('non-finite JSON'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalProviderJson).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => compare(a, b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalProviderJson(child)}`).join(',')}}`;
  }
  throw new TypeError('value is not canonical JSON');
}
export function providerChecksum(value: unknown): string {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalProviderJson(value);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function strictOpenCanonicalJson(root: string, fileName: string, cap: number, bindFileName = true): Promise<{ value: unknown; checksum: string; bytes: Buffer }> {
  if (!isAbsolute(root) || !/^[a-f0-9]{64}\.json$/u.test(fileName)) throw new Error('canonical artifact path is invalid');
  const rootState=await lstat(root);if(rootState.isSymbolicLink()||!rootState.isDirectory()||(typeof process.getuid==='function'&&rootState.uid!==process.getuid()))throw new Error('canonical artifact root must be one owned real directory');
  const path = resolve(root, fileName); const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('canonical artifact escaped root');
  if (await realpath(dirname(path)) !== await realpath(root)) throw new Error('canonical artifact parent escaped real root');
  const before = await lstat(path); if (before.isSymbolicLink() || !before.isFile()) throw new Error('canonical artifact must be a no-follow regular file');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const state = await handle.stat(); if (!state.isFile() || state.nlink !== 1 || state.size > cap
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) throw new Error('canonical artifact size/type/owner invalid');
    const bytes = await handle.readFile(); const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) throw new Error('canonical artifact changed during read');
    const value = JSON.parse(bytes.toString('utf8')) as unknown;
    if (bytes.toString('utf8') !== `${canonicalProviderJson(value)}\n`) throw new Error('artifact bytes are not canonical');
    const checksum = providerChecksum(bytes);
    if (bindFileName && fileName !== `${checksum.slice(7)}.json`) throw new Error('artifact file name does not match canonical bytes');
    return { value, checksum, bytes };
  } finally { await handle.close(); }
}
