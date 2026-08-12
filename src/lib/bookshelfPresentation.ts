import type { CollectionEntry } from 'astro:content';
import { toRecordSummary, type RecordSummary } from './content/viewModels';

type ReviewEntry = CollectionEntry<'reviews'>;

const structuralReviewTags = new Set(['book', 'review', 'naver-archive']);
const shelfSize = 8;
const tierSize = 4;
const approvedShelfIds = [
  'changing-their-minds',
  'black-swan',
  'lord-of-the-flies',
  'goethe-said-everything',
  'nevertheless',
  'art-thief',
  'poor-charlies-almanack',
  'siddhartha',
] as const;

function getReviewDate(entry: ReviewEntry): Date {
  return entry.data.completedAt ?? entry.data.createdAt;
}

type SummaryMapper = (entry: ReviewEntry) => RecordSummary;

function hasVerifiedCover(entry: RecordSummary): boolean {
  return entry.coverState === 'verified' && Boolean(entry.media);
}

export function buildBookshelfPresentation(entries: ReviewEntry[], summarize: SummaryMapper = toRecordSummary) {
  const orderedEntries = [...entries].sort((left, right) => (
    getReviewDate(right).getTime() - getReviewDate(left).getTime()
  ));
  const counts = new Map<number, number>();

  for (const entry of orderedEntries) {
    const year = getReviewDate(entry).getFullYear();
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }

  const summaries = orderedEntries.map((entry) => summarize(entry));
  const coverEntries = summaries.filter(hasVerifiedCover);
  const byId = new Map(coverEntries.map((entry) => [entry.id, entry]));
  const preferredEntries = approvedShelfIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
  const preferredIds = new Set(preferredEntries.map((entry) => entry.id));
  const shelfEntries = [
    ...preferredEntries,
    ...coverEntries.filter((entry) => !preferredIds.has(entry.id)),
  ].slice(0, shelfSize);

  return {
    yearCounts: Array.from(counts, ([year, count]) => ({ year, count })),
    shelfTiers: [
      shelfEntries.slice(0, tierSize),
      shelfEntries.slice(tierSize, shelfSize),
    ].filter((tier) => tier.length > 0),
    judgmentEntries: summaries,
    missingCoverEntries: summaries.filter((entry) => !hasVerifiedCover(entry)),
  };
}

export function getOneSentenceJudgment(description: string): string {
  const normalized = description.trim().replace(/\s+/g, ' ');
  const firstSentence = normalized.match(/^.*?[.!?](?=\s|$)/u);
  return firstSentence?.[0] ?? normalized;
}

export function formatLiteraryDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export function findRelatedBooks(entry: ReviewEntry, candidates: ReviewEntry[]) {
  const meaningfulTags = entry.data.tags.filter((tag) => !structuralReviewTags.has(tag));

  if (meaningfulTags.length === 0) {
    return [];
  }

  return candidates.flatMap((candidate) => {
    if (candidate.id === entry.id) {
      return [];
    }

    const sharedTag = meaningfulTags.find((tag) => candidate.data.tags.includes(tag));
    return sharedTag
      ? [{ entry: candidate, relationshipReason: `같은 주제 · ${sharedTag}` }]
      : [];
  }).slice(0, 3);
}
