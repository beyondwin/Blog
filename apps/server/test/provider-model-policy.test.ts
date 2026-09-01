import { describe, expect, it } from 'vitest';
import {
  PROVIDER_MODEL_POLICY,
  assertCurrentResponsesPolicy,
  providerOperationCostMicroUsd,
} from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

describe('current provider model policy', () => {
  it('seals Luna high and the approved prices', () => {
    expect(PROVIDER_MODEL_POLICY).toMatchObject({
      generationModel: 'gpt-5.6-luna',
      semanticModel: 'gpt-5.6-luna',
      reasoningEffort: 'high',
      embeddingModel: 'text-embedding-3-large',
      embeddingDimensions: 3072,
      monthlyHardCapMicroUsd: 1_000_000,
      prices: { embeddingInput: 130_000, responsesInput: 200_000, responsesOutput: 1_200_000 },
    });
  });

  it('rejects every GPT-5.4 request tree', () => {
    expect(() => assertCurrentResponsesPolicy({
      model: 'gpt-5.4-mini-2026-03-17',
      reasoning: { effort: 'none' },
      store: false,
      tools: [],
      max_output_tokens: 500,
    })).toThrow(/unsupported provider model/u);
  });

  it('prices Luna input and output with ceil-per-operation arithmetic', () => {
    expect(providerOperationCostMicroUsd('generation', { inputTokens: 6_000, outputTokens: 500 })).toBe(1_800);
  });
});
