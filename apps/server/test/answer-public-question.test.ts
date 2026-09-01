import { describe, expect, it } from 'vitest';
import { AnswerPublicQuestion } from '../src/modules/public-answer/application/answer-public-question.js';
import type {
  AnswerReleaseCatalogSnapshot,
} from '../src/modules/public-answer/application/ports/answer-release-catalog.js';
import type { AnswerGenerator } from '../src/modules/public-answer/application/ports/answer-generator.js';
import type {
  PublicAnswerEvent,
  PublicAnswerEventSink,
} from '../src/modules/public-answer/application/ports/event-sink.js';
import type { Retriever } from '../src/modules/public-answer/application/ports/retriever.js';
import type {
  DeterministicAnswerVerifier,
  SemanticAnswerVerifier,
  SupportedSentenceUnit,
} from '../src/modules/public-answer/application/ports/answer-verifier.js';
import type {
  GenerationLease,
  ProviderStage,
  ProviderTokenUsage,
  UsageGuard,
  UsageLease,
} from '../src/modules/public-answer/application/ports/usage-guard.js';
import {
  PublicAnswerConcurrencyError,
  PublicAnswerCostLimitError,
  PublicAnswerDeadlineError,
  PublicAnswerInvalidResponseError,
  PublicAnswerRateLimitError,
  PublicAnswerTransportError,
} from '../src/modules/public-answer/domain/public-answer-errors.js';
import type {
  AnswerPublicQuestionCommand,
  AuthorizedEvidence,
  GeneratedClaim,
  PublicAnswerOutcome,
} from '../src/modules/public-answer/domain/public-answer.js';
import { PUBLIC_ANSWER_TOKENS } from '../src/modules/public-answer/public-answer.tokens.js';
import { InMemoryRedactedEventSink } from '../src/modules/public-answer/infrastructure/fixture/in-memory-redacted-event-sink.js';

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0 } as const;
const EMBEDDING_USAGE = { inputTokens: 13, outputTokens: 0 } as const;
const GENERATION_USAGE = { inputTokens: 21, outputTokens: 8 } as const;
const SEMANTIC_USAGE = { inputTokens: 9, outputTokens: 3 } as const;

const EVIDENCE: AuthorizedEvidence = Object.freeze({
  evidenceId: 'evidence-1',
  chunkId: 'chunk-1',
  answerReleaseId: 'answer-release-abcdefghijklmnopqrstuvwxyz',
  recordId: 'record-1',
  collectionLabel: '기록',
  recordTitle: '검증 가능한 기록',
  canonicalPath: '/articles/verified-record/',
  locator: Object.freeze({ kind: 'heading-paragraph', label: '근거', ordinal: 1 }),
  excerpt: '공개 기록에 담긴 검증 가능한 근거입니다.',
  excerptChecksum: 'sha256:evidence',
});

const CLAIM: GeneratedClaim = Object.freeze({
  claimId: 'claim-1',
  text: '검증 가능한 답변입니다.',
  evidenceIds: Object.freeze(['evidence-1']),
});

function catalog(overrides: Partial<AnswerReleaseCatalogSnapshot> = {}): AnswerReleaseCatalogSnapshot {
  const snapshot: AnswerReleaseCatalogSnapshot = {
    bindingId: 'binding-1',
    contentReleaseId: 'content-release-abcdefghijklmnopqrstuvwxyz',
    answerReleaseId: 'answer-release-abcdefghijklmnopqrstuvwxyz',
    corpusApprovalHash: 'sha256:approval',
    chunkCount: 1,
    isBoundTo(contentReleaseId, answerReleaseId) {
      return contentReleaseId === this.contentReleaseId && answerReleaseId === this.answerReleaseId;
    },
    evidenceFor(ids) {
      return ids.includes(EVIDENCE.evidenceId) ? [EVIDENCE] : [];
    },
    hasAuthorizedEvidenceLocation() { return true; },
    ...overrides,
  };
  return Object.freeze(snapshot);
}

