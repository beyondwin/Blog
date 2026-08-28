import { z } from 'zod';

export const sourceCollections = ['analysis', 'articles', 'ideas', 'reviews', 'travel', 'thoughts'] as const;

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const isoDate = z.coerce.date().transform((value) => value.toISOString());
const externalUrl = z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));

const relationshipSchema = z.object({
  target: z.string().regex(/^(analysis|articles|ideas|reviews|travel|thoughts|memory)\/[a-z0-9][a-z0-9-]*$/),
  relation: z.enum(['supports', 'extends', 'instantiates', 'refines', 'contradicts', 'related']),
  reason: z.string().trim().min(1).max(160),
});

function sharedFields<Collection extends (typeof sourceCollections)[number]>(collection: Collection) {
  return {
    collection: z.literal(collection),
    id: idSchema,
    href: z.string().regex(new RegExp(`^/${collection}/[a-z0-9][a-z0-9-]*/$`)),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    createdAt: isoDate,
    updatedAt: isoDate,
    tags: z.array(z.string().trim().min(1)).default([]),
    status: z.enum(['review', 'published', 'archived']).default('review'),
    draft: z.boolean().default(false),
    dek: z.string().trim().min(1).optional(),
    relationships: z.array(relationshipSchema).max(3).default([]),
    body: z.string().default(''),
  };
}

const analysisSourceRecordSchema = z.object({
  ...sharedFields('analysis'),
  sourceUrl: externalUrl,
  sourceTitle: z.string().trim().min(1),
  comment: z.string().trim().min(1),
  format: z.enum(['research-report', 'essay', 'visual-page']),
});

const articleSourceRecordSchema = z.object({
  ...sharedFields('articles'),
  recordKind: z.enum(['technical-note', 'research', 'essay']).optional(),
  evidenceState: z.enum(['personal', 'source-grounded', 'verified']).optional(),
  featuredMedia: z.string().trim().min(1).optional(),
});

const thoughtSourceRecordSchema = z.object({
  ...sharedFields('thoughts'),
  featuredMedia: z.string().trim().min(1).optional(),
});

const ideaSourceRecordSchema = z.object({
  ...sharedFields('ideas'),
  maturity: z.enum(['seed', 'sketch', 'proposal']).default('sketch'),
  prompt: z.string().trim().min(1).optional(),
});

const reviewSourceRecordSchema = z.object({
  ...sharedFields('reviews'),
  itemType: z.enum(['book', 'article', 'tool', 'course', 'other']),
  itemTitle: z.string().trim().min(1),
  itemAuthor: z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1),
  ]).optional(),
  isbn13: z.string().regex(/^97[89]\d{10}$/).optional(),
  editionLabel: z.string().trim().min(1).optional(),
  readEditionVerified: z.boolean().default(false),
  publisher: z.string().trim().min(1).optional(),
  coverState: z.enum(['verified', 'hold']).optional(),
  coverMedia: z.string().trim().min(1).optional(),
  verdict: z.string().trim().min(1).optional(),
  rating: z.number().min(0).max(5).optional(),
  completedAt: isoDate.optional(),
  sourceUrl: externalUrl.optional(),
});

const travelSourceRecordSchema = z.object({
  ...sharedFields('travel'),
  location: z.string().trim().min(1),
  visitedAt: isoDate.optional(),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
  leadMedia: z.string().trim().min(1).optional(),
  privacyReviewed: z.boolean().default(false),
});

export const sourceRecordSchema = z.discriminatedUnion('collection', [
  analysisSourceRecordSchema,
  articleSourceRecordSchema,
  thoughtSourceRecordSchema,
  ideaSourceRecordSchema,
  reviewSourceRecordSchema,
  travelSourceRecordSchema,
]).superRefine((record, context) => {
  if (record.updatedAt < record.createdAt) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must be on or after createdAt',
    });
  }
  if (record.collection === 'reviews') {
    if (record.status === 'published') {
      if (!record.itemAuthor || !record.isbn13 || !record.publisher || !record.verdict || !record.coverState) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'published review requires itemAuthor, isbn13, publisher, verdict, and coverState',
        });
      }
      if (record.coverState === 'verified' && !record.coverMedia) {
        context.addIssue({
          code: 'custom',
          path: ['coverMedia'],
          message: 'coverState verified requires coverMedia',
        });
      }
      if (record.coverState === 'hold' && record.coverMedia) {
        context.addIssue({
          code: 'custom',
          path: ['coverMedia'],
          message: 'coverState hold forbids coverMedia',
        });
      }
    }
  }
  if (
    record.collection === 'travel'
    && record.status === 'published'
    && (record.privacyReviewed !== true || !record.leadMedia)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'published travel requires privacyReviewed true and leadMedia',
    });
  }
});

export type SourceRecord = z.infer<typeof sourceRecordSchema>;

function safeRelativePath(field: string) {
  return z.string().trim().min(1).refine((value) => (
    !value.includes('\\')
    && !value.startsWith('/')
    && !/^[A-Za-z]:\//.test(value)
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  ), `${field} must be a canonical relative path`);
}

