import { z } from 'astro/zod';
import { parse } from 'yaml';
import { reviewCoverRedistributionReceiptSchema } from '../../../packages/content/src/media/review-cover-redistribution.mjs';

const mediaKindSchema = z.enum(['book-cover', 'photo', 'diagram', 'screenshot', 'illustration']);
const mediaFileSchema = safeRelativePath('file').refine(
  (value) => /\.(?:jpg|jpeg|png|webp|avif)$/.test(value),
  'file must use a lowercase .jpg, .jpeg, .png, .webp or .avif extension',
);
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
  candidateId: z.string().regex(/^[A-Z][0-9]{2}$/),
  decisionManifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

function safeRelativePath(field) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => {
      if (value.includes('\\')) return false;
      if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return false;
      return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
    }, `${field} must be a canonical repository-relative path without empty, . or .. segments`);
}

const externalUrlSchema = z
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'sourceUrl must be an external http or https URL');

const mediaItemSchema = z
  .object({
    id: z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    file: mediaFileSchema,
    kind: mediaKindSchema,
    alt: z.string().trim().min(1),
    caption: z.string().trim().min(1).optional(),
    credit: z.string().trim().min(1),
    sourceUrl: externalUrlSchema.optional(),
    sourcePath: safeRelativePath('sourcePath').optional(),
    sourceKind: z.literal('repository-generated').optional(),
    generation: generatedMediaSourceSchema.optional(),
    isbn13: z.string().regex(/^97[89]\d{10}$/).optional(),
    edition: z.string().trim().min(1).optional(),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rightsNote: z.string().trim().min(1),
    redistributionApproval: reviewCoverRedistributionReceiptSchema.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((item, context) => {
    if (Number(Boolean(item.sourceUrl)) + Number(Boolean(item.sourcePath)) !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'media item requires exactly one of sourceUrl or sourcePath',
        path: ['sourceUrl'],
      });
    }
    if (Number(item.width !== undefined) + Number(item.height !== undefined) === 1) {
      context.addIssue({
        code: 'custom',
        message: 'media item dimensions require both width and height',
        path: ['width'],
      });
    }
    if (item.redistributionApproval && item.kind !== 'book-cover') {
      context.addIssue({
        code: 'custom',
        message: 'redistribution approval is only valid for book-cover media',
        path: ['redistributionApproval'],
      });
    }
    const decisionBound = Boolean(
      item.sourcePath && generatedDecisionManifestPathSchema.safeParse(item.sourcePath).success,
    );
    if (decisionBound && item.sourceKind !== 'repository-generated') {
      context.addIssue({
        code: 'custom',
        message: 'decision-bound media requires sourceKind repository-generated',
        path: ['sourceKind'],
      });
    }
    if (item.sourceKind === 'repository-generated' && !item.generation) {
      context.addIssue({
        code: 'custom',
        message: 'repository-generated sourceKind requires generation metadata',
        path: ['generation'],
      });
    }
    if (item.generation && item.sourceKind !== 'repository-generated') {
      context.addIssue({
        code: 'custom',
        message: 'sourceKind must be repository-generated when generation metadata is present',
        path: ['sourceKind'],
      });
    }
    if (item.generation && (!item.sourcePath || !generatedDecisionManifestPathSchema.safeParse(item.sourcePath).success)) {
      context.addIssue({
        code: 'custom',
        message: 'generated media requires its durable decision manifest as sourcePath',
        path: ['sourcePath'],
      });
    }
    if (item.generation && item.sourceUrl) {
      context.addIssue({
        code: 'custom',
        message: 'generated media must not use sourceUrl',
        path: ['sourceUrl'],
      });
    }
  });

const manifestSchema = z
  .object({
    version: z.literal(1),
    items: z.array(mediaItemSchema),
  })
  .strict();

export function parseMediaManifest(source, path) {
  let yaml;
  try {
    yaml = parse(source);
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = manifestSchema.safeParse(yaml);
  if (!parsed.success) {
    throw new Error(`${path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  for (const item of parsed.data.items) {
    if (item.kind === 'book-cover' && (!item.sourceUrl || !item.isbn13 || !item.edition)) {
      throw new Error(`${path}: book-cover ${item.id} requires sourceUrl, isbn13 and edition`);
    }
  }

  return parsed.data;
}

export function findMediaItem(manifest, id) {
  const item = manifest.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`unknown media id ${id}`);
  return item;
}
