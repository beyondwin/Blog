import type { SiteCollection, SiteEntry } from '../content';
import { toRecordSummary, type RecordSummary } from './viewModels';

export interface HomeLimits {
  openRecords: number;
  shelf: number;
  // Public-memory selection belongs to the memory layer. This field only keeps
  // the approved home-call shape source-compatible.
  memories?: number;
}

export interface HomeSelection {
  featuredTechnical?: RecordSummary;
  featuredReview?: RecordSummary;
  openRecords: RecordSummary[];
  shelf: RecordSummary[];
}

type PublicStateEntry = {
  data?: {
    status?: unknown;
    draft?: unknown;
  };
};

type CollectionSections = Partial<Record<SiteCollection, readonly unknown[]>>;
type SummaryMapper = (entry: SiteEntry) => RecordSummary;

const collectionOrder: SiteCollection[] = ['articles', 'reviews', 'ideas', 'travel', 'analysis'];

function recordKey(entry: Pick<SiteEntry, 'collection' | 'id'>): string {
  return `${entry.collection}/${entry.id}`;
}

function boundedLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function isPublicEntry(entry: PublicStateEntry): boolean {
  return entry.data?.status === 'published' && entry.data.draft === false;
}

export function visibleCollectionKeys(sections: CollectionSections): SiteCollection[] {
  return collectionOrder.filter((collection) => (sections[collection]?.length ?? 0) > 0);
}

export function selectUniqueHomeRecords(
  entries: readonly SiteEntry[],
  limits: HomeLimits,
  summarize: SummaryMapper = toRecordSummary,
): HomeSelection {
  const publicEntries = entries.filter(isPublicEntry);
  const selectedKeys = new Set<string>();

  const featuredTechnicalEntry = publicEntries.find((entry) => entry.collection === 'articles')
    ?? publicEntries.find((entry) => entry.collection === 'analysis');
  const featuredReviewEntry = publicEntries.find((entry) => entry.collection === 'reviews');

  if (featuredTechnicalEntry) selectedKeys.add(recordKey(featuredTechnicalEntry));
  if (featuredReviewEntry) selectedKeys.add(recordKey(featuredReviewEntry));

  const openRecords: RecordSummary[] = [];
  const shelf: RecordSummary[] = [];
  const openLimit = boundedLimit(limits.openRecords);
  const shelfLimit = boundedLimit(limits.shelf);

  for (const entry of publicEntries) {
    const key = recordKey(entry);
    if (selectedKeys.has(key)) continue;

    if (entry.collection === 'reviews') {
      if (shelf.length >= shelfLimit) continue;
      shelf.push(summarize(entry));
      selectedKeys.add(key);
      continue;
    }

    if (openRecords.length >= openLimit) continue;
    openRecords.push(summarize(entry));
    selectedKeys.add(key);
  }

  const result: HomeSelection = { openRecords, shelf };
  if (featuredTechnicalEntry) result.featuredTechnical = summarize(featuredTechnicalEntry);
  if (featuredReviewEntry) result.featuredReview = summarize(featuredReviewEntry);
  return result;
}
