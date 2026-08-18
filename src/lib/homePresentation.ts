import type { CollectionEntry } from 'astro:content';
import { toRecordSummary, type RecordSummary } from './content/viewModels';
import { memoryThoughtHref } from './siteChrome';

type ArticleEntry = CollectionEntry<'articles'>;
type ReviewEntry = CollectionEntry<'reviews'>;

interface HomePresentationInput {
  articles: ArticleEntry[];
  reviews: ReviewEntry[];
}

export interface HomeThought {
  slug: string;
  claimKo: string;
  href: string;
}

export interface HomePresentation {
  featuredArticle?: RecordSummary;
  featuredReview?: RecordSummary;
  featuredThought?: HomeThought;
  moreArticles: RecordSummary[];
  moreBooks: RecordSummary[];
}

type SummaryMapper = (entry: ArticleEntry | ReviewEntry) => RecordSummary;

const preferredIds = {
  article: 'lazycodex-agent-harness-analysis',
  review: 'changing-their-minds',
  thought: 'personal-sites-should-show-records-first',
} as const;

const unpublishedQueueIds = new Set([
  'uncle-bob-ai-code-review-evidence',
  'shared-ai-conversation-evidence-boundaries',
  'aws-static-frontend-serverless-bff',
  'agents-md-vs-agent-skills-evidence',
]);

const moreLimit = 6;

function findPreferred<T extends { id: string }>(entries: T[], id: string): T | undefined {
  return entries.find((entry) => entry.id === id) ?? entries[0];
}

function takeMore<T extends { id: string }>(entries: T[], featuredId?: string): T[] {
  return entries
    .filter((entry) => entry.id !== featuredId && !unpublishedQueueIds.has(entry.id))
    .slice(0, moreLimit);
}

export function buildHomePresentation({
  articles,
  reviews,
}: HomePresentationInput, summarize: SummaryMapper = toRecordSummary): Omit<HomePresentation, 'featuredThought'> {
  const featuredArticle = findPreferred(articles, preferredIds.article);
  const featuredReview = findPreferred(reviews, preferredIds.review);

  return {
    featuredArticle: featuredArticle ? summarize(featuredArticle) : undefined,
    featuredReview: featuredReview ? summarize(featuredReview) : undefined,
    moreArticles: takeMore(articles, featuredArticle?.id).map((entry) => summarize(entry)),
    moreBooks: takeMore(reviews, featuredReview?.id).map((entry) => summarize(entry)),
  };
}

export function selectHomeThought<T extends { slug: string; claimKo: string }>(
  thoughts: T[],
): HomeThought | undefined {
  const selected = thoughts.find((thought) => thought.slug === preferredIds.thought) ?? thoughts[0];
  if (!selected) return undefined;

  return {
    slug: selected.slug,
    claimKo: selected.claimKo,
    href: memoryThoughtHref(selected.slug),
  };
}
