import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import {
  HttpPublicAskProvider,
  PublicAskTransportError,
  type PublicAnswerReleaseBinding,
} from '../../src/ui/search/publicAskProvider';

const binding: PublicAnswerReleaseBinding = {
  contentReleaseId: 'a'.repeat(64),
  answerReleaseId: 'b'.repeat(64),
};
const evidenceId = 'c'.repeat(64);

const answer = {
  kind: 'answer' as const,
  answerReleaseId: binding.answerReleaseId,
  claims: [{ id: 'claim-1', text: '답은 검증된 근거에서만 나옵니다.', evidenceIds: [evidenceId] }],
  evidence: [{
    evidenceId,
    chunkId: 'd'.repeat(64),
    recordId: 'thoughts/why-i-read-in-the-ai-era',
    collectionLabel: '생각',
    recordTitle: 'AI 시대에, 나는 왜 책을 읽는가',
    canonicalPath: '/thoughts/why-i-read-in-the-ai-era/',
    locator: { kind: 'heading-paragraph', label: '문단 1', ordinal: 1 },
    excerpt: '검증된 공개 기록의 근거입니다.',
    excerptChecksum: `sha256:${'e'.repeat(64)}`,
  }],
};

const releaseHeaders = {
  'x-content-release-id': binding.contentReleaseId,
  'x-answer-release-id': binding.answerReleaseId,
};

