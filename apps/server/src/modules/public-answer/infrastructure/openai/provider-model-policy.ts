import { PublicAnswerInvalidResponseError } from '../../domain/public-answer-errors.js';
import { canonicalProviderJson, providerChecksum } from './provider-json.js';

const prices = Object.freeze({
  embeddingInput: 130_000,
  responsesInput: 200_000,
  responsesOutput: 1_200_000,
});

const policyBody = Object.freeze({
  schemaVersion: 2 as const,
  generationModel: 'gpt-5.6-luna' as const,
  semanticModel: 'gpt-5.6-luna' as const,
  reasoningEffort: 'high' as const,
  embeddingModel: 'text-embedding-3-large' as const,
  embeddingDimensions: 3072 as const,
  maxResponsesInputTokens: 6_000,
  maxResponsesOutputTokens: 500,
  monthlyHardCapMicroUsd: 1_000_000,
  prices,
});

const pricingReceiptBody = Object.freeze({
  models: Object.freeze({
    'gpt-5.6-luna': Object.freeze({
      inputMicroUsdPerMillionTokens: prices.responsesInput,
      outputMicroUsdPerMillionTokens: prices.responsesOutput,
    }),
    'text-embedding-3-large': Object.freeze({
      inputMicroUsdPerMillionTokens: prices.embeddingInput,
      outputMicroUsdPerMillionTokens: 0,
    }),
  }),
  observedAt: '2026-09-02',
  rounding: 'ceil-micro-usd-per-operation' as const,
  schemaVersion: 1 as const,
  sources: Object.freeze([
    'https://platform.openai.com/docs/pricing',
    'https://platform.openai.com/docs/models/gpt-5.6-luna',
    'https://platform.openai.com/docs/models/text-embedding-3-large',
  ]),
});

export const PROVIDER_PRICING_RECEIPT = Object.freeze({
  ...pricingReceiptBody,
  canonicalHash: providerChecksum(pricingReceiptBody),
});

export const PROVIDER_MODEL_POLICY = Object.freeze({
  ...policyBody,
  policyHash: providerChecksum(policyBody),
  pricingReceiptHash: PROVIDER_PRICING_RECEIPT.canonicalHash,
});

export type ProviderModelPolicy = typeof PROVIDER_MODEL_POLICY;
export type ProviderOperation = 'corpus-embedding' | 'query-embedding' | 'generation' | 'semantic';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function providerOperationCostMicroUsd(
  operation: ProviderOperation,
  usage: Readonly<{ inputTokens: number; outputTokens: number }>,
): number {
  if (!Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
    || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0) {
    throw new Error('provider price arithmetic invalid');
  }
  if (operation === 'corpus-embedding' || operation === 'query-embedding') {
    if (usage.outputTokens !== 0) throw new Error('provider price arithmetic invalid');
    return Math.ceil(usage.inputTokens * PROVIDER_MODEL_POLICY.prices.embeddingInput / 1_000_000);
  }
  if (operation !== 'generation' && operation !== 'semantic') {
    throw new Error('provider price arithmetic invalid');
  }
  return Math.ceil(
    (usage.inputTokens * PROVIDER_MODEL_POLICY.prices.responsesInput
      + usage.outputTokens * PROVIDER_MODEL_POLICY.prices.responsesOutput) / 1_000_000,
  );
}

export function assertCurrentResponsesPolicy(request: unknown): void {
  if (!isPlainObject(request) || request.model !== PROVIDER_MODEL_POLICY.generationModel) {
    throw new PublicAnswerInvalidResponseError('unsupported provider model');
  }
  if (!isPlainObject(request.reasoning) || request.reasoning.effort !== PROVIDER_MODEL_POLICY.reasoningEffort) {
    throw new PublicAnswerInvalidResponseError('unsupported provider reasoning');
  }
  if (request.store !== false
    || request.max_output_tokens !== PROVIDER_MODEL_POLICY.maxResponsesOutputTokens
    || !Array.isArray(request.tools) || request.tools.length !== 0) {
    throw new PublicAnswerInvalidResponseError('Responses request settings are invalid');
  }
}

export function bundledProviderPricingBytes(): string {
  return `${canonicalProviderJson(PROVIDER_PRICING_RECEIPT)}\n`;
}
