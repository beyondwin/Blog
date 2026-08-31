import {
  publicAskRequestSchema,
  publicAskResponseSchema,
  type PublicAskResponse,
} from '@beyondwin/contracts';

export interface PublicAnswerReleaseBinding {
  contentReleaseId: string;
  answerReleaseId: string;
}

export interface PublicAskProvider {
  ask(question: string, options: { signal: AbortSignal }): Promise<PublicAskResponse>;
}

export type PublicAskTransportCode = 'timeout' | 'unavailable' | 'invalid-response';

export class PublicAskTransportError extends Error {
  readonly code: PublicAskTransportCode;

  constructor(code: PublicAskTransportCode, cause?: unknown) {
    super(`Public ask transport failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = 'PublicAskTransportError';
    this.code = code;
  }
}

function isAllowedStatusBodyPair(
  status: number,
  body: PublicAskResponse,
  retryAfter: string | null,
): boolean {
  if (status === 200) {
    return body.kind === 'answer'
      || (body.kind === 'search' && body.reason !== 'release-mismatch');
  }
  if (status === 409) return body.kind === 'search' && body.reason === 'release-mismatch';
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return body.kind === 'error' && body.code === 'invalid-response' && body.retryable === false;
  }
  if (status === 429) {
    return body.kind === 'error'
      && body.code === 'rate-limited'
      && body.retryable === true
      && retryAfter === '20';
  }
  if (status === 503 && body.kind === 'error') {
    return (body.retryable === true && (body.code === 'timeout' || body.code === 'unavailable'))
      || (body.retryable === false && body.code === 'invalid-response');
  }
  return false;
}

export class HttpPublicAskProvider implements PublicAskProvider {
  constructor(
    private readonly binding: PublicAnswerReleaseBinding,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async ask(question: string, { signal }: { signal: AbortSignal }): Promise<PublicAskResponse> {
    const request = publicAskRequestSchema.parse({ version: 1, question, ...this.binding });
    let response: Response;
    try {
      response = await this.fetchImpl('/api/public/ask', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PublicAskTransportError('unavailable', error);
    }

    if (response.status === 502) throw new PublicAskTransportError('unavailable');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new PublicAskTransportError('invalid-response', error);
    }
    const parsed = publicAskResponseSchema.safeParse(payload);
    if (!parsed.success) throw new PublicAskTransportError('invalid-response', parsed.error);
    if (!isAllowedStatusBodyPair(response.status, parsed.data, response.headers.get('retry-after'))) {
      throw new PublicAskTransportError('invalid-response');
    }

    const contentReleaseId = response.headers.get('x-content-release-id');
    const answerReleaseId = response.headers.get('x-answer-release-id');
    if (contentReleaseId !== this.binding.contentReleaseId
      || answerReleaseId !== this.binding.answerReleaseId
      || (parsed.data.kind === 'answer' && parsed.data.answerReleaseId !== this.binding.answerReleaseId)) {
      return { kind: 'search', reason: 'release-mismatch' };
    }
    return parsed.data;
  }
}
