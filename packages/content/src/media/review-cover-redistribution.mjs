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

const approvedBy = z.array(z.string().min(1));

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
  approval: z.object({
    approvedBy,
    recordedAt: date,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.state === 'approved' && value.decision !== 'approve-public-redistribution') {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'approved state requires approve-public-redistribution' });
  }
  if (value.state === 'hold' && value.decision !== 'hold') {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'hold state requires hold decision' });
  }
  if (value.state === 'approved') {
    const roles = new Set(value.approval.approvedBy);
    if (
      value.approval.approvedBy.length !== 2
      || roles.size !== 2
      || !roles.has('controller')
      || !roles.has('independent-rights-reviewer')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['approval', 'approvedBy'],
        message: 'approvedBy must contain exactly controller and independent-rights-reviewer',
      });
    }
  }
});

export const REVIEW_COVER_APPROVAL_REGISTRY_PATH = 'packages/content/review-cover-redistribution-approvals.json';

const registrySource = z.object({
  path: safeRelativePath.refine(
    (value) => /^src\/assets\/content\/reviews\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/.test(value),
  ),
  checksum,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  kind: z.literal('book-cover'),
  isbn13: z.string().regex(/^97[89]\d{10}$/),
  edition: z.string().trim().min(1),
  sourceUrl: externalUrl,
  verifiedAt: date,
}).strict();

const registryApproval = z.object({
  collection: z.literal('reviews'),
  recordId: id,
  mediaId: id,
  decisionDocument,
  decisionChecksum: checksum,
  source: registrySource,
}).strict().superRefine((value, context) => {
  if (value.decisionDocument !== canonicalReviewCoverDecisionPath(value.recordId)) {
    context.addIssue({
      code: 'custom',
      path: ['decisionDocument'],
      message: 'registered review cover decision must match its canonical record path',
    });
  }
  if (!value.source.path.startsWith(`src/assets/content/reviews/${value.recordId}/`)) {
    context.addIssue({
      code: 'custom',
      path: ['source', 'path'],
      message: 'registered review cover source must belong to its exact record',
    });
  }
});

const registrySchema = z.object({
  version: z.literal(1),
  approvals: z.array(registryApproval),
}).strict().superRefine((value, context) => {
  const paths = value.approvals.map((entry) => entry.decisionDocument);
  const identities = value.approvals.map((entry) => `${entry.collection}/${entry.recordId}/${entry.mediaId}`);
  const sourcePaths = value.approvals.map((entry) => entry.source.path);
  for (const [field, entries] of [
    ['decisionDocument', paths],
    ['identity', identities],
    ['source.path', sourcePaths],
  ]) {
    if (new Set(entries).size !== entries.length) {
      context.addIssue({ code: 'custom', path: ['approvals'], message: `registered review cover ${field} values must be unique` });
    }
  }
});

export function parseReviewCoverApprovalRegistry(source, path = REVIEW_COVER_APPROVAL_REGISTRY_PATH) {
  let input;
  try {
    input = JSON.parse(source);
  } catch (error) {
    throw new Error(`review cover approval registry ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`review cover approval registry ${path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return parsed.data;
}

export function assertRegisteredReviewCoverApproval(registry, claim) {
  const registered = registry.approvals.find((entry) => entry.decisionDocument === claim.decisionDocument);
  if (!registered) {
    throw new Error(`${claim.collection}/${claim.recordId}/${claim.mediaId}: review cover decision is not registered for independent approval`);
  }
  for (const field of ['collection', 'recordId', 'mediaId', 'decisionDocument', 'decisionChecksum']) {
    if (registered[field] !== claim[field]) {
      const label = field === 'decisionChecksum' ? 'decision checksum' : field;
      throw new Error(`${claim.collection}/${claim.recordId}/${claim.mediaId}: registry ${label} must match the exact review cover claim`);
    }
  }
  for (const field of ['path', 'checksum', 'width', 'height', 'kind', 'isbn13', 'edition', 'sourceUrl', 'verifiedAt']) {
    if (registered.source[field] !== claim.source[field]) {
      throw new Error(`${claim.collection}/${claim.recordId}/${claim.mediaId}: registry source ${field} must match the exact review cover claim`);
    }
  }
  return registered;
}

export function canonicalReviewCoverDecisionPath(recordId) {
  return `docs/notes/project/assets/review-cover-rights/${recordId}/redistribution-decision.yml`;
}