function command(overrides: Partial<AnswerPublicQuestionCommand> = {}): AnswerPublicQuestionCommand {
  const snapshot = overrides.catalog ?? catalog();
  return {
    requestId: 'request-secret-123',
    question: '이 기록의 핵심은 무엇인가요?',
    contentReleaseId: snapshot.contentReleaseId,
    answerReleaseId: snapshot.answerReleaseId,
    networkKey: 'network-secret-456',
    signal: new AbortController().signal,
    deadlineAt: performance.now() + 12_000,
    catalog: snapshot,
    ...overrides,
  };
}

interface HarnessOptions {
  mode?: 'disabled' | 'fixture' | 'provider';
  retrieval?: {
    evidence: readonly AuthorizedEvidence[];
    sufficient: boolean;
    candidateCount: number;
    usage: ProviderTokenUsage;
  };
  retrieveError?: Error;
  generatedClaims?: readonly GeneratedClaim[];
  generationError?: Error;
  deterministicResult?: ReturnType<DeterministicAnswerVerifier['verify']>;
  semanticResult?: Awaited<ReturnType<SemanticAnswerVerifier['verify']>>;
  semanticError?: Error;
  guardError?: Error;
  generationLeaseError?: Error;
  eventSink?: PublicAnswerEventSink;
  clock?: () => number;
}

function harness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const retrievalInputs: Parameters<Retriever['retrieve']>[0][] = [];
  const generatorInputs: Parameters<AnswerGenerator['generate']>[0][] = [];
  const deterministicInputs: Parameters<DeterministicAnswerVerifier['verify']>[0][] = [];
  const semanticInputs: Parameters<SemanticAnswerVerifier['verify']>[0][] = [];
  const stages = {
    begun: [] as ProviderStage[],
    settled: [] as Array<{ stage: ProviderStage; usage: ProviderTokenUsage }>,
  };
  const events: PublicAnswerEvent[] = [];

  const generationLease: GenerationLease = {
    release() {
      calls.push('generation.release');
    },
  };
  const usageLease: UsageLease = {
    async acquireGeneration() {
      calls.push('generation.acquire');
      if (options.generationLeaseError) throw options.generationLeaseError;
      return generationLease;
    },
    beginStage(stage) {
      calls.push(`stage.${stage}.begin`);
      stages.begun.push(stage);
    },
    settleStage(stage, usage) {
      calls.push(`stage.${stage}.settle`);
      stages.settled.push({ stage, usage });
    },
    async release() {
      calls.push('usage.release');
    },
  };
  const usageGuard: UsageGuard = {
    async acquire() {
      calls.push('usage.acquire');
      if (options.guardError) throw options.guardError;
      return usageLease;
    },
  };
  const retriever: Retriever = {
    async retrieve(input) {
      calls.push('retrieve');
      retrievalInputs.push(input);
      if (options.retrieveError) throw options.retrieveError;
      return options.retrieval ?? {
        evidence: [EVIDENCE],
        sufficient: true,
        candidateCount: 1,
        usage: EMBEDDING_USAGE,
      };
    },
  };
  const generator: AnswerGenerator = {
    async generate(input) {
      calls.push('generate');
      generatorInputs.push(input);
      if (options.generationError) throw options.generationError;
      return { claims: options.generatedClaims ?? [CLAIM], usage: GENERATION_USAGE };
    },
  };
  const sentenceUnits: readonly SupportedSentenceUnit[] = Object.freeze([{
    id: 'sentence-1',
    claimId: CLAIM.claimId,
    text: CLAIM.text,
    evidenceIds: CLAIM.evidenceIds,
    critical: true,
  }]);
  const deterministicVerifier: DeterministicAnswerVerifier = {
    verify(input) {
      calls.push('deterministic.verify');
      deterministicInputs.push(input);
      return options.deterministicResult ?? { ok: true, sentenceUnits };
    },
  };
  const semanticVerifier: SemanticAnswerVerifier = {
    async verify(input) {
      calls.push('semantic.verify');
      semanticInputs.push(input);
      if (options.semanticError) throw options.semanticError;
      return options.semanticResult ?? {
        supportedSentenceIds: ['sentence-1'],
        contradictedSentenceIds: [],
        usage: SEMANTIC_USAGE,
      };
    },
  };
  const eventSink: PublicAnswerEventSink = options.eventSink ?? {
    record(event) {
      calls.push('event.record');
      events.push(event);
    },
  };

  let now = 1_788_048_000_000;
  const useCase = new AnswerPublicQuestion({
    policy: Object.freeze({ mode: options.mode ?? 'fixture' }),
    retriever,
    generator,
    deterministicVerifier,
    semanticVerifier,
    usageGuard,
    eventSink,
    clock: options.clock ?? (() => {
      const value = now;
      now += 175;
      return value;
    }),
  });

  return {
    calls,
    deterministicInputs,
    events,
    generatorInputs,
    retrievalInputs,
    semanticInputs,
    stages,
    useCase,
  };
}

