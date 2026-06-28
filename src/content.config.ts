import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const contentStatus = z.enum(['review', 'published', 'archived']);
const analysisFormat = z.enum(['research-report', 'essay', 'visual-page']);
const ideaMaturity = z.enum(['seed', 'sketch', 'proposal']);

const sharedFields = {
  title: z.string().min(1),
  description: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  tags: z.array(z.string().min(1)).default([]),
  status: contentStatus.default('review'),
  draft: z.boolean().default(false),
};

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
  }),
});

const ideas = defineCollection({
  loader: glob({ base: './src/content/ideas', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    maturity: ideaMaturity.default('sketch'),
  }),
});

const reviews = defineCollection({
  loader: glob({ base: './src/content/reviews', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...sharedFields,
    itemType: z.enum(['book', 'article', 'tool', 'course', 'other']),
    itemTitle: z.string().min(1),
    itemAuthor: z.string().optional(),
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
    location: z.string().min(1),
    visitedAt: z.coerce.date().optional(),
  }),
});

export const collections = { analysis, articles, ideas, reviews, travel };
