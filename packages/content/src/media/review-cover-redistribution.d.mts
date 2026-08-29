export interface ReviewCoverRedistributionReceipt {
  decisionDocument: string;
  decisionChecksum: string;
}

export interface ReviewCoverBibliographicIdentity {
  title: string;
  authors: string[];
  publisher: string;
  isbn13: string;
  editionLabel: string;
  publicationYear?: number;
}

export type ReviewCoverRightsEvidence =
  | {
    type: 'redistribution-license';
    evidenceUrl: string;
    evidencePath: string;
    evidenceChecksum: string;
    retrievedAt: string;
    scope: 'public website redistribution of the exact cover asset';
  }
  | {
    type: 'written-permission';
    evidencePath: string;
    evidenceChecksum: string;
    retrievedAt: string;
    scope: 'public website redistribution of the exact cover asset';
  };

export interface ReviewCoverRedistributionDecision {
  version: 1;
  state: 'approved';
  decision: 'approve-public-redistribution';
  recordId: string;
  mediaId: string;
  asset: {
    path: string;
    checksum: string;
    width: number;
    height: number;
    kind: 'book-cover';
  };
  bibliographicIdentity: ReviewCoverBibliographicIdentity;
  rightsEvidence: ReviewCoverRightsEvidence;
  approval: {
    approvedBy: string[];
    recordedAt: string;
  };
}

export interface ReviewCoverApprovalRegistryEntry {
  collection: 'reviews';
  recordId: string;
  mediaId: string;
  decisionDocument: string;
  decisionChecksum: string;
  source: {
    path: string;
    checksum: string;
    width: number;
    height: number;
    kind: 'book-cover';
    sourceUrl: string;
    verifiedAt: string;
    bibliographicIdentity: ReviewCoverBibliographicIdentity;
    rightsEvidence: ReviewCoverRightsEvidence;
  };
}

export interface ReviewCoverApprovalRegistry {
  version: 1;
  approvals: ReviewCoverApprovalRegistryEntry[];
}

interface Schema<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
  optional(): Schema<T | undefined>;
}

export const reviewCoverRedistributionReceiptSchema: Schema<ReviewCoverRedistributionReceipt>;
export const bibliographicIdentitySchema: Schema<ReviewCoverBibliographicIdentity>;
export const reviewCoverRightsEvidenceSchema: Schema<ReviewCoverRightsEvidence>;
export const reviewCoverRedistributionDecisionSchema: Schema<ReviewCoverRedistributionDecision>;
export const REVIEW_COVER_APPROVAL_REGISTRY_PATH: 'packages/content/review-cover-redistribution-approvals.json';
export function parseReviewCoverApprovalRegistry(source: string, path?: string): ReviewCoverApprovalRegistry;
export function assertRegisteredReviewCoverApproval(
  registry: ReviewCoverApprovalRegistry,
  claim: ReviewCoverApprovalRegistryEntry,
): ReviewCoverApprovalRegistryEntry;
export function canonicalReviewCoverDecisionPath(recordId: string): string;
export function canonicalReviewCoverRightsEvidencePath(recordId: string, extension?: string): string;