async function expectSearch(
  actual: Promise<PublicAnswerOutcome>,
  reason: Extract<PublicAnswerOutcome, { kind: 'search' }>['reason'],
): Promise<void> {
  expect(await actual).toEqual({
    kind: 'search',
    reason,
    answerReleaseId: 'answer-release-abcdefghijklmnopqrstuvwxyz',
  });
}

describe('AnswerPublicQuestion', () => {
  it('returns release mismatch before usage or provider work and uses only the command snapshot', async () => {
    const h = harness();
    const snapshot = catalog();

    await expectSearch(h.useCase.execute(command({
      catalog: snapshot,
      answerReleaseId: 'stale-answer-release',
    })), 'release-mismatch');

    expect(h.calls).toEqual(['event.record']);
    expect(h.events).toHaveLength(1);
  });

  it.each(['', ' \n\t ', '---', '\u0000\u001f'])('rejects control or format-only question %j before usage', async (question) => {
    const h = harness();

    await expectSearch(h.useCase.execute(command({ question })), 'unsupported-question');

    expect(h.calls).toEqual(['event.record']);
  });

  it('returns provider disabled without acquiring usage', async () => {
    const h = harness({ mode: 'disabled' });

    await expectSearch(h.useCase.execute(command()), 'provider-disabled');

    expect(h.calls).toEqual(['event.record']);
  });

  it('returns insufficient evidence for an empty verified snapshot with no guard or provider calls', async () => {
    const h = harness();
    const emptyCatalog = catalog({ chunkCount: 0 });

    await expectSearch(h.useCase.execute(command({ catalog: emptyCatalog })), 'insufficient-evidence');

    expect(h.calls).toEqual(['event.record']);
  });

  it('settles embedding once and skips generation when retrieval is insufficient', async () => {
    const h = harness({
      retrieval: { evidence: [], sufficient: false, candidateCount: 4, usage: EMBEDDING_USAGE },
    });

    await expectSearch(h.useCase.execute(command()), 'insufficient-evidence');

    expect(h.calls).toEqual([
      'usage.acquire',
      'stage.embedding.begin',
      'retrieve',
      'stage.embedding.settle',
      'event.record',
      'usage.release',
    ]);
    expect(h.stages.settled).toEqual([{ stage: 'embedding', usage: EMBEDDING_USAGE }]);
  });

  it('resolves retrieved IDs through the command catalog and never generates from removed evidence', async () => {
    const removedEvidence = { ...EVIDENCE, evidenceId: 'removed-evidence' };
    const h = harness({
      retrieval: {
        evidence: [removedEvidence],
        sufficient: true,
        candidateCount: 1,
        usage: EMBEDDING_USAGE,
      },
    });

    await expectSearch(h.useCase.execute(command()), 'insufficient-evidence');

    expect(h.calls).not.toContain('generation.acquire');
    expect(h.calls).not.toContain('generate');
    expect(h.calls.at(-1)).toBe('usage.release');
  });

  it('rebuilds a valid retriever ID from canonical catalog evidence across every downstream boundary', async () => {
    const canonicalEvidence: AuthorizedEvidence = Object.freeze({
      ...EVIDENCE,
      canonicalPath: '/articles/canonical-record/',
      locator: Object.freeze({ kind: 'evidence-page', label: '정본 근거', ordinal: 7 }),
      excerpt: '카탈로그가 승인한 정본 발췌입니다.',
      excerptChecksum: 'sha256:canonical',
    });
    const forgedEvidence: AuthorizedEvidence = Object.freeze({
      ...canonicalEvidence,
      canonicalPath: '/forged-retriever-path/',
      locator: Object.freeze({ kind: 'heading-paragraph', label: 'FORGED', ordinal: 999 }),
      excerpt: 'FORGED RETRIEVER EXCERPT',
      excerptChecksum: 'sha256:forged',
    });
    const snapshot = catalog({
      evidenceFor(ids) {
        return ids.includes(canonicalEvidence.evidenceId) ? [canonicalEvidence] : [];
      },
    });
    const h = harness({
      retrieval: {
        evidence: [forgedEvidence],
        sufficient: true,
        candidateCount: 1,
        usage: EMBEDDING_USAGE,
      },
    });

    const outcome = await h.useCase.execute(command({ catalog: snapshot }));

    expect(outcome.kind).toBe('answer');
    if (outcome.kind !== 'answer') throw new Error('expected answer outcome');
    expect(h.generatorInputs[0]?.evidence[0]).toBe(canonicalEvidence);
    expect(h.deterministicInputs[0]?.evidence[0]).toBe(canonicalEvidence);
    expect(h.semanticInputs[0]?.evidence[0]).toBe(canonicalEvidence);
    expect(outcome.evidence[0]).toBe(canonicalEvidence);
    expect(JSON.stringify({
      generator: h.generatorInputs,
      deterministic: h.deterministicInputs,
      semantic: h.semanticInputs,
      outcome,
    })).not.toContain('FORGED');
    expect(JSON.stringify(outcome)).not.toContain('/forged-retriever-path/');
    expect(JSON.stringify(outcome)).not.toContain('sha256:forged');
  });

  it('uses the identical request catalog through retrieval and returns an answer after all stages settle', async () => {
    const h = harness();
    const snapshot = catalog();

    const outcome = await h.useCase.execute(command({ catalog: snapshot }));

    expect(outcome).toEqual({
      kind: 'answer',
      answerReleaseId: snapshot.answerReleaseId,
      claims: [CLAIM],
      evidence: [EVIDENCE],
    });
    expect(h.retrievalInputs).toEqual([{
      question: '이 기록의 핵심은 무엇인가요?',
      catalog: snapshot,
      limit: 6,
      signal: expect.any(AbortSignal),
      deadlineAt: expect.any(Number),
    }]);
    expect(h.retrievalInputs[0]?.catalog).toBe(snapshot);
    expect(h.deterministicInputs[0]?.catalog).toBe(snapshot);
    expect(h.calls).toEqual([
      'usage.acquire',
      'stage.embedding.begin',
      'retrieve',
      'stage.embedding.settle',
      'generation.acquire',
      'stage.generation.begin',
      'generate',
      'stage.generation.settle',
      'deterministic.verify',
      'stage.semantic.begin',
      'semantic.verify',
      'stage.semantic.settle',
      'event.record',
      'generation.release',
      'usage.release',
    ]);
    expect(h.stages.settled).toEqual([
      { stage: 'embedding', usage: EMBEDDING_USAGE },
      { stage: 'generation', usage: GENERATION_USAGE },
      { stage: 'semantic', usage: SEMANTIC_USAGE },
    ]);
  });

  it('rebuilds the public evidence as the unique citation union', async () => {
    const claims = [CLAIM, Object.freeze({ ...CLAIM, claimId: 'claim-2' })];
    const duplicateCatalog = catalog({
      evidenceFor(ids) {
        return ids.flatMap((id) => id === EVIDENCE.evidenceId ? [EVIDENCE] : []);
      },
    });
    const h = harness({ generatedClaims: claims });

    const outcome = await h.useCase.execute(command({ catalog: duplicateCatalog }));

    expect(outcome).toMatchObject({ kind: 'answer', claims, evidence: [EVIDENCE] });
    expect(h.deterministicInputs[0]?.evidence).toEqual([EVIDENCE]);
    expect(h.semanticInputs[0]?.evidence).toEqual([EVIDENCE]);
  });

  it('maps deterministic verification failure to insufficient evidence without semantic work', async () => {
    const h = harness({ deterministicResult: { ok: false, reason: 'unsupported evidence' } });

    await expectSearch(h.useCase.execute(command()), 'insufficient-evidence');

    expect(h.calls).toEqual([
      'usage.acquire',
      'stage.embedding.begin',
      'retrieve',
      'stage.embedding.settle',
      'generation.acquire',
      'stage.generation.begin',
      'generate',
      'stage.generation.settle',
      'deterministic.verify',
      'event.record',
      'generation.release',
      'usage.release',
    ]);
  });

  it.each([
    ['unknown support ID', ['sentence-1', 'sentence-unknown'], []],
    ['duplicate support ID', ['sentence-1', 'sentence-1'], []],
    ['unknown contradiction ID', ['sentence-1'], ['sentence-unknown']],
    ['duplicate contradiction ID', ['sentence-1'], ['sentence-1', 'sentence-1']],
    ['contradiction', ['sentence-1'], ['sentence-1']],
  ] as const)('rejects %s from semantic verification', async (_label, supportedSentenceIds, contradictedSentenceIds) => {
    const h = harness({
      semanticResult: { supportedSentenceIds, contradictedSentenceIds, usage: SEMANTIC_USAGE },
    });

    await expectSearch(h.useCase.execute(command()), 'insufficient-evidence');

    expect(h.stages.settled.at(-1)).toEqual({ stage: 'semantic', usage: SEMANTIC_USAGE });
    expect(h.calls.slice(-3)).toEqual(['event.record', 'generation.release', 'usage.release']);
  });

  it.each([
    ['0.949', 'x'.repeat(949), `y${' '.repeat(50)}`, 0],
    ['0.95', `${'x'.repeat(900)}${' '.repeat(50)}`, 'y'.repeat(50), 1],
  ])('applies the %s character boundary before the critical-unit 1.00 rule', async (
    _ratio,
    supportedText,
    unsupportedText,
    expectedCriticalChecks,
  ) => {
    let criticalChecks = 0;
    const units = [
      { id: 'supported', claimId: 'claim-1', text: supportedText, evidenceIds: ['evidence-1'], critical: true },
      {
        id: 'unsupported',
        claimId: 'claim-1',
        text: unsupportedText,
        evidenceIds: ['evidence-1'],
        get critical(): true {
          criticalChecks += 1;
          return true;
        },
      },
    ] as const satisfies readonly SupportedSentenceUnit[];
    const h = harness({
      deterministicResult: { ok: true, sentenceUnits: units },
      semanticResult: {
        supportedSentenceIds: ['supported'],
        contradictedSentenceIds: [],
        usage: SEMANTIC_USAGE,
      },
    });

    await expectSearch(h.useCase.execute(command()), 'insufficient-evidence');
    expect(criticalChecks).toBe(expectedCriticalChecks);
  });

  it('accepts exact 1.00 critical coverage', async () => {
    const h = harness();

    expect((await h.useCase.execute(command())).kind).toBe('answer');
  });

  it.each([
    [
      'embedding',
      { retrieveError: new PublicAnswerTransportError('embedding transport') },
      ['embedding'],
      [],
    ],
    [
      'generation',
      { generationError: new PublicAnswerTransportError('generation transport') },
      ['embedding', 'generation'],
      ['embedding'],
    ],
    [
      'semantic',
      { semanticError: new PublicAnswerTransportError('semantic transport') },
      ['embedding', 'generation', 'semantic'],
      ['embedding', 'generation'],
    ],
  ] as const)('leaves attempted %s begun but unsettled and refunds only never-begun later stages', async (
    stage,
    overrides,
    expectedBegun,
    expectedSettled,
  ) => {
    const h = harness(overrides);

    expect(await h.useCase.execute(command())).toEqual({
      kind: 'error',
      code: 'unavailable',
      retryable: true,
    });

    expect(h.stages.begun).toEqual(expectedBegun);
    expect(h.stages.settled.map((entry) => entry.stage)).toEqual(expectedSettled);
    if (stage === 'embedding') {
      expect(h.calls).not.toContain('generation.acquire');
    } else {
      expect(h.calls.slice(-2)).toEqual(['generation.release', 'usage.release']);
    }
    expect(h.calls.at(-1)).toBe('usage.release');
  });

  it('releases usage but no generation lease when generation concurrency acquisition is rejected', async () => {
    const h = harness({ generationLeaseError: new PublicAnswerConcurrencyError('busy') });

    expect(await h.useCase.execute(command())).toEqual({
      kind: 'error',
      code: 'rate-limited',
      retryable: true,
    });

    expect(h.stages.begun).toEqual(['embedding']);
    expect(h.stages.settled.map((entry) => entry.stage)).toEqual(['embedding']);
    expect(h.calls).not.toContain('generation.release');
    expect(h.calls.at(-1)).toBe('usage.release');
  });

  it.each([
    ['rate', new PublicAnswerRateLimitError('rate', 'network-hour'), 'rate-limited', true, 'rate-limit', 'network-hour'],
    ['concurrency', new PublicAnswerConcurrencyError('concurrency'), 'rate-limited', true, 'concurrency', 'concurrency'],
    ['deadline', new PublicAnswerDeadlineError('deadline'), 'timeout', true, 'deadline', 'admitted'],
    ['transport', new PublicAnswerTransportError('transport'), 'unavailable', true, 'transport', 'admitted'],
    ['malformed', new PublicAnswerInvalidResponseError('malformed'), 'invalid-response', false, 'invalid-response', 'admitted'],
  ] as const)('maps typed %s error without leaking its message', async (_kind, error, code, retryable, errorKind, rateBucket) => {
    const h = harness({ guardError: error });

    expect(await h.useCase.execute(command())).toEqual({ kind: 'error', code, retryable });

    expect(h.calls).toEqual(['usage.acquire', 'event.record']);
    expect(h.events).toEqual([expect.objectContaining({ errorKind, rateBucket })]);
  });

  it('maps monthly cost-limit exhaustion to budget-exhausted search without leaking the error message', async () => {
    const h = harness({ guardError: new PublicAnswerCostLimitError('secret-cost-limit-message') });

    await expectSearch(h.useCase.execute(command()), 'budget-exhausted');

    expect(h.calls).toEqual(['usage.acquire', 'event.record']);
    expect(h.events).toEqual([expect.objectContaining({
      resultKind: 'budget-exhausted',
      errorKind: 'cost-limit',
      rateBucket: 'global-day',
    })]);
    expect(JSON.stringify(h.events[0])).not.toContain('secret-cost-limit-message');
  });

  it('awaits an asynchronous usage lease release before returning', async () => {
    let releaseCompleted = false;
    const useCase = new AnswerPublicQuestion({
      policy: Object.freeze({ mode: 'fixture' }),
      retriever: {
        async retrieve() {
          return { evidence: [EVIDENCE], sufficient: false, candidateCount: 0, usage: ZERO_USAGE };
        },
      },
      generator: { async generate() { throw new Error('unused'); } },
      deterministicVerifier: { verify() { throw new Error('unused'); } },
      semanticVerifier: { async verify() { throw new Error('unused'); } },
      usageGuard: {
        async acquire() {
          return {
            async acquireGeneration() { throw new Error('unused'); },
            beginStage() {},
            settleStage() {},
            async release() {
              await new Promise<void>((resolve) => { setImmediate(resolve); });
              releaseCompleted = true;
            },
          };
        },
      },
      eventSink: { record() {} },
    });

    await expectSearch(useCase.execute(command()), 'insufficient-evidence');
    expect(releaseCompleted).toBe(true);
  });

  it('records one strictly allowlisted event without question, address, claims, evidence, URL, or path', async () => {
    const h = harness();

    await h.useCase.execute(command());

    expect(h.events).toHaveLength(1);
    expect(Object.keys(h.events[0] ?? {}).sort()).toEqual([
      'answerReleasePrefix',
      'contentReleasePrefix',
      'errorKind',
      'expiresAt',
      'latencyBucket',
      'occurredAt',
      'providerInputBucket',
      'providerOutputBucket',
      'rateBucket',
      'requestId',
      'resultKind',
      'retrievedCount',
    ]);
    expect(h.events[0]).toMatchObject({
      requestId: 'request-secret-123',
      contentReleasePrefix: 'content-rele',
      answerReleasePrefix: 'answer-relea',
      resultKind: 'answer',
      errorKind: null,
      latencyBucket: '<250ms',
      providerInputBucket: '1-999',
      providerOutputBucket: '1-999',
      rateBucket: 'admitted',
      retrievedCount: 1,
    });
    expect(JSON.stringify(h.events[0])).not.toContain('이 기록의 핵심');
    expect(JSON.stringify(h.events[0])).not.toContain('network-secret');
    expect(JSON.stringify(h.events[0])).not.toContain('/articles/');
  });

  it('composes directly with the in-memory redacted sink through the application port', async () => {
    const sink: PublicAnswerEventSink & InMemoryRedactedEventSink = new InMemoryRedactedEventSink();
    const h = harness({ eventSink: sink });
    await h.useCase.execute(command());
    expect(sink.events()).toEqual([expect.objectContaining({ resultKind: 'answer', errorKind: null,
      latencyBucket: '<250ms', providerInputBucket: '1-999', providerOutputBucket: '1-999', rateBucket: 'admitted' })]);
  });

  it.each([12_000, 12_001, 120_000])('preserves the original outcome and records 8-12s at trusted elapsed %dms', async (elapsed) => {
    const startedAt = Date.parse('2026-08-30T00:00:00.000Z'); let calls = 0;
    const sink = new InMemoryRedactedEventSink();
    const h = harness({ eventSink: sink, clock: () => calls++ === 0 ? startedAt : startedAt + elapsed });
    await expectSearch(h.useCase.execute(command({ answerReleaseId: 'stale-answer-release' })), 'release-mismatch');
    expect(sink.events()).toEqual([expect.objectContaining({ resultKind: 'release-mismatch', latencyBucket: '8-12s' })]);
  });

  it('does not let a synchronous sink failure replace an answer or deterministic fallback', async () => {
    const sink: PublicAnswerEventSink = { record() { throw new Error('telemetry sink failed'); } };
    const answer = harness({ eventSink: sink });
    await expect(answer.useCase.execute(command())).resolves.toMatchObject({ kind: 'answer' });
    const fallback = harness({ eventSink: sink });
    await expectSearch(fallback.useCase.execute(command({ answerReleaseId: 'stale-answer-release' })), 'release-mismatch');
  });

  it('always releases the usage lease when an unexpected verifier exception escapes mapping', async () => {
    const h = harness({ semanticError: new Error('programmer bug') });

    await expect(h.useCase.execute(command())).rejects.toThrow('programmer bug');

    expect(h.calls.slice(-2)).toEqual(['generation.release', 'usage.release']);
  });

  it('settles trusted zero-token usage rather than treating it as an absent reservation', async () => {
    const h = harness({
      retrieval: { evidence: [], sufficient: false, candidateCount: 0, usage: ZERO_USAGE },
    });

    await h.useCase.execute(command());

    expect(h.stages.settled).toEqual([{ stage: 'embedding', usage: ZERO_USAGE }]);
  });

  it('exposes only the exact frozen dependency-injection symbols', () => {
    expect(Object.isFrozen(PUBLIC_ANSWER_TOKENS)).toBe(true);
    expect(Object.keys(PUBLIC_ANSWER_TOKENS)).toEqual([
      'CONFIG',
      'ANSWER_RELEASE_CATALOG_SOURCE',
      'RETRIEVER',
      'EMBEDDING_CLIENT',
      'RESPONSES_CLIENT',
      'ANSWER_GENERATOR',
      'DETERMINISTIC_VERIFIER',
      'SEMANTIC_VERIFIER',
      'USAGE_GUARD',
      'EVENT_SINK',
    ]);
    expect(Object.values(PUBLIC_ANSWER_TOKENS).map((token) => token.description)).toEqual([
      'public-answer.config',
      'public-answer.answer-release-catalog-source',
      'public-answer.retriever',
      'public-answer.embedding-client',
      'public-answer.responses-client',
      'public-answer.answer-generator',
      'public-answer.deterministic-verifier',
      'public-answer.semantic-verifier',
      'public-answer.usage-guard',
      'public-answer.event-sink',
    ]);
  });
});
