export type SearchReason =
  | 'insufficient-evidence'
  | 'unsupported-question'
  | 'release-mismatch'
  | 'provider-disabled';

export interface AuthorizedEvidence {
  evidenceId: string;
  chunkId: string;
  answerReleaseId: string;
  recordId: string;
  collectionLabel: string;
  recordTitle: string;
  canonicalPath: string;
  locator: {
    kind: 'heading-paragraph' | 'evidence-page';
    label: string;
    ordinal: number;
  };
  excerpt: string;
  excerptChecksum: string;
}

export interface GeneratedClaim {
  claimId: string;
  text: string;
  evidenceIds: readonly string[];
}

export type PublicAnswerOutcome =
  | {
    kind: 'answer';
    answerReleaseId: string;
    claims: readonly GeneratedClaim[];
    evidence: readonly AuthorizedEvidence[];
  }
  | { kind: 'search'; reason: SearchReason; answerReleaseId: string }
  | {
    kind: 'error';
    code: 'rate-limited' | 'timeout' | 'unavailable' | 'invalid-response';
    retryable: boolean;
  };

export interface AnswerReleaseCatalogSnapshot {
  readonly bindingId: string;
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly corpusApprovalHash: string;
  readonly chunkCount: number;
  isBoundTo(contentReleaseId: string, answerReleaseId: string): boolean;
  evidenceFor(ids: readonly string[]): readonly AuthorizedEvidence[];
  hasAuthorizedEvidenceLocation(evidence: AuthorizedEvidence): boolean;
}

export interface AnswerPublicQuestionCommand {
  requestId: string;
  question: string;
  contentReleaseId: string;
  answerReleaseId: string;
  networkKey: string;
  signal: AbortSignal;
  catalog: AnswerReleaseCatalogSnapshot;
}
