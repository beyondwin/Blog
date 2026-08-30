import type { AuthorizedEvidence, GeneratedClaim } from '../../domain/public-answer.js';
import type { ProviderTokenUsage } from './usage-guard.js';

export interface AnswerGenerator {
  generate(input: {
    question: string;
    evidence: readonly AuthorizedEvidence[];
    signal: AbortSignal;
  }): Promise<{
    claims: readonly GeneratedClaim[];
    usage: ProviderTokenUsage;
  }>;
}
