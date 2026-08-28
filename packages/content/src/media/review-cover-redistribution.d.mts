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
  evidence: {
    decidedAt: string;
    decidedBy: string;
    sources: Array<{ url: string; checkedAt: string }>;
    note: string;
  };
}

interface Schema<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
  optional(): Schema<T | undefined>;
}

export const reviewCoverRedistributionReceiptSchema: Schema<ReviewCoverRedistributionReceipt>;
export const reviewCoverRedistributionDecisionSchema: Schema<ReviewCoverRedistributionDecision>;
export function canonicalReviewCoverDecisionPath(recordId: string): string;
