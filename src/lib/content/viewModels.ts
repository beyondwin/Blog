import type { ContentMemoryLinks } from '../memory/contentLinks';
import {
  getEntryDate,
  getEntryHref,
  getEntryTypeLabel,
  type SiteCollection,
  type SiteEntry,
} from '../content';
import { resolveContentMedia, type ResolvedMedia } from './mediaRegistry';

export interface RecordSummary {
  id: string;
  href: string;
  collection: SiteCollection;
  typeLabel: string;
  title: string;
  description: string;
  primaryDate: Date;
  tags: string[];
  evidenceState?: 'personal' | 'source-grounded' | 'verified';
  verdict?: string;
  media?: ResolvedMedia;
}

export interface DirectRelation {
  target: string;
  relation: string;
  reason: string;
}

export interface RecordDetail extends RecordSummary {
  dek?: string;
  authors: string[];
  isbn13?: string;
  publisher?: string;
  editionLabel?: string;
  readEditionVerified: boolean;
  relationships: DirectRelation[];
  directMemory: Array<{ slug: string; claimKo: string; href: string }>;
}

export type ContentMediaResolver = (
  collection: string,
  slug: string,
  id: string,
) => ResolvedMedia | undefined;

export type DirectMemoryInput = Pick<ContentMemoryLinks, 'linked'>;

function mediaIdFor(entry: SiteEntry): string | undefined {
  if (entry.collection === 'articles') return entry.data.featuredMedia;
  if (entry.collection === 'reviews') return entry.data.coverMedia;
  if (entry.collection === 'travel') return entry.data.leadMedia;
  return undefined;
}

function resolveOptionalMedia(
  entry: SiteEntry,
  resolveMedia: ContentMediaResolver,
): ResolvedMedia | undefined {
  const mediaId = mediaIdFor(entry);
  if (!mediaId) return undefined;

  try {
    return resolveMedia(entry.collection, entry.id, mediaId);
  } catch {
    return undefined;
  }
}

export function toRecordSummary(
  entry: SiteEntry,
  resolveMedia: ContentMediaResolver = resolveContentMedia,
): RecordSummary {
  const summary: RecordSummary = {
    id: entry.id,
    href: getEntryHref(entry),
    collection: entry.collection,
    typeLabel: getEntryTypeLabel(entry),
    title: entry.data.title,
    description: entry.data.description,
    primaryDate: getEntryDate(entry),
    tags: [...entry.data.tags],
  };

  if (entry.collection === 'articles' && entry.data.evidenceState) {
    summary.evidenceState = entry.data.evidenceState;
  }

  if (entry.collection === 'reviews' && entry.data.verdict) {
    summary.verdict = entry.data.verdict;
  }

  const media = resolveOptionalMedia(entry, resolveMedia);
  if (media) summary.media = media;

  return summary;
}

export function toRecordDetail(
  entry: SiteEntry,
  directMemory: DirectMemoryInput,
  resolveMedia: ContentMediaResolver = resolveContentMedia,
): RecordDetail {
  const authors = entry.collection === 'reviews' && entry.data.itemAuthor
    ? Array.isArray(entry.data.itemAuthor)
      ? [...entry.data.itemAuthor]
      : [entry.data.itemAuthor]
    : [];

  const detail: RecordDetail = {
    ...toRecordSummary(entry, resolveMedia),
    authors,
    readEditionVerified: entry.collection === 'reviews'
      ? entry.data.readEditionVerified
      : false,
    relationships: entry.data.relationships.map((relationship) => ({ ...relationship })),
    directMemory: directMemory.linked.map((memory) => ({
      slug: memory.slug,
      claimKo: memory.claimKo,
      href: memory.memoryHref,
    })),
  };

  if (entry.data.dek) detail.dek = entry.data.dek;

  if (entry.collection === 'reviews') {
    if (entry.data.isbn13) detail.isbn13 = entry.data.isbn13;
    if (entry.data.publisher) detail.publisher = entry.data.publisher;
    if (entry.data.editionLabel) detail.editionLabel = entry.data.editionLabel;
  }

  return detail;
}
