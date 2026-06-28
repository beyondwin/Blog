import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type SiteEntry =
  | CollectionEntry<'analysis'>
  | CollectionEntry<'articles'>
  | CollectionEntry<'ideas'>
  | CollectionEntry<'reviews'>
  | CollectionEntry<'travel'>;

export type SiteCollection = SiteEntry['collection'];

export const collectionMeta: Record<
  SiteCollection,
  {
    label: string;
    navLabel: string;
    description: string;
    href: string;
  }
> = {
  articles: {
    label: 'Article',
    navLabel: 'Articles',
    description: '개발하면서 검증한 도구, 구조, 워크플로우를 길게 정리합니다.',
    href: '/articles/',
  },
  reviews: {
    label: 'Review',
    navLabel: 'Reviews',
    description: '책과 도구를 읽고 쓴 뒤 남은 판단을 기록합니다.',
    href: '/reviews/',
  },
  ideas: {
    label: 'Idea',
    navLabel: 'Ideas',
    description: '아직 글이 되기 전의 문제의식과 실험을 보관합니다.',
    href: '/ideas/',
  },
  travel: {
    label: 'Travel',
    navLabel: 'Travel',
    description: '장소와 동선에서 발견한 장면을 짧게 붙잡아 둡니다.',
    href: '/travel/',
  },
  analysis: {
    label: 'Analysis',
    navLabel: 'Analysis',
    description: '외부 자료와 저장소를 읽고 쓸 만한 결론만 남깁니다.',
    href: '/analysis/',
  },
};

export const primaryCollections: SiteCollection[] = ['articles', 'reviews', 'ideas', 'travel'];

export function getEntryDate(entry: SiteEntry): Date {
  if (entry.collection === 'reviews' && entry.data.completedAt) {
    return entry.data.completedAt;
  }

  if (entry.collection === 'travel' && entry.data.visitedAt) {
    return entry.data.visitedAt;
  }

  return entry.data.createdAt;
}

export function getEntryHref(entry: SiteEntry): string {
  return `/${entry.collection}/${entry.id}/`;
}

export function getEntryTypeLabel(entry: SiteEntry): string {
  if (entry.collection === 'analysis') {
    return entry.data.format
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
  }

  return collectionMeta[entry.collection].label;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 260));
}

export async function getContentByCollection(collection: SiteCollection): Promise<SiteEntry[]> {
  const entries = await getCollection(collection, ({ data }) => !data.draft);

  return (entries as SiteEntry[]).sort((a, b) => {
    return getEntryDate(b).getTime() - getEntryDate(a).getTime();
  });
}

export async function getAllContent(): Promise<SiteEntry[]> {
  const [analysis, articles, ideas, reviews, travel] = await Promise.all([
    getContentByCollection('analysis'),
    getContentByCollection('articles'),
    getContentByCollection('ideas'),
    getContentByCollection('reviews'),
    getContentByCollection('travel'),
  ]);

  return [...analysis, ...articles, ...ideas, ...reviews, ...travel].sort((a, b) => {
    return getEntryDate(b).getTime() - getEntryDate(a).getTime();
  });
}

export async function getHomeSections(): Promise<Record<SiteCollection, SiteEntry[]>> {
  const [articles, reviews, ideas, travel, analysis] = await Promise.all([
    getContentByCollection('articles'),
    getContentByCollection('reviews'),
    getContentByCollection('ideas'),
    getContentByCollection('travel'),
    getContentByCollection('analysis'),
  ]);

  return { articles, reviews, ideas, travel, analysis };
}

export async function getAllTags(): Promise<string[]> {
  const entries = await getAllContent();
  const tags = new Set<string>();

  for (const entry of entries) {
    for (const tag of entry.data.tags) {
      tags.add(tag);
    }
  }

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}
