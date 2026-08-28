import { z } from 'zod';

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const generatedMediaEvidenceReceiptSchema = z.object({
  decisionManifest: z.string().regex(
    /^docs\/notes\/project\/assets\/form-and-thought-generated\/[a-z0-9][a-z0-9-]*\/decision-manifest\.yml$/,
    'generated media evidence must use a canonical FORM & THOUGHT decision manifest path',
  ),
  decisionManifestChecksum: checksumSchema,
  candidateId: z.string().regex(/^[A-Z][0-9]{2}$/),
}).strict();

const publicAssetHref = z.string().regex(
  /^\/assets\/content\/(?:analysis|articles|ideas|reviews|travel|thoughts)\/[a-z0-9][a-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+\.(?:jpg|jpeg|png|webp|avif)$/,
  'media src must be a canonical public content asset path',
);

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
});

export type GeneratedMediaEvidenceReceipt = z.infer<typeof generatedMediaEvidenceReceiptSchema>;
export type PublicMedia = z.infer<typeof publicMediaSchema>;
