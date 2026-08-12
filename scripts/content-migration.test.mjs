import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { isPublicEntry } from '../src/lib/content/publication';

const root = process.cwd();
const contentCollections = ['analysis', 'articles', 'ideas', 'reviews', 'travel'];

async function readCollectionEntries(collection) {
  const directory = join(root, 'src', 'content', collection);
  const files = (await readdir(directory))
    .filter((file) => ['.md', '.mdx'].includes(extname(file)))
    .sort();

  return Promise.all(files.map(async (file) => {
    const parsed = matter(await readFile(join(directory, file), 'utf8'));
    return {
      collection,
      file,
      slug: basename(file, extname(file)),
      data: parsed.data,
      content: parsed.content,
    };
  }));
}

function hasValidIsbn13Checksum(value) {
  if (!/^97[89]\d{10}$/.test(value ?? '')) return false;

  const digits = [...value].map(Number);
  const weightedSum = digits
    .slice(0, 12)
    .reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0);
  const expectedCheckDigit = (10 - (weightedSum % 10)) % 10;
  return digits[12] === expectedCheckDigit;
}

const entriesByCollection = Object.fromEntries(await Promise.all(
  contentCollections.map(async (collection) => [collection, await readCollectionEntries(collection)]),
));
const allEntries = contentCollections.flatMap((collection) => entriesByCollection[collection]);
const realArticles = entriesByCollection.articles.filter((entry) => entry.data.draft !== true);
const realReviews = entriesByCollection.reviews.filter((entry) => entry.data.draft !== true);
const exampleEntries = allEntries.filter((entry) => entry.slug.startsWith('example-'));
const publicEntries = allEntries.filter((entry) => isPublicEntry({
  data: { ...entry.data, draft: entry.data.draft ?? false },
}));
const publicMemory = JSON.parse(await readFile(join(root, 'src', 'data', 'memory.public.json'), 'utf8'));
const astroConfig = await readFile(join(root, 'astro.config.mjs'), 'utf8');

describe('existing content migration contract', () => {
  it('keeps the approved corpus counts and hides examples', () => {
    expect(realArticles).toHaveLength(16);
    expect(realReviews).toHaveLength(18);
    expect(publicMemory.thoughts).toHaveLength(7);
    expect(exampleEntries).toHaveLength(5);
    expect(exampleEntries.every((entry) => entry.data.draft === true)).toBe(true);
  });

  it('requires structured review bibliography', () => {
    for (const review of realReviews) {
      expect.soft(review.data.itemAuthor, `${review.slug} itemAuthor`).toBeTruthy();
      expect.soft(review.data.isbn13 ?? '', `${review.slug} isbn13`).toMatch(/^97[89]\d{10}$/);
      expect.soft(review.data.publisher, `${review.slug} publisher`).toBeTruthy();
      expect.soft(['verified', 'hold'], `${review.slug} coverState`).toContain(review.data.coverState);
      if (review.data.coverState === 'verified') {
        expect.soft(review.data.coverMedia, `${review.slug} coverMedia`).toBe('cover');
      }
      if (review.data.coverState === 'hold') {
        expect.soft(review.data.coverMedia, `${review.slug} coverMedia`).toBeUndefined();
      }
      expect.soft(review.data.coverImage, `${review.slug} coverImage`).toBeUndefined();
    }
  });

  it('requires valid unique ISBN-13 values and review slugs', () => {
    const isbnValues = realReviews.map((review) => review.data.isbn13);
    const reviewSlugs = realReviews.map((review) => review.slug);

    for (const review of realReviews) {
      expect.soft(hasValidIsbn13Checksum(review.data.isbn13), `${review.slug} ISBN-13 checksum`).toBe(true);
    }
    expect(new Set(isbnValues)).toHaveLength(18);
    expect(new Set(reviewSlugs)).toHaveLength(18);
  });

  it('does not claim the displayed winter edition was the edition read', () => {
    const review = realReviews.find((entry) => entry.slug === 'how-we-crossed-winter');

    expect(review).toBeDefined();
    expect(review.data.isbn13).toBe('9791161571492');
    expect(review.data.editionLabel).toContain('2023 일반판');
    expect(review.data.readEditionVerified).toBe(false);
  });

  it('uses Doing Good Better as the canonical review identity', () => {
    const reviewSlugs = realReviews.map((review) => review.slug);

    expect(reviewSlugs).toContain('doing-good-better');
    expect(reviewSlugs).not.toContain('the-life-you-can-save');
  });

  it('keeps the legacy review route as a static redirect', () => {
    expect(astroConfig).toContain("'/reviews/the-life-you-can-save/'");
    expect(astroConfig).toContain("'/reviews/doing-good-better/'");
  });

  it('does not expose non-published content as public', () => {
    expect(publicEntries.length).toBeGreaterThan(0);
    expect(publicEntries.some((entry) => entry.data.status !== 'published')).toBe(false);
  });
});
