import { z } from 'zod';

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const generatedMediaEvidenceReceiptSchema = z.object({
  decisionManifest: z.string().refine((value) => (
    /^docs\/notes\/project\/assets\/form-and-thought-generated\/[a-z0-9][a-z0-9-]*\/decision-manifest\.yml$/.test(value)
      || /^docs\/notes\/project\/assets\/form-and-thought-generated\/articles\/decision-manifest-[a-z0-9][a-z0-9-]*\.yml$/.test(value)
  ), 'generated media evidence must use a canonical FORM & THOUGHT decision manifest path'),
  decisionManifestChecksum: checksumSchema,
  candidateId: z.string().regex(/^[A-Z]{1,2}[0-9]{2}$/),
}).strict();

const publicAssetHref = z.string().regex(
  /^\/assets\/content\/(?:analysis|articles|ideas|reviews|travel|thoughts)\/[a-z0-9][a-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+\.(?:jpg|jpeg|png|webp|avif)$/,
  'media src must be a canonical public content asset path',
);

export const reviewCoverBibliographicIdentitySchema = z.object({
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  publisher: z.string().trim().min(1),
  isbn13: z.string().regex(/^97[89]\d{10}$/),
  editionLabel: z.string().trim().min(1),
  publicationYear: z.number().int().min(1000).max(9999).optional(),
}).strict();

export const reviewCoverRedistributionEvidenceSchema = z.object({
  state: z.literal('approved'),
  decision: z.literal('approve-public-redistribution'),
  decisionDocument: z.string().regex(
    /^docs\/notes\/project\/assets\/review-cover-rights\/[a-z0-9][a-z0-9-]*\/redistribution-decision\.yml$/,
  ),
  decisionChecksum: checksumSchema,
  sourceAsset: z.string().regex(
    /^\/assets\/content\/reviews\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/,
  ),
  sourceChecksum: checksumSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bibliographicIdentity: reviewCoverBibliographicIdentitySchema,
}).strict();

export const publicMediaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.enum(['book-cover', 'photo', 'diagram', 'screenshot', 'illustration']),
  src: publicAssetHref,
  alt: z.string().trim().min(1),
  caption: z.string().trim().min(1).optional(),
  credit: z.string().trim().min(1),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rightsNote: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.enum(['jpg', 'jpeg', 'png', 'webp', 'avif']),
  checksum: checksumSchema,
  redistributionEvidence: reviewCoverRedistributionEvidenceSchema.optional(),
  rightsEvidence: z.never().optional(),
  evidencePath: z.never().optional(),
  evidenceUrl: z.never().optional(),
  evidenceChecksum: z.never().optional(),
  retrievedAt: z.never().optional(),
  scope: z.never().optional(),
}).superRefine((media, context) => {
  if (!media.redistributionEvidence) return;
  if (media.kind !== 'book-cover') {
    context.addIssue({ code: 'custom', path: ['kind'], message: 'redistribution evidence is only valid for book-cover media' });
  }
  const evidence = media.redistributionEvidence;
  for (const [field, actual, expected] of [
    ['sourceAsset', evidence.sourceAsset, media.src],
    ['sourceChecksum', evidence.sourceChecksum, media.checksum],
    ['width', evidence.width, media.width],
    ['height', evidence.height, media.height],
  ] as const) {
    if (actual !== expected) {
      context.addIssue({ code: 'custom', path: ['redistributionEvidence', field], message: `${field} must match the public cover media` });
    }
  }
});

export type GeneratedMediaEvidenceReceipt = z.infer<typeof generatedMediaEvidenceReceiptSchema>;
export type ReviewCoverRedistributionEvidence = z.infer<typeof reviewCoverRedistributionEvidenceSchema>;
export type ReviewCoverBibliographicIdentity = z.infer<typeof reviewCoverBibliographicIdentitySchema>;
export type PublicMedia = z.infer<typeof publicMediaSchema>;
