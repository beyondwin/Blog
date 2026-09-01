import { z } from 'zod';

const sha256IdSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const sha256ChecksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const recordIdSchema = z.string().regex(/^(?:articles|reviews|thoughts)\/[a-z0-9][a-z0-9-]*$/u);
const answerOnlyRecordIdSchema = z.string().regex(/^answer-only\/[a-z0-9][a-z0-9-]*$/u);
const publicAnswerRecordIdSchema = z.union([recordIdSchema, answerOnlyRecordIdSchema]);
const canonicalRecordPathSchema = z.string().regex(/^\/(?:articles|reviews|thoughts)\/[a-z0-9][a-z0-9-]*\/$/u);
const canonicalEvidencePathSchema = z.string().regex(/^\/evidence\/[a-f0-9]{64}\/$/u);
const plainTextSchema = z.string().trim().min(1).refine(
  (value) => !/<\/?[A-Za-z][^>]*>/u.test(value) && !/\[[^\]]+\]\([^)]+\)/u.test(value),
  'plain text must not contain HTML or Markdown links',
);

function codePointCompare(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index].codePointAt(0)! - rightPoints[index].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export const publicAnswerScopeSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('private') }).strict(),
  z.object({ scope: z.literal('answer-only'), includeInAnswers: z.literal(true) }).strict(),
  z.object({ scope: z.literal('published'), includeInAnswers: z.boolean() }).strict(),
]);

const publicAnswerCollectionSchema = z.enum(['articles', 'reviews', 'thoughts', 'answer-only']);
const publicAnswerPathSchema = z.union([canonicalRecordPathSchema, canonicalEvidencePathSchema]);

export const publicAnswerChunkSchema = z.object({
  chunkId: sha256IdSchema,
  recordId: publicAnswerRecordIdSchema,
  collection: publicAnswerCollectionSchema,
  canonicalPath: publicAnswerPathSchema,
  title: plainTextSchema,
  headingPath: z.array(plainTextSchema),
  ordinal: z.number().int().positive(),
  text: plainTextSchema.refine((value) => Array.from(value).length <= 1200),
  checksum: sha256ChecksumSchema,
}).strict();

export const publicAnswerEvidenceSchema = z.object({
  evidenceId: sha256IdSchema,
  chunkId: sha256IdSchema,
  recordId: publicAnswerRecordIdSchema,
  collectionLabel: plainTextSchema,
  recordTitle: plainTextSchema,
  canonicalPath: publicAnswerPathSchema,
  locator: z.object({
    kind: z.enum(['heading-paragraph', 'evidence-page']),
    label: plainTextSchema,
    ordinal: z.number().int().positive(),
  }).strict(),
  excerpt: plainTextSchema.refine((value) => Array.from(value).length <= 1200),
  excerptChecksum: sha256ChecksumSchema,
}).strict();

export const answerReleaseIdentitySchema = z.object({
  schemaVersion: z.literal(1),
  contentReleaseId: sha256IdSchema,
  contentManifestHash: sha256ChecksumSchema,
  contentArtifactHash: sha256ChecksumSchema,
  corpusApprovalHash: sha256ChecksumSchema,
  chunkerVersion: z.literal('public-blocks-v1'),
  normalizerVersion: z.literal('nfkc-lower-hangul-ngram-v1'),
  collections: z.tuple([z.literal('articles'), z.literal('reviews'), z.literal('thoughts')]),
}).strict();

const answerArtifactFileSchema = z.object({
  path: z.enum(['chunks.ndjson', 'evidence.ndjson', 'index-inputs.ndjson', 'lexical-index.json']),
  checksum: sha256ChecksumSchema,
  bytes: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
}).strict();

export const publicAnswerCorpusApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    recordId: recordIdSchema,
    recordChecksum: sha256ChecksumSchema,
  }).strict()).max(1000),
}).strict().superRefine((approval, context) => {
  for (let index = 1; index < approval.entries.length; index += 1) {
    const previous = approval.entries[index - 1].recordId;
    const current = approval.entries[index].recordId;
    if (previous === current) {
      context.addIssue({ code: 'custom', path: ['entries', index, 'recordId'], message: 'record IDs must be unique' });
    } else if (codePointCompare(previous, current) > 0) {
      context.addIssue({ code: 'custom', path: ['entries', index, 'recordId'], message: 'record IDs must be code-point sorted' });
    }
  }
});

export const publicAnswerIndexInputSchema = z.object({
  chunkId: sha256IdSchema,
  chunkChecksum: sha256ChecksumSchema,
  recordId: publicAnswerRecordIdSchema,
  collection: publicAnswerCollectionSchema,
  canonicalPath: publicAnswerPathSchema,
  title: plainTextSchema,
  headingPath: z.array(plainTextSchema),
  text: plainTextSchema,
  searchText: plainTextSchema,
}).strict();

export const publicAnswerLexicalIndexSchema = z.object({
  schemaVersion: z.literal(1),
  normalizerVersion: z.literal('nfkc-lower-hangul-ngram-v1'),
  documents: z.array(z.object({ chunkId: sha256IdSchema, length: z.number().int().positive() }).strict()),
  postings: z.record(z.string().min(1), z.array(z.object({
    document: z.number().int().nonnegative(),
    frequency: z.number().int().positive(),
  }).strict())),
}).strict();