export const verifiableSourceInputFormatSchema = z.enum(['jpg', 'jpeg', 'png', 'webp']);
export type VerifiableSourceInputFormat = z.infer<typeof verifiableSourceInputFormatSchema>;

const sourceMediaInputFileSchema = safeRelativePath('source media file').refine(
  (value) => verifiableSourceInputFormatSchema.options.some((format) => value.endsWith(`.${format}`)),
  'source media input must use a verifiable PNG, JPEG, or WebP file',
);

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const generatedCandidateIdSchema = z.string().regex(/^[A-Z][0-9]{2}$/);
const generatedDecisionManifestPathSchema = safeRelativePath('generated media decision manifest').refine(
  (value) => /^docs\/notes\/project\/assets\/form-and-thought-generated\/[a-z0-9][a-z0-9-]*\/decision-manifest\.yml$/.test(value),
  'generated media decision manifest must use the durable FORM & THOUGHT evidence path',
);

const generatedMediaSourceSchema = z.object({
  provider: z.literal('openai'),
  generator: z.literal('codex-built-in-image-generation'),
  model: z.string().trim().min(1),
  modelVersion: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  candidateId: generatedCandidateIdSchema,
  decisionManifestChecksum: checksumSchema,
}).strict();

export const sourceMediaManifestSchema = z.object({
  version: z.literal(1),
  items: z.array(z.object({
    id: idSchema,
    file: sourceMediaInputFileSchema,
    kind: z.enum(['book-cover', 'photo', 'diagram', 'screenshot', 'illustration']),
    alt: z.string().trim().min(1),
    caption: z.string().trim().min(1).optional(),
    credit: z.string().trim().min(1),
    sourceUrl: externalUrl.optional(),
    sourcePath: safeRelativePath('sourcePath').optional(),
    sourceKind: z.literal('repository-generated').optional(),
    generation: generatedMediaSourceSchema.optional(),
    isbn13: z.string().regex(/^97[89]\d{10}$/).optional(),
    edition: z.string().trim().min(1).optional(),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rightsNote: z.string().trim().min(1),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    checksum: checksumSchema,
  }).superRefine((item, context) => {
    if (Number(Boolean(item.sourceUrl)) + Number(Boolean(item.sourcePath)) !== 1) {
      context.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'media item requires exactly one source' });
    }
    if (Number(item.width !== undefined) + Number(item.height !== undefined) === 1) {
      context.addIssue({ code: 'custom', path: ['width'], message: 'media dimensions require width and height' });
    }
    if (item.kind === 'book-cover' && (!item.sourceUrl || !item.isbn13 || !item.edition)) {
      context.addIssue({
        code: 'custom',
        path: ['kind'],
        message: `book-cover ${item.id} requires sourceUrl, isbn13 and edition`,
      });
    }
    const decisionBound = Boolean(
      item.sourcePath && generatedDecisionManifestPathSchema.safeParse(item.sourcePath).success,
    );
    if (decisionBound && item.sourceKind !== 'repository-generated') {
      context.addIssue({
        code: 'custom',
        path: ['sourceKind'],
        message: 'decision-bound media requires sourceKind repository-generated',
      });
    }
    if (item.sourceKind === 'repository-generated' && !item.generation) {
      context.addIssue({
        code: 'custom',
        path: ['generation'],
        message: 'repository-generated sourceKind requires generation metadata',
      });
    }
    if (item.generation) {
      if (item.sourceKind !== 'repository-generated') {
        context.addIssue({
          code: 'custom',
          path: ['sourceKind'],
          message: 'sourceKind must be repository-generated when generation metadata is present',
        });
      }
      if (!item.sourcePath || !generatedDecisionManifestPathSchema.safeParse(item.sourcePath).success) {
        context.addIssue({
          code: 'custom',
          path: ['sourcePath'],
          message: 'generated media requires its durable decision manifest as sourcePath',
        });
      }
      if (item.sourceUrl) {
        context.addIssue({
          code: 'custom',
          path: ['sourceUrl'],
          message: 'generated media must not use sourceUrl',
        });
      }
    }
  })),
});

const generatedPlacementSchema = z.object({
  slot: z.enum(['homeHero', 'homePick', 'indexLandscape', 'detailHero']),
  desktopCrop: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().positive(), z.number().int().positive()]),
  mobileCrop: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().positive(), z.number().int().positive()]),
  focalPoint: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  safeArea: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().positive(), z.number().int().positive()]).nullable(),
}).strict();