function response(body: unknown, status = 200, headers: Record<string, string> = releaseHeaders): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function expectTransportCode(promise: Promise<unknown>, code: 'timeout' | 'unavailable' | 'invalid-response') {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('HttpPublicAskProvider', () => {
  it('sends one exact same-origin POST with only the bounded request and the caller signal', async () => {
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(answer));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new HttpPublicAskProvider(binding, fetchImpl);

    await expect(provider.ask('  질문 원문  ', { signal })).resolves.toEqual(answer);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/public/ask', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        question: '질문 원문',
        contentReleaseId: binding.contentReleaseId,
        answerReleaseId: binding.answerReleaseId,
      }),
      signal,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).not.toContain('질문 원문');
    expect(JSON.stringify(init?.headers)).not.toMatch(/referer|cookie|authorization/iu);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });

  it.each([
    [200, answer, undefined],
    [200, { kind: 'search', reason: 'insufficient-evidence' }, undefined],
    [200, { kind: 'search', reason: 'unsupported-question' }, undefined],
    [200, { kind: 'search', reason: 'provider-disabled' }, undefined],
    [409, { kind: 'search', reason: 'release-mismatch' }, undefined],
    [400, { kind: 'error', code: 'invalid-response', retryable: false }, undefined],
    [413, { kind: 'error', code: 'invalid-response', retryable: false }, undefined],
    [415, { kind: 'error', code: 'invalid-response', retryable: false }, undefined],
    [422, { kind: 'error', code: 'invalid-response', retryable: false }, undefined],
    [429, { kind: 'error', code: 'rate-limited', retryable: true }, '20'],
    [503, { kind: 'error', code: 'timeout', retryable: true }, undefined],
    [503, { kind: 'error', code: 'unavailable', retryable: true }, undefined],
    [503, { kind: 'error', code: 'invalid-response', retryable: false }, undefined],
  ] as const)('accepts the frozen status/body pair %#', async (status, body, retryAfter) => {
    const headers = { ...releaseHeaders, ...(retryAfter ? { 'retry-after': retryAfter } : {}) };
    const provider = new HttpPublicAskProvider(binding, vi.fn<typeof fetch>().mockResolvedValue(
      response(body, status, headers),
    ));

    await expect(provider.ask('질문', { signal: new AbortController().signal })).resolves.toEqual(body);
  });

  it.each([
    [200, { kind: 'error', code: 'invalid-response', retryable: false }, undefined],
    [409, { kind: 'search', reason: 'unsupported-question' }, undefined],
    [400, { kind: 'search', reason: 'provider-disabled' }, undefined],
    [413, answer, undefined],
    [415, { kind: 'error', code: 'rate-limited', retryable: true }, '20'],
    [422, { kind: 'error', code: 'timeout', retryable: true }, undefined],
    [429, { kind: 'error', code: 'unavailable', retryable: true }, '20'],
    [503, answer, undefined],
  ] as const)('rejects a contract-shaped body on the wrong status %#', async (status, body, retryAfter) => {
    const headers = { ...releaseHeaders, ...(retryAfter ? { 'retry-after': retryAfter } : {}) };
    const provider = new HttpPublicAskProvider(binding, vi.fn<typeof fetch>().mockResolvedValue(
      response(body, status, headers),
    ));

    await expectTransportCode(provider.ask('질문', { signal: new AbortController().signal }), 'invalid-response');
  });

  it.each([undefined, '', '19', '20 ', '21'])('requires exact Retry-After 20 for a 429 (%s)', async (retryAfter) => {
    const headers = { ...releaseHeaders, ...(retryAfter === undefined ? {} : { 'retry-after': retryAfter }) };
    const apiResponse = response(
      { kind: 'error', code: 'rate-limited', retryable: true },
      429,
      headers,
    );
    if (retryAfter === '20 ') {
      Object.defineProperty(apiResponse, 'headers', {
        value: { get: (name: string) => name.toLowerCase() === 'retry-after' ? retryAfter : releaseHeaders[name as keyof typeof releaseHeaders] ?? null },
      });
    }
    const provider = new HttpPublicAskProvider(binding, vi.fn<typeof fetch>().mockResolvedValue(apiResponse));

    await expectTransportCode(provider.ask('질문', { signal: new AbortController().signal }), 'invalid-response');
  });

  it.each([
    ['empty body', new Response(null, { status: 200, headers: releaseHeaders })],
    ['HTML', new Response('<h1>proxy error</h1>', { status: 200, headers: releaseHeaders })],
    ['invalid JSON', new Response('{', { status: 200, headers: releaseHeaders })],
    ['unknown field', response({ kind: 'search', reason: 'provider-disabled', extra: true })],
    ['unknown status', response({ kind: 'search', reason: 'provider-disabled' }, 201)],
  ])('maps %s to the local invalid-response transport error', async (_label, invalidResponse) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(invalidResponse);
    const provider = new HttpPublicAskProvider(binding, fetchImpl);

    await expectTransportCode(provider.ask('질문', { signal: new AbortController().signal }), 'invalid-response');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps only the bounded proxy 502 to unavailable before JSON or binding checks', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>bad gateway</html>', {
      status: 502,
      headers: { 'x-content-release-id': 'wrong' },
    }));
    const provider = new HttpPublicAskProvider(binding, fetchImpl);

    await expectTransportCode(provider.ask('질문', { signal: new AbortController().signal }), 'unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ 'x-content-release-id': binding.contentReleaseId }],
    [{ 'x-answer-release-id': binding.answerReleaseId }],
    [{ ...releaseHeaders, 'x-content-release-id': 'f'.repeat(64) }],
    [{ ...releaseHeaders, 'x-answer-release-id': 'f'.repeat(64) }],
  ])('falls back deterministically when a valid API pair has a missing or mismatched release header', async (headers) => {
    const provider = new HttpPublicAskProvider(binding, vi.fn<typeof fetch>().mockResolvedValue(
      response({ kind: 'search', reason: 'provider-disabled' }, 200, headers),
    ));

    await expect(provider.ask('질문', { signal: new AbortController().signal })).resolves.toEqual({
      kind: 'search',
      reason: 'release-mismatch',
    });
  });

  it('falls back when an answer body carries another answer release ID', async () => {
    const provider = new HttpPublicAskProvider(binding, vi.fn<typeof fetch>().mockResolvedValue(
      response({ ...answer, answerReleaseId: 'f'.repeat(64) }),
    ));

    await expect(provider.ask('질문', { signal: new AbortController().signal })).resolves.toEqual({
      kind: 'search',
      reason: 'release-mismatch',
    });
  });

  it('maps a network failure to unavailable without retrying and preserves caller aborts', async () => {
    const networkError = new TypeError('network down');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkError);
    const provider = new HttpPublicAskProvider(binding, fetchImpl);
    await expectTransportCode(provider.ask('질문', { signal: new AbortController().signal }), 'unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    controller.abort();
    await expect(provider.ask('질문', { signal: controller.signal })).rejects.toBe(networkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses redirect:error so every redirect status blocks the POST body before a real second hop', async () => {
    let secondHopRequests = 0;
    const secondHop = createServer((_request, response) => {
      secondHopRequests += 1;
      response.statusCode = 204;
      response.end();
    });
    await new Promise<void>((resolve) => secondHop.listen(0, '127.0.0.1', resolve));
    const secondAddress = secondHop.address();
    if (!secondAddress || typeof secondAddress === 'string') throw new Error('second hop did not bind');
    const firstHopBodies: string[] = [];
    const firstHop = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        firstHopBodies.push(Buffer.concat(chunks).toString('utf8'));
        const status = Number(new URL(request.url ?? '/', 'http://first-hop.test').searchParams.get('status'));
        response.statusCode = status;
        response.setHeader('Location', `http://127.0.0.1:${secondAddress.port}/receiver`);
        response.end();
      });
    });
    await new Promise<void>((resolve) => firstHop.listen(0, '127.0.0.1', resolve));
    const firstAddress = firstHop.address();
    if (!firstAddress || typeof firstAddress === 'string') throw new Error('first hop did not bind');

    try {
      for (const status of [301, 302, 303, 307, 308]) {
        const fetchImpl: typeof fetch = (input, init) => globalThis.fetch(
          `http://127.0.0.1:${firstAddress.port}/api/public/ask?status=${status}`,
          init,
        );
        const provider = new HttpPublicAskProvider(binding, fetchImpl);
        await expectTransportCode(
          provider.ask('redirect-secret', { signal: new AbortController().signal }),
          'unavailable',
        );
      }
      expect(firstHopBodies).toHaveLength(5);
      expect(firstHopBodies.every((body) => body.includes('redirect-secret'))).toBe(true);
      expect(secondHopRequests).toBe(0);
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => firstHop.close(() => resolve())),
        new Promise<void>((resolve) => secondHop.close(() => resolve())),
      ]);
    }
  });

  it('exposes only the bounded transport codes', () => {
    expect(new PublicAskTransportError('timeout').code).toBe('timeout');
    expect(new PublicAskTransportError('unavailable').code).toBe('unavailable');
    expect(new PublicAskTransportError('invalid-response').code).toBe('invalid-response');
  });
});
