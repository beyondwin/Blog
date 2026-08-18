import type { CollectionEntry } from 'astro:content';
import { memoryThoughtHref } from './siteChrome';

export type RecordsArticle = CollectionEntry<'articles'>;
export type ArticleSpecies = '조사' | '에세이';

export interface ArticleImpression {
  href: string;
  title: string;
  reason: string;
}

export interface LeftoverSentence {
  href: string;
  claim: string;
}

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

function firstParagraph(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith('#') && !block.startsWith('|')) ?? '';
}

export function articleJudgment(entry: RecordsArticle): string {
  const emphasis = firstParagraph(articleBody(entry)).match(/\*\*([^*]+)\*\*/);
  if (emphasis) return emphasis[1].trim();
  return articleStake(entry);
}

function articleTargetId(target: string): string | undefined {
  const match = /^articles\/([a-z0-9][a-z0-9-]*)$/.exec(target);
  return match?.[1];
}

export function previousImpressions(
  entry: RecordsArticle,
  publicArticles: RecordsArticle[],
): ArticleImpression[] {
  const byId = new Map(publicArticles.map((article) => [article.id, article]));

  return (entry.data.relationships ?? []).flatMap((relationship) => {
    const id = articleTargetId(relationship.target);
    if (!id || id === entry.id) return [];
    const target = byId.get(id);
    if (!target) return [];
    return [{
      href: `/articles/${id}/`,
      title: target.data.title,
      reason: relationship.reason,
    }];
  });
}

export function leftoverSentence(memory?: {
  linked: Array<{ slug: string; claimKo: string }>;
  related: Array<{ slug: string; claimKo: string }>;
}): LeftoverSentence | undefined {
  const thought = memory?.linked[0] ?? memory?.related[0];
  if (!thought) return undefined;
  return {
    href: memoryThoughtHref(thought.slug),
    claim: thought.claimKo,
  };
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
  const impressions = previousImpressions(entry, candidates);
  const related = impressions.slice(0, 2);
  const words = articleBody(entry).trim().split(/\s+/).filter(Boolean).length;

  return {
    toc: headings
      .filter((heading) => heading.depth === 2 && heading.text !== '확인한 자료')
      .map((heading) => ({
        depth: heading.depth,
        href: `#${heading.slug}`,
        label: heading.text,
      })),
    readingMinutes: Math.max(1, Math.round(words / 260)),
    previousImpressions: impressions,
    related,
    species: articleSpecies(entry),
    judgment: articleJudgment(entry),
  };
}

export function resolveTocTargetId(hash: string): string {
  return decodeURIComponent(hash.replace(/^#/, ''));
}
