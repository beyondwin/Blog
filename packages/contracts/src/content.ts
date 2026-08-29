import { z } from 'zod';
import { publicMediaSchema } from './media';

export const publicCollections = ['analysis', 'articles', 'ideas', 'reviews', 'travel', 'thoughts', 'memory'] as const;

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const isoDateSchema = z.iso.datetime({ offset: true });
const externalUrlSchema = z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const publicContentRouteSchema = z.string().regex(
  /^\/(?:analysis|articles|ideas|reviews|travel|thoughts)\/[a-z0-9][a-z0-9-]*\/$/,
  'href must be an approved public content route',
);
const publicContentSourceHrefSchema = z.union([publicContentRouteSchema, externalUrlSchema]);

export const publicRelationshipSchema = z.object({
  target: z.string().regex(/^(analysis|articles|ideas|reviews|travel|thoughts|memory)\/[a-z0-9][a-z0-9-]*$/),
  relation: z.enum(['supports', 'extends', 'instantiates', 'refines', 'contradicts', 'related']),
  reason: z.string().trim().min(1).max(160),
});

export const publicMemoryLinkSchema = z.object({
  slug: idSchema,
  claimKo: z.string().trim().min(1),
  href: z.string().regex(/^\/memory\/[a-z0-9][a-z0-9-]*\/$/),
  kind: z.enum(['direct', 'related']),
});

const commonPublicFields = {
  id: idSchema,
  href: z.string(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  tags: z.array(z.string().trim().min(1)),
  media: z.array(publicMediaSchema),
  relationships: z.array(publicRelationshipSchema).max(3),
  memoryLinks: z.array(publicMemoryLinkSchema),
  bodyHtml: z.string(),
  rightsEvidence: z.never().optional(),
  evidencePath: z.never().optional(),
  evidenceUrl: z.never().optional(),
  evidenceChecksum: z.never().optional(),
  retrievedAt: z.never().optional(),
  scope: z.never().optional(),
};

const analysisPublicRecordSchema = z.object({
  collection: z.literal('analysis'),
  ...commonPublicFields,
  sourceTitle: z.string().trim().min(1),
  sourceUrl: externalUrlSchema,
  comment: z.string().trim().min(1),
  format: z.enum(['research-report', 'essay', 'visual-page']),
});

const articlePublicRecordSchema = z.object({
  collection: z.literal('articles'),
  ...commonPublicFields,
  recordKind: z.enum(['technical-note', 'research', 'essay']).optional(),
  evidenceState: z.enum(['personal', 'source-grounded', 'verified']).optional(),
  featuredMedia: idSchema.optional(),
});

const thoughtPublicRecordSchema = z.object({
  collection: z.literal('thoughts'),
  ...commonPublicFields,
  featuredMedia: idSchema.optional(),
});

const ideaPublicRecordSchema = z.object({
  collection: z.literal('ideas'),
  ...commonPublicFields,
  maturity: z.enum(['seed', 'sketch', 'proposal']),
});

const reviewPublicRecordSchema = z.object({
  collection: z.literal('reviews'),
  ...commonPublicFields,
  itemType: z.enum(['book', 'article', 'tool', 'course', 'other']),
  itemTitle: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  isbn13: z.string().regex(/^97[89]\d{10}$/).optional(),
  editionLabel: z.string().trim().min(1).optional(),
  readEditionVerified: z.boolean(),
  publisher: z.string().trim().min(1).optional(),
  publicationYear: z.number().int().min(1000).max(9999).optional(),
  coverState: z.enum(['verified', 'hold']).optional(),
  coverMedia: idSchema.optional(),
  verdict: z.string().trim().min(1).optional(),
  rating: z.number().min(0).max(5).optional(),
  completedAt: isoDateSchema.optional(),
  sourceUrl: externalUrlSchema.optional(),
});

const travelPublicRecordSchema = z.object({
  collection: z.literal('travel'),
  ...commonPublicFields,
  location: z.string().trim().min(1),
  visitedAt: isoDateSchema.optional(),
  leadMedia: idSchema.optional(),
});

const memoryPublicSourceSchema = z.object({
  title: z.string().trim().min(1),
  href: publicContentSourceHrefSchema,
});

const memoryCompanionSchema = z.object({
  slug: idSchema,
  claimKo: z.string().trim().min(1),
  href: z.string().regex(/^\/memory\/[a-z0-9][a-z0-9-]*\/$/),
});

const memoryPublicRecordSchema = z.object({
  collection: z.literal('memory'),
  ...commonPublicFields,
  claimKo: z.string().trim().min(1),
  claimEn: z.string().trim().min(1).optional(),
  body: z.string(),
  memoryType: z.enum(['semantic', 'procedural', 'reflective', 'episodic']),
  origin: z.enum(['author', 'external', 'synthesized']),
  topics: z.array(z.string().trim().min(1)),
  theses: z.array(z.string().trim().min(1)),
  sources: z.array(memoryPublicSourceSchema),
  companions: z.array(memoryCompanionSchema),
});

export const publicRecordSchema = z.discriminatedUnion('collection', [
  analysisPublicRecordSchema,
  articlePublicRecordSchema,
  thoughtPublicRecordSchema,
  ideaPublicRecordSchema,
  reviewPublicRecordSchema,
  travelPublicRecordSchema,
  memoryPublicRecordSchema,
]).superRefine((record, context) => {
  const expectedHref = `/${record.collection}/${record.id}/`;
  if (record.href !== expectedHref) {
    context.addIssue({ code: 'custom', path: ['href'], message: `href must equal ${expectedHref}` });
  }
  if (record.updatedAt < record.createdAt) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must be on or after createdAt',
    });
  }
  if (record.collection === 'reviews' && record.coverMedia) {
    const cover = record.media.find((media) => media.id === record.coverMedia);
    if (cover) {
      if (cover.kind !== 'book-cover') {
        context.addIssue({ code: 'custom', path: ['coverMedia'], message: 'coverMedia must resolve to kind book-cover' });
      }
      if (!cover.redistributionEvidence) {
        context.addIssue({ code: 'custom', path: ['coverMedia'], message: 'public cover media requires approved redistribution evidence' });
      } else {
        const identity = cover.redistributionEvidence.bibliographicIdentity;
        for (const [field, actual, expected] of [
          ['title', record.itemTitle, identity.title],
          ['publisher', record.publisher, identity.publisher],
          ['isbn13', record.isbn13, identity.isbn13],
          ['editionLabel', record.editionLabel, identity.editionLabel],
          ['publicationYear', record.publicationYear, identity.publicationYear],
        ] as const) {
          if (actual !== expected) {
            context.addIssue({
              code: 'custom',
              path: [field === 'title' ? 'itemTitle' : field],
              message: `review bibliographic identity ${field} must match the approved cover`,
            });
          }
        }
        if (
          record.authors.length !== identity.authors.length
          || record.authors.some((author, index) => author !== identity.authors[index])
        ) {
          context.addIssue({
            code: 'custom',
            path: ['authors'],
            message: 'review bibliographic identity authors must match the approved cover in source order',
          });
        }
      }
    }
  }
});

export type PublicRecord = z.infer<typeof publicRecordSchema>;
export type PublicCollection = PublicRecord['collection'];
