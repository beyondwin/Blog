import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const externalUrl = z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const safeRelativePath = z.string().trim().min(1).refine((value) => (
  !value.includes('\\')
  && !value.startsWith('/')
  && !/^[A-Za-z]:\//.test(value)
  && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
), 'path must be canonical and repository-relative');

const decisionDocument = safeRelativePath.refine(
  (value) => /^docs\/notes\/project\/assets\/review-cover-rights\/[a-z0-9][a-z0-9-]*\/redistribution-decision\.yml$/.test(value),
  'review cover decision must use the canonical durable rights-evidence path',
);

export const reviewCoverRedistributionReceiptSchema = z.object({
  decisionDocument,
  decisionChecksum: checksum,
}).strict();

export const reviewCoverRedistributionDecisionSchema = z.object({
  version: z.literal(1),
  state: z.enum(['approved', 'hold']),
  decision: z.enum(['approve-public-redistribution', 'hold']),
  recordId: id,
  mediaId: id,
  asset: z.object({
    path: safeRelativePath.refine(
      (value) => /^src\/assets\/content\/reviews\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/.test(value),
    ),
    checksum,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    kind: z.literal('book-cover'),
  }).strict(),
  edition: z.object({
    isbn13: z.string().regex(/^97[89]\d{10}$/),
    label: z.string().trim().min(1),
  }).strict(),
  evidence: z.object({
    decidedAt: date,
    decidedBy: z.string().trim().min(1),
    sources: z.array(z.object({
      url: externalUrl,
      checkedAt: date,
    }).strict()).min(1),
    note: z.string().trim().min(1),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.state === 'approved' && value.decision !== 'approve-public-redistribution') {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'approved state requires approve-public-redistribution' });
  }
  if (value.state === 'hold' && value.decision !== 'hold') {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'hold state requires hold decision' });
  }
});

export function canonicalReviewCoverDecisionPath(recordId) {
  return `docs/notes/project/assets/review-cover-rights/${recordId}/redistribution-decision.yml`;
}
