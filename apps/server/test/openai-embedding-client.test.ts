import { createServer, type RequestListener, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';

import { OpenAIEmbeddingClient } from '../src/modules/public-answer/infrastructure/openai/openai-embedding-client.js';

let server: Server | undefined;
afterEach(async () => { if (server) { server.close(); await once(server, 'close'); server = undefined; } });

async function endpoint(handler: RequestListener): Promise<string> {
  server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing address');
  return `http://127.0.0.1:${address.port}/v1`;
}

describe('OpenAI embedding client', () => {
  it('sends only the exact four-key request and validates indexed vectors', async () => {
    let request: unknown; let calls = 0; let transport: unknown;
    const baseUrl = await endpoint((incoming, response) => {
      calls += 1; transport = { method: incoming.method, url: incoming.url, authorization: incoming.headers.authorization, contentType: incoming.headers['content-type'] };
      let body = ''; incoming.setEncoding('utf8'); incoming.on('data', (chunk) => { body += chunk; });
      incoming.on('end', () => {
        request = JSON.parse(body); response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 0, embedding: Array(3072).fill(0.25) }], model: 'text-embedding-3-large', usage: { prompt_tokens: 2, total_tokens: 2 } }));
      });
    });
    const result = await new OpenAIEmbeddingClient('secret', { profile: 'query', baseUrl }).embed(['ai와 책 판단'], new AbortController().signal);
    expect(request).toEqual({ input: ['ai와 책 판단'], model: 'text-embedding-3-large', dimensions: 3072, encoding_format: 'float' });
    expect(Object.keys(request as object).sort()).toEqual(['dimensions', 'encoding_format', 'input', 'model']);
    expect(transport).toEqual({ method: 'POST', url: '/v1/embeddings', authorization: 'Bearer secret', contentType: 'application/json' });
    expect(result).toMatchObject({ usage: { calls: 1, inputTokens: 2, outputTokens: 0 } });
    expect(result.vectors[0]).toHaveLength(3072); expect(calls).toBe(1);
  });

  it('rejects reordered, duplicate, non-finite, and extra response fields', async () => {
    const vector = Array(3072).fill(0.25);
    for (const body of [
      JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 1, embedding: vector }, { object: 'embedding', index: 0, embedding: vector }], model: 'text-embedding-3-large', usage: { prompt_tokens: 2, total_tokens: 2 } }),
      JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 0, embedding: vector }, { object: 'embedding', index: 0, embedding: vector }], model: 'text-embedding-3-large', usage: { prompt_tokens: 2, total_tokens: 2 } }),
      `{"object":"list","data":[{"object":"embedding","index":0,"embedding":[1e999,${Array(3071).fill(0).join(',')}]}],"model":"text-embedding-3-large","usage":{"prompt_tokens":1,"total_tokens":1}}`,
      JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 0, embedding: vector, extra: true }], model: 'text-embedding-3-large', usage: { prompt_tokens: 1, total_tokens: 1 } }),
      JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 0, embedding: vector }], model: 'text-embedding-3-large', usage: { prompt_tokens: 1, total_tokens: 1 }, extra: true }),
    ]) {
      const baseUrl = await endpoint((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(body); });
      await expect(new OpenAIEmbeddingClient('secret', { profile: body.includes('index":1') || body.match(/"index":0/g)?.length === 2 ? 'index' : 'query', baseUrl }).embed(body.includes('index":1') || body.includes('index":0') && body.match(/"index":0/g)?.length === 2 ? ['a','b'] : ['a'], new AbortController().signal)).rejects.toThrow(/invalid/u);
      server!.close(); await once(server!, 'close'); server = undefined;
    }
  });

  it('caps query response bodies at 256 KiB', async () => {
    const baseUrl = await endpoint((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(`{"padding":"${'x'.repeat(300_000)}"}`); });
    await expect(new OpenAIEmbeddingClient('secret', { profile: 'query', baseUrl }).embed(['question'], new AbortController().signal)).rejects.toThrow(/body-too-large/u);
  });

  it('preserves ordered approved index text only and applies the 8 MiB index cap', async () => {
    let decoded: unknown; const vector = Array(3072).fill(0.5);
    let baseUrl = await endpoint((request, response) => { let body=''; request.setEncoding('utf8'); request.on('data',(chunk)=>{body+=chunk;}); request.on('end',()=>{decoded=JSON.parse(body);response.setHeader('content-type','application/json');response.end(JSON.stringify({object:'list',data:[{object:'embedding',index:0,embedding:vector},{object:'embedding',index:1,embedding:vector}],model:'text-embedding-3-large',usage:{prompt_tokens:4,total_tokens:4}}));}); });
    await expect(new OpenAIEmbeddingClient('secret',{profile:'index',baseUrl}).embed(['approved chunk one','approved chunk two'],new AbortController().signal)).resolves.toMatchObject({vectors:[expect.any(Array),expect.any(Array)]});
    expect(decoded).toEqual({input:['approved chunk one','approved chunk two'],model:'text-embedding-3-large',dimensions:3072,encoding_format:'float'});
    expect(JSON.stringify(decoded)).not.toMatch(/chunkId|recordId|evidenceId|releaseId|bindingId|checksum|canonicalPath|title/u);
    server!.close();await once(server!,'close');server=undefined;
    baseUrl=await endpoint((_request,response)=>{response.setHeader('content-type','application/json');response.end(`{"padding":"${'x'.repeat(8*1024*1024+1)}"}`);});
    await expect(new OpenAIEmbeddingClient('secret',{profile:'index',baseUrl}).embed(['one','two'],new AbortController().signal)).rejects.toThrow(/body-too-large/u);
  });

  it.each([
    ['non-json', 200, 'text/plain', 'nope'],
    ['wrong dimension', 200, 'application/json', JSON.stringify({ data: [{ index: 0, embedding: [1] }], usage: { prompt_tokens: 1, total_tokens: 1 } })],
    ['missing index', 200, 'application/json', JSON.stringify({ data: [], usage: { prompt_tokens: 1, total_tokens: 1 } })],
    ['provider 401', 401, 'application/json', JSON.stringify({ error: { message: 'secret provider error' } })],
    ['provider 500', 500, 'application/json', JSON.stringify({ error: { message: 'secret provider error' } })],
  ])('rejects %s without retrying or exposing provider text', async (_label, status, type, body) => {
    let calls = 0;
    const baseUrl = await endpoint((_request, response) => { calls += 1; response.statusCode = status; response.setHeader('content-type', type); response.end(body); });
    const error = await new OpenAIEmbeddingClient('secret', { profile: 'query', baseUrl }).embed(['question'], new AbortController().signal).catch((value) => value as Error);
    expect(error).toBeInstanceOf(Error); if (!(error instanceof Error)) throw new Error('expected error');
    expect(error.message).not.toContain('secret provider error'); expect(calls).toBe(1);
  });

  it('propagates caller abort and rejects unsafe production base URLs', async () => {
    expect(() => new OpenAIEmbeddingClient('secret', { profile: 'query', baseUrl: 'http://example.com/v1' })).toThrow(/base URL/u);
    const baseUrl = await endpoint(() => undefined);
    const controller = new AbortController(); const pending = new OpenAIEmbeddingClient('secret', { profile: 'query', baseUrl }).embed(['question'], controller.signal);
    controller.abort(new Error('caller deadline'));
    await expect(pending).rejects.toThrow(/caller deadline|abort/u);
  });

  it('settles when a successful response body never yields and ignores a late body rejection', async () => {
    let rejectPull!: (error: Error) => void;
    const body = new ReadableStream<Uint8Array>({
      pull() { return new Promise<void>((_resolve, reject) => { rejectPull = reject; }); },
      cancel() { return new Promise<void>(() => undefined); },
    });
    const controller = new AbortController();
    const unhandled: unknown[] = [];
    const observe = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', observe);
    try {
      const pending = new OpenAIEmbeddingClient('secret', {
        profile: 'query',
        fetch: async () => new Response(body, { status: 200 }),
      }).embed(['question'], controller.signal);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const reason = new Error('embedding deadline');
      controller.abort(reason);
      await expect(Promise.race([
        pending,
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding remained pending')), 100)),
      ])).rejects.toBe(reason);
      rejectPull(new Error('late stream failure'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', observe);
    }
  });

  it('binds caps and cardinality to the explicit operation profile', async () => {
    let calls=0;let baseUrl=await endpoint((_request,response)=>{calls+=1;response.setHeader('content-type','application/json');response.end(`{"padding":"${'x'.repeat(300_000)}"}`);});
    const indexError:any=await new OpenAIEmbeddingClient('secret',{profile:'index',baseUrl}).embed(['one'],new AbortController().signal).catch((error)=>error);
    expect(indexError.code).toBe('invalid-response');expect(calls).toBe(1);
    server!.close();await once(server!,'close');server=undefined;
    baseUrl=await endpoint((_request,response)=>{calls+=1;response.end('{}');});
    await expect(new OpenAIEmbeddingClient('secret',{profile:'query',baseUrl}).embed(['one','two'],new AbortController().signal)).rejects.toThrow(/batch/u);
    expect(calls).toBe(1);
  });
});
