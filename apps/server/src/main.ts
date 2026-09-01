import 'reflect-metadata';

import { pathToFileURL } from 'node:url';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { parseServerConfig, type FixtureScenario, type ServerConfig } from './config/server-config.js';
import { RuntimeReadiness, runRuntimeStartupChecks } from './health/runtime-readiness.js';
import { BoundedErrorFilter } from './http/bounded-error.filter.js';
import { RuntimeLifecycle } from './lifecycle/runtime-lifecycle.js';
import type { AnswerGenerator } from './modules/public-answer/application/ports/answer-generator.js';
import type { AnswerReleaseCatalogSource } from './modules/public-answer/application/ports/answer-release-catalog.js';
import type { DeterministicAnswerVerifier, SemanticAnswerVerifier } from './modules/public-answer/application/ports/answer-verifier.js';
import type { PublicAnswerEventSink } from './modules/public-answer/application/ports/event-sink.js';
import type { Retriever } from './modules/public-answer/application/ports/retriever.js';
import type { UsageGuard } from './modules/public-answer/application/ports/usage-guard.js';
import type { PublicAnswerOutcome } from './modules/public-answer/domain/public-answer.js';
import { PublicAnswerDeadlineError } from './modules/public-answer/domain/public-answer-errors.js';
import { AnswerPublicQuestion } from './modules/public-answer/application/answer-public-question.js';
import type { AnswerPublicQuestionCommand } from './modules/public-answer/domain/public-answer.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import {
  FixtureAnswerGenerator,
  StressFixtureAnswerGenerator,
} from './modules/public-answer/infrastructure/fixture/fixture-answer-generator.js';
import { FixtureSemanticVerifier } from './modules/public-answer/infrastructure/fixture/fixture-semantic-verifier.js';
import { InMemoryRedactedEventSink } from './modules/public-answer/infrastructure/fixture/in-memory-redacted-event-sink.js';
import { InMemoryUsageGuard } from './modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { OpenAIEmbeddingClient } from './modules/public-answer/infrastructure/openai/openai-embedding-client.js';
import { OpenAiResponsesClient } from './modules/public-answer/infrastructure/openai/openai-responses-client.js';
import { OpenAiResponsesGenerator } from './modules/public-answer/infrastructure/openai/openai-responses-generator.js';
import { CancellablePgQueryRunner } from './modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { PostgresHybridRetriever } from './modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';
import { createPostgresControlPool, createPostgresPool } from './modules/public-answer/infrastructure/postgres/postgres-pool.js';
import { PostgresRedactedEventSink } from './modules/public-answer/infrastructure/postgres/postgres-redacted-event-sink.js';
import { VerifiedAnswerReleaseCatalogSource, type VerifiedCatalogSnapshot } from './modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { CitationVerifier } from './modules/public-answer/infrastructure/verification/citation-verifier.js';
import { OpenAiSemanticVerifier } from './modules/public-answer/infrastructure/verification/semantic-verifier.js';
import type { PublicAnswerModuleRuntime } from './modules/public-answer/public-answer.module.js';
import { TrustedProxyNetworkKey } from './security/network-key.js';

export interface ApplicationRuntimeOverrides {
  readonly config?: Readonly<ServerConfig>;
  readonly readiness?: RuntimeReadiness;
  readonly lifecycle?: RuntimeLifecycle;
  readonly catalogSource?: AnswerReleaseCatalogSource;
  readonly answerPublicQuestion?: { execute(command: Parameters<import('./modules/public-answer/application/answer-public-question.js').AnswerPublicQuestion['execute']>[0]): Promise<PublicAnswerOutcome> };
  readonly networkKey?: TrustedProxyNetworkKey;
  readonly retriever?: Retriever;
  readonly generator?: AnswerGenerator;
  readonly deterministicVerifier?: DeterministicAnswerVerifier;
  readonly semanticVerifier?: SemanticAnswerVerifier;
  readonly usageGuard?: UsageGuard;
  readonly eventSink?: PublicAnswerEventSink;
}

export interface CreateApplicationOptions {
  readonly runtime?: ApplicationRuntimeOverrides;
}

type PublicAnswerExecutor = Readonly<{
  execute(command: AnswerPublicQuestionCommand): Promise<PublicAnswerOutcome>;
}>;

