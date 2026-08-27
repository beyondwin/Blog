import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';

export type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
export type ReleaseAsset = PublicReleaseManifest['assets'][string];
export interface BookShelfRecord {
  id: string;
  href: string;
  title: string;
  authors: readonly string[];
  verdict: string;
  year: number;
  coverAsset?: ReleaseAsset;
}

export function getOneSentenceJudgment(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? normalized;
}

export function reviewSortDate(record: ReviewRecord): string {
  return record.completedAt ?? record.createdAt;
}

function toShelfRecord(
  record: ReviewRecord,
  assets: ReadonlyMap<string, ReleaseAsset>,
): BookShelfRecord {
  const coverAsset = record.coverState === 'verified' && record.coverMedia
    ? assets.get(`reviews/${record.id}/${record.coverMedia}`)
    : undefined;
  return {
    id: record.id,
    href: record.href,
    title: record.title,
    authors: record.authors,
    verdict: getOneSentenceJudgment(record.verdict ?? record.description),
    year: new Date(reviewSortDate(record)).getUTCFullYear(),
    ...(coverAsset ? { coverAsset } : {}),
  };
}

export function buildBookshelfPresentation(
  records: readonly ReviewRecord[],
  assets: ReadonlyMap<string, ReleaseAsset>,
): {
  shelfTiers: BookShelfRecord[][];
  diary: Array<{ year: number; entries: BookShelfRecord[] }>;
} {
  const ordered = [...records].sort((left, right) => {
    const date = Date.parse(reviewSortDate(right)) - Date.parse(reviewSortDate(left));
    return date || left.id.localeCompare(right.id);
  }).map((record) => toShelfRecord(record, assets));
  const shelf = ordered.slice(0, 8);
  const shelfTiers = [shelf.slice(0, 4), shelf.slice(4, 8)].filter((tier) => tier.length > 0);
  const diary: Array<{ year: number; entries: BookShelfRecord[] }> = [];
  for (const entry of ordered) {
    const current = diary.at(-1);
    if (!current || current.year !== entry.year) diary.push({ year: entry.year, entries: [entry] });
    else current.entries.push(entry);
  }
  return { shelfTiers, diary };
}
