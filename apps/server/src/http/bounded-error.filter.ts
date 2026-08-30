import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { publicAskResponseSchema, type PublicAskResponse } from '@beyondwin/contracts/public-answer';
import type { FastifyReply } from 'fastify';

import type { RuntimeReadiness } from '../health/runtime-readiness.js';
import { PublicAnswerPortError } from '../modules/public-answer/domain/public-answer-errors.js';

export class HttpBoundaryError extends Error {
  constructor(readonly statusCode: 400 | 415 | 422, message: string) {
    super(message);
    this.name = 'HttpBoundaryError';
  }
}

function boundedError(error: unknown): Readonly<{ status: number; body: PublicAskResponse; retryAfter?: string }> {
  if (error instanceof HttpBoundaryError) {
    return { status: error.statusCode, body: { kind: 'error', code: 'invalid-response', retryable: false } };
  }
  if (error instanceof PublicAnswerPortError) {
    if (error.kind === 'rate-limit' || error.kind === 'concurrency' || error.kind === 'cost-limit') {
      return { status: 429, body: { kind: 'error', code: 'rate-limited', retryable: true }, retryAfter: '20' };
    }
    if (error.kind === 'deadline') return { status: 503, body: { kind: 'error', code: 'timeout', retryable: true } };
    if (error.kind === 'invalid-response') {
      return { status: 503, body: { kind: 'error', code: 'invalid-response', retryable: false } };
    }
    return { status: 503, body: { kind: 'error', code: 'unavailable', retryable: true } };
  }
  const fastify = error as { code?: string; statusCode?: number; getStatus?: () => number };
  const status = typeof fastify?.getStatus === 'function' ? fastify.getStatus() : fastify?.statusCode;
  if (fastify?.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
    return { status: 400, body: { kind: 'error', code: 'invalid-response', retryable: false } };
  }
  if (fastify?.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || status === 415) {
    return { status: 415, body: { kind: 'error', code: 'invalid-response', retryable: false } };
  }
  if (fastify?.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || status === 413) {
    return { status: 413, body: { kind: 'error', code: 'invalid-response', retryable: false } };
  }
  if (status === 400) {
    return { status: 400, body: { kind: 'error', code: 'invalid-response', retryable: false } };
  }
  return { status: 503, body: { kind: 'error', code: 'unavailable', retryable: true } };
}

@Catch()
export class BoundedErrorFilter implements ExceptionFilter {
  constructor(private readonly readiness: RuntimeReadiness) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const bounded = boundedError(error);
    const binding = this.readiness.startupBinding();
    if (binding) {
      response.header('X-Content-Release-Id', binding.contentReleaseId);
      response.header('X-Answer-Release-Id', binding.answerReleaseId);
    }
    if (bounded.retryAfter) response.header('Retry-After', bounded.retryAfter);
    response.status(bounded.status).send(publicAskResponseSchema.parse(bounded.body));
  }
}
