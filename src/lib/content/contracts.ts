import { z } from 'astro/zod';

export const contentStatus = z.enum(['review', 'published', 'archived']);
export const relationshipType = z.enum(['supports', 'extends', 'instantiates', 'refines', 'contradicts', 'related']);
export const relationshipSchema = z.object({
  target: z.string().regex(/^(analysis|articles|ideas|reviews|travel|memory)\/[a-z0-9][a-z0-9-]*$/),
  relation: relationshipType,
  reason: z.string().trim().min(1).max(160),
});

export const sharedFields = {
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  tags: z.array(z.string().trim().min(1)).default([]),
  status: contentStatus.default('review'),
  draft: z.boolean().default(false),
  dek: z.string().trim().min(1).optional(),
  relationships: z.array(relationshipSchema).max(3).default([]),
};

export const articleFields = {
  recordKind: z.enum(['technical-note', 'research', 'essay']).optional(),
  evidenceState: z.enum(['personal', 'source-grounded', 'verified']).optional(),
  featuredMedia: z.string().trim().min(1).optional(),
};

export const reviewFields = {
  itemAuthor: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]).optional(),
  isbn13: z.string().regex(/^97[89]\d{10}$/).optional(),
  editionLabel: z.string().trim().min(1).optional(),
  readEditionVerified: z.boolean().default(false),
  publisher: z.string().trim().min(1).optional(),
  coverState: z.enum(['verified', 'hold']).optional(),
  coverMedia: z.string().trim().min(1).optional(),
  verdict: z.string().trim().min(1).optional(),
};

export const ideaFields = { prompt: z.string().trim().min(1).optional() };
export const travelFields = {
  coordinates: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
  leadMedia: z.string().trim().min(1).optional(),
  privacyReviewed: z.boolean().default(false),
};

export type ContentRelationship = z.infer<typeof relationshipSchema>;
export type RecordKind = z.infer<typeof articleFields.recordKind>;
export type EvidenceState = z.infer<typeof articleFields.evidenceState>;
