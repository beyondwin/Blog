import type { CollectionEntry } from 'astro:content';

export type RecordsArticle = CollectionEntry<'articles'>;
export type ArticleSpecies = '조사' | '에세이';

interface Heading {
  depth: number;
  slug: string;
  text: string;
}

export interface ArticleIndexItem {
  id: string;
  href: string;
  title: string;
  stake: string;
  monthLabel: string;
  species: ArticleSpecies;
  hasEvidence: boolean;
}

const preferredLeadId = 'graphify-code-knowledge-graph-deep-dive';

function articleBody(entry: RecordsArticle): string {
  return 'body' in entry && typeof entry.body === 'string' ? entry.body : '';
}

function entryDate(entry: RecordsArticle): number {
  return entry.data.updatedAt.getTime();
}

function monthLabel(date: Date): string {
  return `${date.getUTCMonth() + 1}월`;
}

function hasSourceGroundedEvidence(entry: {
  data: { tags?: string[]; evidenceState?: string };
}): boolean {
  return entry.data.evidenceState === 'source-grounded'
    || (entry.data.tags ?? []).includes('source-grounded');
}

export function articleSpecies(entry: {
  data: { tags?: string[]; evidenceState?: string };
}): ArticleSpecies {
  return hasSourceGroundedEvidence(entry) ? '조사' : '에세이';
}

export function articleStake(entry: { data: { description: string; dek?: string } }): string {
  return entry.data.dek ?? entry.data.description;
}

function toIndexItem(entry: RecordsArticle): ArticleIndexItem {
  const species = articleSpecies(entry);

  return {
    id: entry.id,
    href: `/articles/${entry.id}/`,
    title: entry.data.title,
    stake: articleStake(entry),
    monthLabel: monthLabel(entry.data.updatedAt),
    species,
    hasEvidence: species === '조사',
  };
}

function selectLead(entries: RecordsArticle[]): RecordsArticle | undefined {
  const preferred = entries.find((entry) => entry.id === preferredLeadId);
  if (preferred) return preferred;

  return entries.reduce<RecordsArticle | undefined>((newest, entry) => {
    if (!newest || entryDate(entry) > entryDate(newest)) return entry;
    return newest;
  }, undefined);
}

export function buildArticleIndex(entries: RecordsArticle[]): {
  lead?: ArticleIndexItem;
  entries: ArticleIndexItem[];
} {
  const leadEntry = selectLead(entries);
  if (!leadEntry) return { entries: [] };

  return {
    lead: toIndexItem(leadEntry),
    entries: entries
      .filter((entry) => entry.id !== leadEntry.id)
      .map(toIndexItem),
  };
}

export function buildArticlePresentation(
  entry: RecordsArticle,
  candidates: RecordsArticle[],
  headings: Heading[],
) {
  const tags = new Set(entry.data.tags);
  const related = candidates
    .filter((candidate) => candidate.id !== entry.id)
    .map((candidate) => ({
      entry: candidate,
      sharedTopics: candidate.data.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ sharedTopics }) => sharedTopics > 0)
    .sort((a, b) => (
      b.sharedTopics - a.sharedTopics
      || b.entry.data.updatedAt.getTime() - a.entry.data.updatedAt.getTime()
    ))
    .slice(0, 3)
    .map(({ entry: relatedEntry }) => relatedEntry);
  const words = articleBody(entry).trim().split(/\s+/).filter(Boolean).length;

  return {
    toc: headings
      .filter((heading) => heading.depth === 2 || heading.depth === 3)
      .map((heading) => ({
        depth: heading.depth,
        href: `#${heading.slug}`,
        label: heading.text,
      })),
    readingMinutes: Math.max(1, Math.round(words / 260)),
    related,
  };
}

export function resolveTocTargetId(hash: string): string {
  return decodeURIComponent(hash.replace(/^#/, ''));
}
