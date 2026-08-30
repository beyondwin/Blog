import { type DynamicModule, Module, type Provider } from '@nestjs/common';

import type { ServerConfig } from '../../config/server-config.js';
import { RuntimeReadiness } from '../../health/runtime-readiness.js';
import { RuntimeLifecycle } from '../../lifecycle/runtime-lifecycle.js';
import { TrustedProxyNetworkKey } from '../../security/network-key.js';
import { AnswerPublicQuestion } from './application/answer-public-question.js';
import type { AnswerGenerator } from './application/ports/answer-generator.js';
import type { AnswerReleaseCatalogSource } from './application/ports/answer-release-catalog.js';
import type { DeterministicAnswerVerifier, SemanticAnswerVerifier } from './application/ports/answer-verifier.js';
import type { PublicAnswerEventSink } from './application/ports/event-sink.js';
import type { Retriever } from './application/ports/retriever.js';
import type { UsageGuard } from './application/ports/usage-guard.js';
import { PublicAnswerController } from './http/public-answer.controller.js';
import { PublicAnswerPipe } from './http/public-answer.pipe.js';
import { PUBLIC_ANSWER_TOKENS } from './public-answer.tokens.js';

export interface PublicAnswerModuleRuntime {
  readonly config: Readonly<ServerConfig>;
  readonly readiness: RuntimeReadiness;
  readonly lifecycle: RuntimeLifecycle;
  readonly catalogSource: AnswerReleaseCatalogSource;
  readonly answerPublicQuestion?: Pick<AnswerPublicQuestion, 'execute'>;
  readonly networkKey: TrustedProxyNetworkKey;
  readonly retriever?: Retriever;
  readonly generator?: AnswerGenerator;
  readonly deterministicVerifier?: DeterministicAnswerVerifier;
  readonly semanticVerifier?: SemanticAnswerVerifier;
  readonly usageGuard?: UsageGuard;
  readonly eventSink?: PublicAnswerEventSink;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`public answer ${label} is required`);
  return value;
}

@Module({})
export class PublicAnswerModule {
  static register(runtime: PublicAnswerModuleRuntime): DynamicModule {
    const providers: Provider[] = [
      PublicAnswerPipe,
      { provide: PUBLIC_ANSWER_TOKENS.CONFIG, useValue: runtime.config },
      { provide: PUBLIC_ANSWER_TOKENS.ANSWER_RELEASE_CATALOG_SOURCE, useValue: runtime.catalogSource },
      { provide: TrustedProxyNetworkKey, useValue: runtime.networkKey },
      { provide: RuntimeReadiness, useValue: runtime.readiness },
      { provide: RuntimeLifecycle, useValue: runtime.lifecycle },
    ];
    if (runtime.answerPublicQuestion) {
      providers.push({ provide: AnswerPublicQuestion, useValue: runtime.answerPublicQuestion });
    } else {
      providers.push(
        { provide: PUBLIC_ANSWER_TOKENS.RETRIEVER, useValue: required(runtime.retriever, 'retriever') },
        { provide: PUBLIC_ANSWER_TOKENS.ANSWER_GENERATOR, useValue: required(runtime.generator, 'generator') },
        { provide: PUBLIC_ANSWER_TOKENS.DETERMINISTIC_VERIFIER,
          useValue: required(runtime.deterministicVerifier, 'deterministic verifier') },
        { provide: PUBLIC_ANSWER_TOKENS.SEMANTIC_VERIFIER,
          useValue: required(runtime.semanticVerifier, 'semantic verifier') },
        { provide: PUBLIC_ANSWER_TOKENS.USAGE_GUARD, useValue: required(runtime.usageGuard, 'usage guard') },
        { provide: PUBLIC_ANSWER_TOKENS.EVENT_SINK, useValue: required(runtime.eventSink, 'event sink') },
        {
          provide: AnswerPublicQuestion,
          useFactory: (
            retriever: Retriever,
            generator: AnswerGenerator,
            deterministicVerifier: DeterministicAnswerVerifier,
            semanticVerifier: SemanticAnswerVerifier,
            usageGuard: UsageGuard,
            eventSink: PublicAnswerEventSink,
            config: ServerConfig,
          ) => new AnswerPublicQuestion({
            retriever,
            generator,
            deterministicVerifier,
            semanticVerifier,
            usageGuard,
            eventSink,
            policy: Object.freeze({ mode: config.publicAskMode }),
          }),
          inject: [
            PUBLIC_ANSWER_TOKENS.RETRIEVER,
            PUBLIC_ANSWER_TOKENS.ANSWER_GENERATOR,
            PUBLIC_ANSWER_TOKENS.DETERMINISTIC_VERIFIER,
            PUBLIC_ANSWER_TOKENS.SEMANTIC_VERIFIER,
            PUBLIC_ANSWER_TOKENS.USAGE_GUARD,
            PUBLIC_ANSWER_TOKENS.EVENT_SINK,
            PUBLIC_ANSWER_TOKENS.CONFIG,
          ],
        },
      );
    }
    return {
      module: PublicAnswerModule,
      controllers: [PublicAnswerController],
      providers,
      exports: [RuntimeReadiness, RuntimeLifecycle],
    };
  }
}
