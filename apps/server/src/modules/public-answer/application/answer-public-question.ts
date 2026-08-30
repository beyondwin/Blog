import {
  PublicAnswerPortError,
} from '../domain/public-answer-errors.js';
import type {
  AnswerPublicQuestionCommand,
  AuthorizedEvidence,
  PublicAnswerOutcome,
} from '../domain/public-answer.js';
import type { AnswerGenerator } from './ports/answer-generator.js';
import type {
  DeterministicAnswerVerifier,
  SemanticAnswerVerifier,
  SupportedSentenceUnit,
} from './ports/answer-verifier.js';
import type {
  PublicAnswerEvent,
  PublicAnswerEventSink,
  PublicAnswerResultKind,
} from './ports/event-sink.js';
import type { Retriever } from './ports/retriever.js';
import type {
  ProviderTokenUsage,
  UsageGuard,
  UsageLease,
} from './ports/usage-guard.js';

export interface PublicAnswerPolicy {
  readonly mode: 'disabled' | 'fixture' | 'provider';
}

export interface AnswerPublicQuestionDependencies {
  readonly policy: PublicAnswerPolicy;
  readonly retriever: Retriever;
  readonly generator: AnswerGenerator;
  readonly deterministicVerifier: DeterministicAnswerVerifier;
  readonly semanticVerifier: SemanticAnswerVerifier;
  readonly usageGuard: UsageGuard;
  readonly eventSink: PublicAnswerEventSink;
  readonly clock?: () => number;
}

interface ExecutionMetrics {
  acquiredUsage: boolean;
  retrievedCount: number;
  inputTokens: number;
  outputTokens: number;
}

function unsupportedQuestion(question: string): boolean {
  return !/[\p{L}\p{N}]/u.test(question);
}

