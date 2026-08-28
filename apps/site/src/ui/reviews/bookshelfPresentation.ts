import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';

export type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
export type ReleaseAsset = PublicReleaseManifest['assets'][string];
export type CoverRightsState = 'approved' | 'warning' | 'hold' | 'unverified';

export interface BookShelfRecord {
  id: string;
  href: string;
  title: string;
  authors: readonly string[];
  verdict: string;
  date: string;
  edition?: string;
  rightsState: CoverRightsState;
  coverAsset?: ReleaseAsset;
}

export function getOneSentenceJudgment(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? normalized;
}

export function reviewSortDate(record: ReviewRecord): string {
  return record.completedAt ?? record.createdAt;
}

export function formatReviewDate(value: string): string {
  return value.slice(0, 10).replaceAll('-', '.');
}

function reviewEdition(record: ReviewRecord): string | undefined {
  if (record.editionLabel) return record.editionLabel;
  return record.publisher;
}

function toShelfRecord(
  record: ReviewRecord,
  assets: ReadonlyMap<string, ReleaseAsset>,
): BookShelfRecord {
  const resolvedCover = record.coverState === 'verified'
    && record.readEditionVerified
    && record.coverMedia
    ? assets.get(`reviews/${record.id}/${record.coverMedia}`)
    : undefined;
  const rightsState: CoverRightsState = record.coverState === 'hold'
    ? 'hold'
    : !record.readEditionVerified
      ? 'unverified'
      : resolvedCover
        ? 'approved'
        : 'warning';

  return {
    id: record.id,
    href: record.href,
    title: record.title,
    authors: record.authors,
    verdict: getOneSentenceJudgment(record.verdict ?? record.description),
    date: reviewSortDate(record),
    ...(reviewEdition(record) ? { edition: reviewEdition(record) } : {}),
    rightsState,
    ...(resolvedCover ? { coverAsset: resolvedCover } : {}),
  };
}

export function buildBookshelfPresentation(
  records: readonly ReviewRecord[],
  assets: ReadonlyMap<string, ReleaseAsset>,
): BookShelfRecord[] {
  return [...records]
    .sort((left, right) => {
      const date = Date.parse(reviewSortDate(right)) - Date.parse(reviewSortDate(left));
      return date || left.id.localeCompare(right.id);
    })
    .map((record) => toShelfRecord(record, assets));
}