export function createFixtureScenarioExecutor(
  scenario: FixtureScenario,
  base: PublicAnswerExecutor,
  slowSql: (signal: AbortSignal, deadlineAt: number) => Promise<void>,
): PublicAnswerExecutor {
  let requestCount = 0;
  return Object.freeze({
    async execute(command: AnswerPublicQuestionCommand): Promise<PublicAnswerOutcome> {
      requestCount += 1;
      switch (scenario) {
        case 'success':
        case 'stress-max':
          return base.execute(command);
        case 'provider-disabled':
          return { kind: 'search', reason: 'provider-disabled', answerReleaseId: command.catalog.answerReleaseId };
        case 'insufficient-evidence':
          return { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: command.catalog.answerReleaseId };
        case 'unavailable':
          return { kind: 'error', code: 'unavailable', retryable: true };
        case 'timeout':
          return { kind: 'error', code: 'timeout', retryable: true };
        case 'release-mismatch':
          return { kind: 'search', reason: 'release-mismatch', answerReleaseId: command.catalog.answerReleaseId };
        case 'slow-sql':
          try {
            await slowSql(command.signal, command.deadlineAt);
          } catch (error) {
            if (command.signal.aborted && command.signal.reason instanceof PublicAnswerDeadlineError) {
              return { kind: 'error', code: 'timeout', retryable: true };
            }
            throw error;
          }
          return { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: command.catalog.answerReleaseId };
        case 'replace-active':
          if (requestCount > 1) return base.execute(command);
          await slowSql(command.signal, command.deadlineAt);
          return { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: command.catalog.answerReleaseId };
      }
    },
  });
}

const shellConfig = Object.freeze({
  nodeEnv: 'test', host: '127.0.0.1', port: 3000, publicAskMode: 'disabled', replicaCount: 1,
  databaseUrl: 'postgresql://disabled:disabled@127.0.0.1:5432/disabled',
  contentReleaseRoot: '/tmp/disabled-content', answerReleaseRoot: '/tmp/disabled-answer',
  corpusApprovalPath: '/tmp/disabled-approval.json', trustedProxyAddresses: Object.freeze([]),
  networkHmacSecret: 'disabled-shell-secret-at-least-32-characters', publicOrigin: null,
  edgeReachabilityReceiptPath: null, openAiApiKey: null, providerDataControlReceiptPath: null,
  providerEmbeddingReceiptRoot: null, deletionReceiptRoot: null, fixtureScenario: null, providerAuthority: null,
}) satisfies Readonly<ServerConfig>;

function shellRuntime(overrides: ApplicationRuntimeOverrides = {}): PublicAnswerModuleRuntime {
  const config = overrides.config ?? shellConfig;
  const readiness = overrides.readiness ?? new RuntimeReadiness();
  const lifecycle = overrides.lifecycle ?? new RuntimeLifecycle({
    readiness,
    closeServer: async () => undefined,
    closePool: async () => undefined,
  });
  return {
    config,
    readiness,
    lifecycle,
    catalogSource: overrides.catalogSource ?? {
      async snapshot() { throw new Error('public answer runtime is not composed'); },
    },
    answerPublicQuestion: overrides.answerPublicQuestion ?? {
      async execute() { return { kind: 'error', code: 'unavailable', retryable: true }; },
    },
    networkKey: overrides.networkKey ?? new TrustedProxyNetworkKey({
      masterSecret: config.networkHmacSecret,
      trustedProxyAddresses: config.trustedProxyAddresses,
    }),
    retriever: overrides.retriever,
    generator: overrides.generator,
    deterministicVerifier: overrides.deterministicVerifier,
    semanticVerifier: overrides.semanticVerifier,
    usageGuard: overrides.usageGuard,
    eventSink: overrides.eventSink,
  };
}

export async function createApplication(options: CreateApplicationOptions = {}): Promise<NestFastifyApplication> {
  const runtime = shellRuntime(options.runtime);
  const trusted = new Set(runtime.config.trustedProxyAddresses);
  const adapter = new FastifyAdapter({
    bodyLimit: 4096,
    exposeHeadRoutes: false,
    logger: false,
    trustProxy: (address) => trusted.has(address),
  });
  const fastify = adapter.getInstance();
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, private');
    reply.header('Vary', 'Origin');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
    const binding = runtime.readiness.startupBinding();
    if (binding) {
      if (!reply.hasHeader('X-Content-Release-Id')) reply.header('X-Content-Release-Id', binding.contentReleaseId);
      if (!reply.hasHeader('X-Answer-Release-Id')) reply.header('X-Answer-Release-Id', binding.answerReleaseId);
    }
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(runtime), adapter, {
    bufferLogs: false,
    logger: false,
  });
  app.useGlobalFilters(new BoundedErrorFilter(runtime.readiness));
  return app;
}