function codePointCount(value: string): number {
  return [...value].length;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function semanticVerificationPasses(
  sentenceUnits: readonly SupportedSentenceUnit[],
  supportedSentenceIds: readonly string[],
  contradictedSentenceIds: readonly string[],
): boolean {
  const knownIds = new Set(sentenceUnits.map((unit) => unit.id));
  if (
    hasDuplicates(supportedSentenceIds)
    || hasDuplicates(contradictedSentenceIds)
    || supportedSentenceIds.some((id) => !knownIds.has(id))
    || contradictedSentenceIds.some((id) => !knownIds.has(id))
    || contradictedSentenceIds.length > 0
  ) {
    return false;
  }

  const supportedIds = new Set(supportedSentenceIds);
  const totalCharacters = sentenceUnits.reduce((sum, unit) => sum + codePointCount(unit.text), 0);
  const supportedCharacters = sentenceUnits.reduce(
    (sum, unit) => sum + (supportedIds.has(unit.id) ? codePointCount(unit.text) : 0),
    0,
  );
  const coverage = totalCharacters === 0 ? 0 : supportedCharacters / totalCharacters;
  if (coverage < 0.95) return false;

  return sentenceUnits.every((unit) => !unit.critical || supportedIds.has(unit.id));
}

function mappedOutcome(error: unknown): Extract<PublicAnswerOutcome, { kind: 'error' }> | undefined {
  if (!(error instanceof PublicAnswerPortError)) return undefined;
  switch (error.kind) {
    case 'rate-limit':
    case 'concurrency':
    case 'cost-limit':
      return { kind: 'error', code: 'rate-limited', retryable: true };
    case 'deadline':
      return { kind: 'error', code: 'timeout', retryable: true };
    case 'transport':
      return { kind: 'error', code: 'unavailable', retryable: true };
    case 'invalid-response':
      return { kind: 'error', code: 'invalid-response', retryable: false };
  }
}

function resultKind(outcome: PublicAnswerOutcome): PublicAnswerResultKind {
  if (outcome.kind === 'answer') return 'answer';
  if (outcome.kind === 'search') return outcome.reason;
  return outcome.code;
}

function latencyBucket(milliseconds: number): PublicAnswerEvent['latencyBucket'] {
  if (milliseconds < 250) return 'lt-250ms';
  if (milliseconds < 1_000) return 'lt-1s';
  if (milliseconds < 8_000) return 'lt-8s';
  return 'gte-8s';
}

function tokenBucket(tokens: number): PublicAnswerEvent['providerInputTokenBucket'] {
  if (tokens <= 0) return '0';
  if (tokens <= 128) return '1-128';
  if (tokens <= 512) return '129-512';
  if (tokens <= 2_048) return '513-2048';
  return '2049-plus';
}

function addUsage(metrics: ExecutionMetrics, usage: ProviderTokenUsage): void {
  metrics.inputTokens += usage.inputTokens;
  metrics.outputTokens += usage.outputTokens;
}

export class AnswerPublicQuestion {
  private readonly clock: () => number;

  constructor(private readonly dependencies: AnswerPublicQuestionDependencies) {
    this.clock = dependencies.clock ?? Date.now;
  }

  async execute(command: AnswerPublicQuestionCommand): Promise<PublicAnswerOutcome> {
    const startedAt = this.clock();
    const metrics: ExecutionMetrics = {
      acquiredUsage: false,
      retrievedCount: 0,
      inputTokens: 0,
      outputTokens: 0,
    };

    if (!command.catalog.isBoundTo(command.contentReleaseId, command.answerReleaseId)) {
      return this.record(command, startedAt, metrics, this.search(command, 'release-mismatch'));
    }
    if (unsupportedQuestion(command.question)) {
      return this.record(command, startedAt, metrics, this.search(command, 'unsupported-question'));
    }
    if (this.dependencies.policy.mode === 'disabled') {
      return this.record(command, startedAt, metrics, this.search(command, 'provider-disabled'));
    }
    if (command.catalog.chunkCount === 0) {
      return this.record(command, startedAt, metrics, this.search(command, 'insufficient-evidence'));
    }

    let usageLease: UsageLease;
    try {
      usageLease = await this.dependencies.usageGuard.acquire({
        networkKey: command.networkKey,
        requestId: command.requestId,
        signal: command.signal,
      });
      metrics.acquiredUsage = true;
    } catch (error) {
      return this.recordMappedOrThrow(command, startedAt, metrics, error);
    }

    try {
      return await this.executeWithUsage(command, usageLease, startedAt, metrics);
    } finally {
      usageLease.release();
    }
  }

  private async executeWithUsage(
    command: AnswerPublicQuestionCommand,
    usageLease: UsageLease,
    startedAt: number,
    metrics: ExecutionMetrics,
  ): Promise<PublicAnswerOutcome> {
    try {
      usageLease.beginStage('embedding');
      const retrieval = await this.dependencies.retriever.retrieve({
        question: command.question,
        catalog: command.catalog,
        limit: 6,
        signal: command.signal,
      });
      usageLease.settleStage('embedding', retrieval.usage);
      addUsage(metrics, retrieval.usage);
      metrics.retrievedCount = retrieval.candidateCount;

      if (!retrieval.sufficient) {
        return this.record(command, startedAt, metrics, this.search(command, 'insufficient-evidence'));
      }

      const retrievedEvidenceIds = retrieval.evidence.map((evidence) => evidence.evidenceId);
      const authorizedEvidence = command.catalog.evidenceFor(retrievedEvidenceIds);
      const authorizedEvidenceIds = authorizedEvidence.map((evidence) => evidence.evidenceId);
      const authorizedIdSet = new Set(authorizedEvidenceIds);
      if (
        hasDuplicates(retrievedEvidenceIds)
        || hasDuplicates(authorizedEvidenceIds)
        || authorizedEvidence.length !== retrievedEvidenceIds.length
        || retrievedEvidenceIds.some((id) => !authorizedIdSet.has(id))
        || authorizedEvidence.some((evidence) => evidence.answerReleaseId !== command.catalog.answerReleaseId)
      ) {
        return this.record(command, startedAt, metrics, this.search(command, 'insufficient-evidence'));
      }

      const generationLease = await usageLease.acquireGeneration(command.signal);
      try {
        return await this.executeWithGeneration(
          command,
          usageLease,
          authorizedEvidence,
          startedAt,
          metrics,
        );
      } finally {
        generationLease.release();
      }
    } catch (error) {
      return this.recordMappedOrThrow(command, startedAt, metrics, error);
    }
  }

  private async executeWithGeneration(
    command: AnswerPublicQuestionCommand,
    usageLease: UsageLease,
    retrievedEvidence: readonly AuthorizedEvidence[],
    startedAt: number,
    metrics: ExecutionMetrics,
  ): Promise<PublicAnswerOutcome> {
    try {
      usageLease.beginStage('generation');
      const generation = await this.dependencies.generator.generate({
        question: command.question,
        evidence: retrievedEvidence,
        signal: command.signal,
      });
      usageLease.settleStage('generation', generation.usage);
      addUsage(metrics, generation.usage);

      const evidenceIds = [...new Set(generation.claims.flatMap((claim) => claim.evidenceIds))];
      const authorizedEvidence = command.catalog.evidenceFor(evidenceIds);
      const deterministic = this.dependencies.deterministicVerifier.verify({
        catalog: command.catalog,
        claims: generation.claims,
        evidence: authorizedEvidence,
      });
      if (!deterministic.ok) {
        return this.record(command, startedAt, metrics, this.search(command, 'insufficient-evidence'));
      }

      usageLease.beginStage('semantic');
      const semantic = await this.dependencies.semanticVerifier.verify({
        sentenceUnits: deterministic.sentenceUnits,
        evidence: authorizedEvidence,
        signal: command.signal,
      });
      usageLease.settleStage('semantic', semantic.usage);
      addUsage(metrics, semantic.usage);

      if (!semanticVerificationPasses(
        deterministic.sentenceUnits,
        semantic.supportedSentenceIds,
        semantic.contradictedSentenceIds,
      )) {
        return this.record(command, startedAt, metrics, this.search(command, 'insufficient-evidence'));
      }

      return this.record(command, startedAt, metrics, {
        kind: 'answer',
        answerReleaseId: command.catalog.answerReleaseId,
        claims: generation.claims,
        evidence: authorizedEvidence,
      });
    } catch (error) {
      return this.recordMappedOrThrow(command, startedAt, metrics, error);
    }
  }

  private search(
    command: AnswerPublicQuestionCommand,
    reason: Extract<PublicAnswerOutcome, { kind: 'search' }>['reason'],
  ): Extract<PublicAnswerOutcome, { kind: 'search' }> {
    return { kind: 'search', reason, answerReleaseId: command.catalog.answerReleaseId };
  }

  private async recordMappedOrThrow(
    command: AnswerPublicQuestionCommand,
    startedAt: number,
    metrics: ExecutionMetrics,
    error: unknown,
  ): Promise<PublicAnswerOutcome> {
    const outcome = mappedOutcome(error);
    if (!outcome) throw error;
    return this.record(command, startedAt, metrics, outcome);
  }

  private async record(
    command: AnswerPublicQuestionCommand,
    startedAt: number,
    metrics: ExecutionMetrics,
    outcome: PublicAnswerOutcome,
  ): Promise<PublicAnswerOutcome> {
    const event: PublicAnswerEvent = {
      timestamp: new Date(startedAt).toISOString(),
      requestId: command.requestId,
      contentReleaseIdPrefix: command.catalog.contentReleaseId.slice(0, 12),
      answerReleaseIdPrefix: command.catalog.answerReleaseId.slice(0, 12),
      resultKind: resultKind(outcome),
      latencyBucket: latencyBucket(this.clock() - startedAt),
      retrievedCount: metrics.retrievedCount,
      providerInputTokenBucket: tokenBucket(metrics.inputTokens),
      providerOutputTokenBucket: tokenBucket(metrics.outputTokens),
      rateBucket: metrics.acquiredUsage ? 'accepted' : 'not-acquired',
    };
    await this.dependencies.eventSink.record(event);
    return outcome;
  }
}
