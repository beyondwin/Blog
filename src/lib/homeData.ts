import type { CollectionEntry } from 'astro:content';
import { getContentByCollection } from './content';
import { buildHomePresentation, selectHomeThought } from './homePresentation';

export { selectHomeThought };

export async function loadHomePresentation() {
  const [articles, reviews] = await Promise.all([
    getContentByCollection('articles'),
    getContentByCollection('reviews'),
  ]);

  return buildHomePresentation({
    articles: articles as CollectionEntry<'articles'>[],
    reviews: reviews as CollectionEntry<'reviews'>[],
  });
}