export async function startApplication(): Promise<NestFastifyApplication> {
  const config = await parseServerConfig(process.env);
  const pool = createPostgresPool(config.databaseUrl);
  const controlPool = createPostgresControlPool(config.databaseUrl);
  let app: NestFastifyApplication | undefined;
  try {
    const catalogSource = new VerifiedAnswerReleaseCatalogSource(config, pool);
    const readiness = new RuntimeReadiness<VerifiedCatalogSnapshot>({
      startupCheck: async () => runRuntimeStartupChecks(config, { pool, catalogSource }),
    });
    const queries = new CancellablePgQueryRunner(pool, controlPool);
    const retriever: Retriever = config.publicAskMode === 'disabled'
      ? {
        async retrieve() {
          return Object.freeze({
            evidence: Object.freeze([]), sufficient: false, candidateCount: 0,
            usage: Object.freeze({ inputTokens: 0, outputTokens: 0 }),
          });
        },
      }
      : new PostgresHybridRetriever(config.publicAskMode === 'provider'
        ? new OpenAIEmbeddingClient(config.openAiApiKey!, { profile: 'query' })
        : new DeterministicEmbeddingClient(config.nodeEnv), queries);
    let generator: AnswerGenerator;
    let semanticVerifier: SemanticAnswerVerifier;
    if (config.publicAskMode === 'provider') {
      const responses = new OpenAiResponsesClient(config.openAiApiKey!);
      generator = new OpenAiResponsesGenerator(responses);
      semanticVerifier = new OpenAiSemanticVerifier(responses);
    } else if (config.publicAskMode === 'fixture') {
      generator = config.fixtureScenario === 'stress-max'
        ? new StressFixtureAnswerGenerator()
        : new FixtureAnswerGenerator();
      semanticVerifier = new FixtureSemanticVerifier();
    } else {
      generator = { async generate() { throw new Error('disabled mode must not generate'); } };
      semanticVerifier = { async verify() { throw new Error('disabled mode must not verify'); } };
    }
    const usageGuard = await InMemoryUsageGuard.create();
    const eventSink = config.publicAskMode === 'fixture'
      ? new InMemoryRedactedEventSink()
      : new PostgresRedactedEventSink(pool);
    if (eventSink instanceof PostgresRedactedEventSink) await eventSink.start();
    const lifecycle = new RuntimeLifecycle({
      readiness,
      closeServer: async () => { if (app) await app.close(); },
      closePool: async () => { await Promise.all([pool.end(), controlPool.end()]); },
    });
    const baseUseCase = new AnswerPublicQuestion({
      policy: Object.freeze({ mode: config.publicAskMode }),
      retriever,
      generator,
      deterministicVerifier: new CitationVerifier(),
      semanticVerifier,
      usageGuard,
      eventSink,
    });
    const fixtureExecutor = config.fixtureScenario
      ? createFixtureScenarioExecutor(config.fixtureScenario, baseUseCase,
        async (signal, deadlineAt) => { await queries.query('SELECT pg_sleep(30)', [], signal, deadlineAt); })
      : undefined;
    app = await createApplication({
      runtime: {
        config,
        readiness,
        lifecycle,
        catalogSource,
        answerPublicQuestion: fixtureExecutor,
        networkKey: new TrustedProxyNetworkKey({
          masterSecret: config.networkHmacSecret,
          trustedProxyAddresses: config.trustedProxyAddresses,
        }),
        retriever,
        generator,
        deterministicVerifier: new CitationVerifier(),
        semanticVerifier,
        usageGuard,
        eventSink,
      },
    });
    await readiness.initialize();
    await app.listen(config.port, config.host);
    lifecycle.registerSignals();
    return app;
  } catch (error) {
    await app?.close().catch(() => undefined);
    await Promise.all([pool.end().catch(() => undefined), controlPool.end().catch(() => undefined)]);
    throw error;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await startApplication();
  process.send?.({ type: 'beyondwin-public-answer-listening' });
}
