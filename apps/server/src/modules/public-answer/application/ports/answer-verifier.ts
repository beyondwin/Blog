import type { AuthorizedEvidence, GeneratedClaim } from '../../domain/public-answer.js';
import type { AnswerReleaseCatalogSnapshot } from './answer-release-catalog.js';
import type { ProviderTokenUsage } from './usage-guard.js';

export interface SupportedSentenceUnit {
  id: string;
  claimId: string;
  text: string;
  evidenceIds: readonly string[];
  critical: true;
}

export interface DeterministicAnswerVerifier {
  verify(input: {
    catalog: AnswerReleaseCatalogSnapshot;
    claims: readonly GeneratedClaim[];
    evidence: readonly AuthorizedEvidence[];
  }):
    | { ok: true; sentenceUnits: readonly SupportedSentenceUnit[] }
    | { ok: false; reason: string };
}

export interface SemanticAnswerVerifier {
  verify(input: {
    sentenceUnits: readonly SupportedSentenceUnit[];
    evidence: readonly AuthorizedEvidence[];
    signal: AbortSignal;
  }): Promise<{
    supportedSentenceIds: readonly string[];
    contradictedSentenceIds: readonly string[];
    usage: ProviderTokenUsage;
  }>;
}
