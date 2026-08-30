import type { AuthorizedEvidence } from '../../domain/public-answer.js';
import type { AnswerReleaseCatalogSnapshot } from './answer-release-catalog.js';
import type { ProviderTokenUsage } from './usage-guard.js';

export interface Retriever {
  retrieve(input: {
    question: string;
    catalog: AnswerReleaseCatalogSnapshot;
    limit: 6;
    signal: AbortSignal;
  }): Promise<{
    evidence: readonly AuthorizedEvidence[];
    sufficient: boolean;
    candidateCount: number;
    usage: ProviderTokenUsage;
  }>;
}
