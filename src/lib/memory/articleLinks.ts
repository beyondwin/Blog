import type { MemoryPublicData } from './publicData';
import {
  findContentMemoryLinks,
  type ContentMemoryLink,
  type ContentMemoryLinks,
} from './contentLinks';

export type ArticleMemoryLink = ContentMemoryLink;
export type ArticleMemoryLinks = ContentMemoryLinks;

export function findArticleMemoryLinks(
  memory: MemoryPublicData,
  articlePath: string,
  articleTags: string[] = [],
  limit?: number,
): ArticleMemoryLinks {
  return findContentMemoryLinks(memory, articlePath, articleTags, limit);
}
