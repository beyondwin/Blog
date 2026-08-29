import { isIP } from 'node:net';
import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'date must be a real YYYY-MM-DD calendar date');
const blockedIpv4Cidrs = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const blockedIpv6Cidrs = [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

function ipv4ToInteger(address) {
  return address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function ipv6ToBigInt(address) {
  const [leftSource, rightSource = ''] = address.split('::');
  const left = leftSource ? leftSource.split(':') : [];
  const right = rightSource ? rightSource.split(':') : [];
  const missing = 8 - left.length - right.length;
  const segments = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  return segments.reduce((value, segment) => (value << 16n) | BigInt(`0x${segment || '0'}`), 0n);
}

function ipv4InCidr(address, base, prefix) {
  const shift = 32 - prefix;
  return (ipv4ToInteger(address) >>> shift) === (ipv4ToInteger(base) >>> shift);
}

function ipv6InCidr(address, base, prefix) {
  const shift = BigInt(128 - prefix);
  return (ipv6ToBigInt(address) >> shift) === (ipv6ToBigInt(base) >> shift);
}

function isPublicHostname(hostname) {
  const normalizedHostname = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  const unwrapped = normalizedHostname.startsWith('[') && normalizedHostname.endsWith(']')
    ? normalizedHostname.slice(1, -1)
    : normalizedHostname;
  const ipVersion = isIP(unwrapped);
  if (ipVersion === 4) {
    return !blockedIpv4Cidrs.some(([base, prefix]) => ipv4InCidr(unwrapped, base, prefix));
  }
  if (ipVersion === 6) {
    return !blockedIpv6Cidrs.some(([base, prefix]) => ipv6InCidr(unwrapped, base, prefix));
  }
  return normalizedHostname.includes('.')
    && !['localhost', 'local', 'internal', 'home.arpa', 'invalid', 'test'].some((suffix) => (
      normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`)
    ));
}

const externalUrl = z.url().refine((value) => {
  const parsed = new URL(value);
  return ['http:', 'https:'].includes(parsed.protocol)
    && !parsed.username
    && !parsed.password
    && isPublicHostname(parsed.hostname.toLowerCase());
}, 'evidenceUrl must be an external HTTP(S) URL');
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

const evidencePath = safeRelativePath.refine(
  (value) => /^docs\/notes\/project\/assets\/review-cover-rights\/[a-z0-9][a-z0-9-]*\/rights-evidence\.(?:html|pdf|txt|png|jpg)$/.test(value),
  'rights evidence path must use the canonical per-record non-Markdown evidence path',
);

const redistributionScope = z.literal('public website redistribution of the exact cover asset');

export const bibliographicIdentitySchema = z.object({
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  publisher: z.string().trim().min(1),
  isbn13: z.string().regex(/^97[89]\d{10}$/),
  editionLabel: z.string().trim().min(1),
  publicationYear: z.number().int().min(1000).max(9999).optional(),
}).strict();

const redistributionLicenseEvidenceSchema = z.object({
  type: z.literal('redistribution-license'),
  evidenceUrl: externalUrl,
  evidencePath,
  evidenceChecksum: checksum,
  retrievedAt: calendarDate,
  scope: redistributionScope,
}).strict();

const writtenPermissionEvidenceSchema = z.object({
  type: z.literal('written-permission'),
  evidencePath,
  evidenceChecksum: checksum,
  retrievedAt: calendarDate,
  scope: redistributionScope,
}).strict();

export const reviewCoverRightsEvidenceSchema = z.discriminatedUnion('type', [
  redistributionLicenseEvidenceSchema,
  writtenPermissionEvidenceSchema,
]);

export const reviewCoverRedistributionReceiptSchema = z.object({
  decisionDocument,
  decisionChecksum: checksum,
}).strict();

const approvedBy = z.array(z.string().min(1));

export const reviewCoverRedistributionDecisionSchema = z.object({
  version: z.literal(1),
  state: z.literal('approved'),
  decision: z.literal('approve-public-redistribution'),
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
  bibliographicIdentity: bibliographicIdentitySchema,
  rightsEvidence: reviewCoverRightsEvidenceSchema,
  approval: z.object({
    approvedBy,
    recordedAt: calendarDate,
  }).strict(),
}).strict().superRefine((value, context) => {
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
  const extension = value.rightsEvidence.evidencePath.split('.').at(-1);
  if (value.rightsEvidence.evidencePath !== canonicalReviewCoverRightsEvidencePath(value.recordId, extension)) {
    context.addIssue({
      code: 'custom',
      path: ['rightsEvidence', 'evidencePath'],
      message: 'rights evidence path must match the exact review record',
    });
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
  sourceUrl: externalUrl,
  verifiedAt: calendarDate,
  bibliographicIdentity: bibliographicIdentitySchema,
  rightsEvidence: reviewCoverRightsEvidenceSchema,
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
  if (!value.source.rightsEvidence.evidencePath.startsWith(
    `docs/notes/project/assets/review-cover-rights/${value.recordId}/`,
  )) {
    context.addIssue({
      code: 'custom',
      path: ['source', 'rightsEvidence', 'evidencePath'],
      message: 'registered rights evidence must belong to its exact record',
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

function assertEqual(label, actual, expected, claim) {
  if (actual !== expected) {
    throw new Error(`${claim.collection}/${claim.recordId}/${claim.mediaId}: registry ${label} must match the exact review cover claim`);
  }
}

export function assertRegisteredReviewCoverApproval(registry, claim) {
  const registered = registry.approvals.find((entry) => entry.decisionDocument === claim.decisionDocument);
  if (!registered) {
    throw new Error(`${claim.collection}/${claim.recordId}/${claim.mediaId}: review cover decision is not registered for independent approval`);
  }
  for (const field of ['collection', 'recordId', 'mediaId', 'decisionDocument', 'decisionChecksum']) {
    assertEqual(field === 'decisionChecksum' ? 'decision checksum' : field, registered[field], claim[field], claim);
  }
  for (const field of ['path', 'checksum', 'width', 'height', 'kind', 'sourceUrl', 'verifiedAt']) {
    assertEqual(`source ${field}`, registered.source[field], claim.source[field], claim);
  }
  for (const field of ['title', 'publisher', 'isbn13', 'editionLabel', 'publicationYear']) {
    assertEqual(
      `bibliographic identity ${field}`,
      registered.source.bibliographicIdentity[field],
      claim.source.bibliographicIdentity[field],
      claim,
    );
  }
  if (
    registered.source.bibliographicIdentity.authors.length !== claim.source.bibliographicIdentity.authors.length
    || registered.source.bibliographicIdentity.authors.some((author, index) => (
      author !== claim.source.bibliographicIdentity.authors[index]
    ))
  ) {
    throw new Error(`${claim.collection}/${claim.recordId}/${claim.mediaId}: registry bibliographic identity authors must match the exact review cover claim`);
  }
  for (const field of ['type', 'evidenceUrl', 'evidencePath', 'evidenceChecksum', 'retrievedAt', 'scope']) {
    assertEqual(
      `rights evidence ${field}`,
      registered.source.rightsEvidence[field],
      claim.source.rightsEvidence[field],
      claim,
    );
  }
  return registered;
}

export function canonicalReviewCoverDecisionPath(recordId) {
  return `docs/notes/project/assets/review-cover-rights/${recordId}/redistribution-decision.yml`;
}

export function canonicalReviewCoverRightsEvidencePath(recordId, extension = 'txt') {
  return `docs/notes/project/assets/review-cover-rights/${recordId}/rights-evidence.${extension}`;
}
