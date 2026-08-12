import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { articleFields, ideaFields, reviewFields, sharedFields, travelFields } from './lib/content/contracts';

const analysisFormat = z.enum(['research-report', 'essay', 'visual-page']);
const ideaMaturity = z.enum(['seed', 'sketch', 'proposal']);

const analysis = defineCollection({
  loader: glob({ base: './src/content/analysis', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    sourceUrl: z.url(),
    sourceTitle: z.string().min(1),
    comment: z.string().min(1),
    format: analysisFormat,
  }),
});

const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    ...articleFields,
  }),
});

const ideas = defineCollection({
  loader: glob({ base: './src/content/ideas', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    ...ideaFields,
    maturity: ideaMaturity.default('sketch'),
  }),
});

const reviews = defineCollection({
  loader: glob({ base: './src/content/reviews', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    ...reviewFields,
    itemType: z.enum(['book', 'article', 'tool', 'course', 'other']),
    itemTitle: z.string().min(1),
    rating: z.number().min(0).max(5).optional(),
    completedAt: z.coerce.date().optional(),
    sourceUrl: z.url().optional(),
    coverImage: z.url().optional(),
  }),
});

const travel = defineCollection({
  loader: glob({ base: './src/content/travel', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    ...travelFields,
    location: z.string().min(1),
    visitedAt: z.coerce.date().optional(),
  }),
});

export const collections = { analysis, articles, ideas, reviews, travel };
