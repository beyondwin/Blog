import type { CollectionEntry } from 'astro:content';
import { toRecordSummary, type RecordSummary } from './content/viewModels';

type ArticleEntry = CollectionEntry<'articles'>;
type ReviewEntry = CollectionEntry<'reviews'>;

interface HomePresentationInput {
  articles: ArticleEntry[];
  reviews: ReviewEntry[];
}

interface HomePresentation {
  featuredReview?: RecordSummary;
  featuredArticle?: RecordSummary;
  featuredReading?: RecordSummary;
  openRecords: RecordSummary[];
  books: RecordSummary[];
}

type SummaryMapper = (entry: ArticleEntry | ReviewEntry) => RecordSummary;

const approvedLeadIds = {
  featuredReview: 'changing-their-minds',
  featuredArticle: 'uncle-bob-ai-code-review-evidence',
  featuredReading: 'black-swan',
} as const;

const approvedOpenRecordIds = [
  'shared-ai-conversation-evidence-boundaries',
  'aws-static-frontend-serverless-bff',
] as const;

const approvedBookIds = [
  'lord-of-the-flies',
  'future-arrived-first',
  'goethe-said-everything',
  'art-thief',
  'poor-charlies-almanack',
  'how-we-crossed-winter',
  'factfulness',
  'habitus',
] as const;

const approvedMemorySlugs = [
  'personal-sites-should-show-records-first',
  'memory-needs-retrieval-not-decoration',
  'context-quality-is-routing-problem',
] as const;

function findPreferred<T extends { id: string }>(entries: T[], id: string): T | undefined {
  return entries.find((entry) => entry.id === id) ?? entries[0];
}

function orderPreferred<T extends { id: string }>(entries: T[], ids: readonly string[]): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const preferred = ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
  const preferredIds = new Set(preferred.map((entry) => entry.id));

  return [...preferred, ...entries.filter((entry) => !preferredIds.has(entry.id))];
}

export function buildHomePresentation({
  articles,
  reviews,
}: HomePresentationInput, summarize: SummaryMapper = toRecordSummary): HomePresentation {
  const featuredReview = findPreferred(reviews, approvedLeadIds.featuredReview);
  const featuredArticle = findPreferred(articles, approvedLeadIds.featuredArticle);
  const featuredReading = reviews.find((entry) => (
    entry.id === approvedLeadIds.featuredReading
    && entry.id !== featuredReview?.id
  )) ?? reviews.find((entry) => entry.id !== featuredReview?.id);

  const usedArticleIds = new Set([featuredArticle?.id].filter(Boolean));
  const usedReviewIds = new Set([
    featuredReview?.id,
    featuredReading?.id,
  ].filter(Boolean));

  return {
    featuredReview: featuredReview ? summarize(featuredReview) : undefined,
    featuredArticle: featuredArticle ? summarize(featuredArticle) : undefined,
    featuredReading: featuredReading ? summarize(featuredReading) : undefined,
    openRecords: orderPreferred(
      articles.filter((entry) => !usedArticleIds.has(entry.id)),
      approvedOpenRecordIds,
    ).slice(0, 2).map((entry) => summarize(entry)),
    books: orderPreferred(
      reviews.filter((entry) => !usedReviewIds.has(entry.id)),
      approvedBookIds,
    ).slice(0, 8).map((entry) => summarize(entry)),
  };
}

export function selectHomeMemories<T extends { slug: string }>(thoughts: T[]): T[] {
  const bySlug = new Map(thoughts.map((thought) => [thought.slug, thought]));
  const preferred = approvedMemorySlugs.flatMap((slug) => {
    const thought = bySlug.get(slug);
    return thought ? [thought] : [];
  });
  const preferredSlugs = new Set(preferred.map((thought) => thought.slug));

  return [
    ...preferred,
    ...thoughts.filter((thought) => !preferredSlugs.has(thought.slug)),
  ].slice(0, 3);
}