export const publicAnswerReleaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  answerReleaseId: sha256IdSchema,
  identity: answerReleaseIdentitySchema,
  files: z.object({
    chunks: answerArtifactFileSchema,
    evidence: answerArtifactFileSchema,
    indexInputs: answerArtifactFileSchema,
    lexicalIndex: answerArtifactFileSchema,
  }).strict(),
  counts: z.object({
    records: z.number().int().nonnegative(),
    chunks: z.number().int().nonnegative(),
    evidence: z.number().int().nonnegative(),
    answerOnly: z.literal(0),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const expectedPaths = {
    chunks: 'chunks.ndjson',
    evidence: 'evidence.ndjson',
    indexInputs: 'index-inputs.ndjson',
    lexicalIndex: 'lexical-index.json',
  } as const;
  for (const [key, expectedPath] of Object.entries(expectedPaths) as Array<[keyof typeof expectedPaths, string]>) {
    const file = manifest.files[key];
    if (file.path !== expectedPath) {
      context.addIssue({ code: 'custom', path: ['files', key, 'path'], message: `path must equal ${expectedPath}` });
    }
  }
  for (const key of ['chunks', 'evidence', 'indexInputs'] as const) {
    const file = manifest.files[key];
    if ((file.count === 0) !== (file.bytes === 0)) {
      context.addIssue({ code: 'custom', path: ['files', key], message: 'NDJSON bytes must be zero exactly when count is zero' });
    }
  }
  if (manifest.files.lexicalIndex.bytes === 0) {
    context.addIssue({ code: 'custom', path: ['files', 'lexicalIndex', 'bytes'], message: 'lexical index bytes must be positive' });
  }
});

export const publicAskRequestSchema = z.object({
  version: z.literal(1),
  question: z.string().transform((value) => value.trim()).pipe(
    z.string().min(1).refine((value) => Array.from(value).length <= 500),
  ),
  contentReleaseId: sha256IdSchema,
  answerReleaseId: sha256IdSchema,
}).strict();

const publicAnswerClaimSchema = z.object({
  id: z.string().regex(/^claim-[1-5]$/u),
  text: plainTextSchema.refine((value) => Array.from(value).length <= 600),
  evidenceIds: z.array(sha256IdSchema).min(1).max(6),
}).strict().superRefine((claim, context) => {
  if (new Set(claim.evidenceIds).size !== claim.evidenceIds.length) {
    context.addIssue({ code: 'custom', path: ['evidenceIds'], message: 'evidence IDs must be unique' });
  }
});

const publicAnswerResponseSchema = z.object({
  kind: z.literal('answer'),
  answerReleaseId: sha256IdSchema,
  claims: z.array(publicAnswerClaimSchema).min(1).max(5),
  evidence: z.array(publicAnswerEvidenceSchema).min(1).max(6),
}).strict().superRefine((response, context) => {
  const claimIds = new Set<string>();
  for (const [index, claim] of response.claims.entries()) {
    if (claimIds.has(claim.id)) {
      context.addIssue({ code: 'custom', path: ['claims', index, 'id'], message: 'claim IDs must be unique' });
    }
    claimIds.add(claim.id);
  }
  const evidenceIds = new Set<string>();
  for (const [index, item] of response.evidence.entries()) {
    if (evidenceIds.has(item.evidenceId)) {
      context.addIssue({ code: 'custom', path: ['evidence', index, 'evidenceId'], message: 'evidence IDs must be unique' });
    }
    evidenceIds.add(item.evidenceId);
  }
  const referenced = new Set(response.claims.flatMap((claim) => claim.evidenceIds));
  for (const [index, claim] of response.claims.entries()) {
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        context.addIssue({ code: 'custom', path: ['claims', index, 'evidenceIds'], message: 'claim evidence must resolve' });
      }
    }
  }
  for (const [index, item] of response.evidence.entries()) {
    if (!referenced.has(item.evidenceId)) {
      context.addIssue({ code: 'custom', path: ['evidence', index, 'evidenceId'], message: 'response evidence must be referenced' });
    }
  }
});

export const publicAskResponseSchema = z.discriminatedUnion('kind', [
  publicAnswerResponseSchema,
  z.object({
    kind: z.literal('search'),
    reason: z.enum([
      'insufficient-evidence',
      'unsupported-question',
      'provider-disabled',
      'release-mismatch',
      'budget-exhausted',
    ]),
  }).strict(),
  z.object({
    kind: z.literal('error'),
    code: z.enum(['timeout', 'unavailable', 'rate-limited', 'invalid-response']),
    retryable: z.boolean(),
  }).strict(),
]);

export type PublicAnswerScope = z.infer<typeof publicAnswerScopeSchema>;
export type PublicAnswerChunk = z.infer<typeof publicAnswerChunkSchema>;
export type PublicAnswerEvidence = z.infer<typeof publicAnswerEvidenceSchema>;
export type AnswerReleaseIdentity = z.infer<typeof answerReleaseIdentitySchema>;
export type PublicAnswerFileDescriptor = z.infer<typeof answerArtifactFileSchema>;
export type PublicAnswerCorpusApproval = z.infer<typeof publicAnswerCorpusApprovalSchema>;
export type PublicAnswerIndexInput = z.infer<typeof publicAnswerIndexInputSchema>;
export type PublicAnswerLexicalIndex = z.infer<typeof publicAnswerLexicalIndexSchema>;
export type PublicAnswerReleaseManifest = z.infer<typeof publicAnswerReleaseManifestSchema>;
export type PublicAskRequest = z.infer<typeof publicAskRequestSchema>;
export type PublicAskClaim = z.infer<typeof publicAnswerClaimSchema>;
export type PublicAskResponse = z.infer<typeof publicAskResponseSchema>;
