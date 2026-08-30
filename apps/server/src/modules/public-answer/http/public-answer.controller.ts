import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { publicAskResponseSchema, type PublicAskRequest, type PublicAskResponse } from '@beyondwin/contracts/public-answer';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ServerConfig } from '../../../config/server-config.js';
import { RuntimeReadiness } from '../../../health/runtime-readiness.js';
import { HttpBoundaryError } from '../../../http/bounded-error.filter.js';
import { createRequestId } from '../../../http/request-id.js';
import { RuntimeLifecycle } from '../../../lifecycle/runtime-lifecycle.js';
import { TrustedProxyNetworkKey } from '../../../security/network-key.js';
import { AnswerPublicQuestion } from '../application/answer-public-question.js';
import type { AnswerReleaseCatalogSource } from '../application/ports/answer-release-catalog.js';
import { PUBLIC_ANSWER_REQUEST_TIMEOUT_MS } from '../application/ports/usage-guard.js';
import { PublicAnswerDeadlineError, PublicAnswerInvalidResponseError } from '../domain/public-answer-errors.js';
import type { PublicAnswerOutcome } from '../domain/public-answer.js';
import { PUBLIC_ANSWER_TOKENS } from '../public-answer.tokens.js';
import { PublicAnswerPipe } from './public-answer.pipe.js';

const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/iu;

function responseFor(outcome: PublicAnswerOutcome): PublicAskResponse {
  const candidate: unknown = outcome.kind === 'answer' ? {
    kind: 'answer',
    answerReleaseId: outcome.answerReleaseId,
    claims: outcome.claims.map((claim) => ({ id: claim.claimId, text: claim.text, evidenceIds: [...claim.evidenceIds] })),
    evidence: outcome.evidence.map(({ answerReleaseId: _release, ...evidence }) => ({
      ...evidence,
      locator: { ...evidence.locator },
    })),
  } : outcome.kind === 'search' ? { kind: 'search', reason: outcome.reason } : outcome;
  const parsed = publicAskResponseSchema.safeParse(candidate);
  if (!parsed.success) throw new PublicAnswerInvalidResponseError('public answer response contract failed');
  return parsed.data;
}

function responseStatus(outcome: PublicAnswerOutcome): number {
  if (outcome.kind === 'search' && outcome.reason === 'release-mismatch') return 409;
  if (outcome.kind !== 'error') return 200;
  if (outcome.code === 'rate-limited') return 429;
  return 503;
}

@Controller('api/public')
export class PublicAnswerController {
  constructor(
    @Inject(PUBLIC_ANSWER_TOKENS.CONFIG) private readonly config: Readonly<ServerConfig>,
    @Inject(PUBLIC_ANSWER_TOKENS.ANSWER_RELEASE_CATALOG_SOURCE)
    private readonly catalogSource: AnswerReleaseCatalogSource,
    @Inject(AnswerPublicQuestion) private readonly useCase: Pick<AnswerPublicQuestion, 'execute'>,
    @Inject(TrustedProxyNetworkKey) private readonly networkKey: TrustedProxyNetworkKey,
    @Inject(RuntimeReadiness) private readonly readiness: RuntimeReadiness,
    @Inject(RuntimeLifecycle) private readonly lifecycle: RuntimeLifecycle,
    @Inject(PublicAnswerPipe) private readonly requestPipe: PublicAnswerPipe,
  ) {}

  @Post('ask')
  async ask(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const contentType = request.headers['content-type'];
    if (typeof contentType !== 'string' || !JSON_MEDIA_TYPE.test(contentType)) {
      throw new HttpBoundaryError(415, 'public answer requires UTF-8 JSON');
    }
    this.assertBrowserOrigin(request);
    const body: PublicAskRequest = this.requestPipe.transform(rawBody);
    if (!this.lifecycle.acceptingRequests()) throw new PublicAnswerDeadlineError('runtime is shutting down');

    const controller = new AbortController();
    const finishLifecycle = this.lifecycle.beginRequest(controller);
    const deadline = performance.now() + PUBLIC_ANSWER_REQUEST_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(new PublicAnswerDeadlineError('public answer deadline elapsed')),
      Math.max(0, deadline - performance.now()));
    timeout.unref();
    const rawRequest = request.raw;
    const rawReply = reply.raw;
    const disconnect = () => controller.abort(new Error('public answer client disconnected'));
    const responseClose = () => { if (!rawReply.writableEnded) disconnect(); };
    rawRequest.once('aborted', disconnect);
    rawReply.once('close', responseClose);
    if (rawRequest.aborted || rawRequest.complete === false) disconnect();

    try {
      const catalog = await this.catalogSource.snapshot(controller.signal);
      reply.header('X-Content-Release-Id', catalog.contentReleaseId);
      reply.header('X-Answer-Release-Id', catalog.answerReleaseId);
      const peerAddress = rawRequest.socket.remoteAddress ?? (this.config.nodeEnv === 'test' ? '127.0.0.1' : '');
      const networkKey = this.networkKey.derive({
        peerAddress,
        xForwardedFor: request.headers['x-forwarded-for'],
      });
      const outcome = await this.useCase.execute({
        requestId: createRequestId(),
        question: body.question,
        contentReleaseId: body.contentReleaseId,
        answerReleaseId: body.answerReleaseId,
        networkKey,
        signal: controller.signal,
        catalog,
      });
      const status = responseStatus(outcome);
      if (outcome.kind === 'error' && outcome.code === 'rate-limited') reply.header('Retry-After', '20');
      reply.status(status).send(responseFor(outcome));
    } finally {
      clearTimeout(timeout);
      rawRequest.removeListener('aborted', disconnect);
      rawReply.removeListener('close', responseClose);
      finishLifecycle();
    }
  }

  private assertBrowserOrigin(request: FastifyRequest): void {
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];
    if (origin === undefined && fetchSite === undefined) return;
    if (typeof origin !== 'string' || origin !== this.config.publicOrigin || fetchSite !== 'same-origin') {
      throw new HttpBoundaryError(400, 'browser origin is invalid');
    }
  }
}