export const generatedMediaDecisionManifestSchema = z.object({
  version: z.literal(1),
  batchId: idSchema,
  generator: z.object({
    provider: z.literal('openai'),
    generator: z.literal('codex-built-in-image-generation'),
    model: z.string().trim().min(1),
    modelVersion: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
    generatedAt: z.iso.datetime({ offset: true }),
  }).strict(),
  approval: z.object({
    state: z.enum(['pending', 'approved', 'rejected']),
    selectedCandidateIds: z.array(generatedCandidateIdSchema),
    approvedBy: z.array(z.string().trim().min(1)).min(1),
    recordedAt: z.iso.datetime({ offset: true }),
    evidence: z.string().trim().min(1),
  }).strict(),
  rightsReview: z.object({
    state: z.enum(['pending', 'approved', 'hold']),
    decision: z.enum(['approve-repository-publication', 'hold']),
    checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    decidedBy: z.string().trim().min(1),
    caveat: z.string().trim().min(1),
    sources: z.array(z.object({
      url: externalUrl,
      checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).strict()).min(1),
    inspection: z.object({
      externalImageInputs: z.boolean(),
      namedOrLivingArtist: z.boolean(),
      recognizablePersonOrProduct: z.boolean(),
      readableMark: z.boolean(),
    }).strict(),
  }).strict(),
  approvedContactSheet: z.object({
    path: safeRelativePath('approved contact sheet path'),
    checksum: checksumSchema,
  }).strict(),
  assets: z.array(z.object({
    candidateId: generatedCandidateIdSchema,
    slot: z.enum(['homeHero', 'homePick/indexLandscape', 'detailHero']),
    collection: z.enum(['analysis', 'articles', 'ideas', 'reviews', 'travel', 'thoughts']),
    recordId: idSchema,
    mediaId: idSchema,
    file: sourceMediaInputFileSchema,
    sourcePath: safeRelativePath('approved generated source path'),
    checksum: checksumSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    promptId: z.string().trim().min(1).optional(),
    placements: z.array(generatedPlacementSchema).default([]),
  }).strict()).min(1),
}).strict().superRefine((manifest, context) => {
  const selected = new Set(manifest.approval.selectedCandidateIds);
  if (selected.size !== manifest.approval.selectedCandidateIds.length) {
    context.addIssue({ code: 'custom', path: ['approval', 'selectedCandidateIds'], message: 'selected candidate IDs must be unique' });
  }
  const assetCandidates = new Set(manifest.assets.map((asset) => asset.candidateId));
  if (assetCandidates.size !== manifest.assets.length) {
    context.addIssue({ code: 'custom', path: ['assets'], message: 'approved generated assets must have unique candidate IDs' });
  }
  if (
    manifest.approval.state === 'approved'
    && (selected.size !== assetCandidates.size || [...selected].some((id) => !assetCandidates.has(id)))
  ) {
    context.addIssue({ code: 'custom', path: ['approval', 'selectedCandidateIds'], message: 'approved selection must exactly match approved assets' });
  }
  if (manifest.approval.state === 'approved') {
    const approvalRoles = new Set(manifest.approval.approvedBy);
    if (
      manifest.approval.approvedBy.length !== 2
      || approvalRoles.size !== manifest.approval.approvedBy.length
      || approvalRoles.size !== 2
      || !approvalRoles.has('controller')
      || !approvalRoles.has('independent-visual-reviewer')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['approval', 'approvedBy'],
        message: 'approvedBy must contain exactly controller and independent-visual-reviewer',
      });
    }
  }
  const expectedContactSheet = `docs/notes/project/assets/form-and-thought-generated/${manifest.batchId}/approved-contact-sheet.png`;
  if (manifest.approvedContactSheet.path !== expectedContactSheet) {
    context.addIssue({
      code: 'custom',
      path: ['approvedContactSheet', 'path'],
      message: 'approvedContactSheet path must be the canonical PNG in the same batch',
    });
  }
});

export function generatedMediaRightsNote(
  decision: GeneratedMediaDecisionManifest['rightsReview'],
): string {
  const ruling = decision.decision === 'approve-repository-publication'
    ? 'Repository publication approved'
    : 'Repository publication held';
  return `${ruling} with caveat: ${decision.caveat}`;
}

const memoryThoughtSchema = z.object({
  slug: idSchema,
  claimKo: z.string().trim().min(1),
  claimEn: z.string().trim().min(1).optional(),
  memoryType: z.enum(['semantic', 'procedural', 'reflective', 'episodic']),
  origin: z.enum(['author', 'external', 'synthesized']),
  topics: z.array(z.string().trim().min(1)),
  theses: z.array(z.string().trim().min(1)),
  sources: z.array(z.string().trim().min(1)),
  body: z.string(),
});

const memorySourceSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  path: safeRelativePath('memory source path').optional(),
  url: externalUrl.optional(),
});

const memoryEdgeSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

export const publicMemoryProjectionSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }).nullable(),
  thoughts: z.array(memoryThoughtSchema),
  sources: z.array(memorySourceSchema),
  edges: z.array(memoryEdgeSchema),
});

export type SourceMediaManifest = z.infer<typeof sourceMediaManifestSchema>;
export type GeneratedMediaDecisionManifest = z.infer<typeof generatedMediaDecisionManifestSchema>;
export type PublicMemoryProjection = z.infer<typeof publicMemoryProjectionSchema>;
