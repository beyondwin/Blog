export interface ReviewCoverRedistributionReceipt {
  decisionDocument: string;
  decisionChecksum: string;
}

export interface ReviewCoverRedistributionDecision {
  version: 1;
  state: 'approved' | 'hold';
  decision: 'approve-public-redistribution' | 'hold';
  recordId: string;
  mediaId: string;
  asset: {
    path: string;
    checksum: string;
    width: number;
    height: number;
    kind: 'book-cover';
  };
  edition: { isbn13: string; label: string };
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
    isbn13: string;
    edition: string;
    sourceUrl: string;
    verifiedAt: string;
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
export const reviewCoverRedistributionDecisionSchema: Schema<ReviewCoverRedistributionDecision>;
export const REVIEW_COVER_APPROVAL_REGISTRY_PATH: 'packages/content/review-cover-redistribution-approvals.json';
export function parseReviewCoverApprovalRegistry(source: string, path?: string): ReviewCoverApprovalRegistry;
export function assertRegisteredReviewCoverApproval(
  registry: ReviewCoverApprovalRegistry,
  claim: ReviewCoverApprovalRegistryEntry,
): ReviewCoverApprovalRegistryEntry;
export function canonicalReviewCoverDecisionPath(recordId: string): string;
