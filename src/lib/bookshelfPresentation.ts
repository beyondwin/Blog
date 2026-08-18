import type { CollectionEntry } from 'astro:content';
import { toRecordSummary, type RecordSummary } from './content/viewModels';

type ReviewEntry = CollectionEntry<'reviews'>;

const shelfSize = 8;
const tierSize = 4;

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
  const shelfEntries = summaries.slice(0, shelfSize);

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

export function formatReadMonth(date: Date): string {
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월에 읽음`;
}

function reviewTargetId(target: string): string | undefined {
  const match = /^reviews\/([a-z0-9][a-z0-9-]*)$/.exec(target);
  return match?.[1];
}

export function findRelatedBooks(entry: ReviewEntry, candidates: ReviewEntry[]) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return (entry.data.relationships ?? []).flatMap((relationship) => {
    if (!relationship.reason) return [];
    const id = reviewTargetId(relationship.target);
    if (!id || id === entry.id) return [];
    const related = byId.get(id);
    return related ? [{ entry: related, relationshipReason: relationship.reason }] : [];
  }).slice(0, 3);
}
