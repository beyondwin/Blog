import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPublicRecord,
  type PublicCollection,
  type PublicRecord,
} from '@beyondwin/contracts';
import type { VerifiedActivePublicRelease } from '@beyondwin/content/release';
import {
  PUBLIC_RELEASE_BINDING_ENV,
  readBoundActiveRelease,
} from '../release-binding';
import type { RecordSummary } from '../src/ui/collections/RecordRow';
import type { SearchInventoryItem, SearchKind } from '../src/ui/search/SearchPage';
import type { PublicTag } from '../src/ui/tags/TagsPage';
import { recordAnchor as createRecordAnchor } from '../src/ui/navigation/record-anchor';
import { safeSearchAnchors } from '../src/ui/navigation/search-anchor';

export type CandidateRelease = Pick<VerifiedActivePublicRelease, 'manifest' | 'releasePath'>;
export type CandidateCollection = PublicCollection;
export type CandidateRecord<C extends CandidateCollection> = Extract<PublicRecord, { collection: C }>;

export const PUBLIC_CONTENT_COLLECTIONS = [
  'analysis',
  'articles',
  'ideas',
  'reviews',
  'travel',
] as const satisfies readonly PublicCollection[];

const VERIFIED_COMPATIBILITY_ROUTES = [{
  path: '/reviews/the-life-you-can-save/',
  target: '/reviews/doing-good-better/',
}] as const;

export function repositoryRootFromModuleUrl(moduleUrl: string): string {
  let current = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const parent = dirname(current);
    if (basename(current) === 'site' && basename(parent) === 'apps') return dirname(parent);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Public site module must be contained by apps/site');
}

function repositoryRoot(): string {
  return repositoryRootFromModuleUrl(import.meta.url);
}

let verifiedReleasePromise: Promise<VerifiedActivePublicRelease> | undefined;

export function loadVerifiedRelease(): Promise<VerifiedActivePublicRelease> {
  verifiedReleasePromise ??= readBoundActiveRelease(
    join(repositoryRoot(), 'build/public-releases'),
    process.env[PUBLIC_RELEASE_BINDING_ENV],
  );
  return verifiedReleasePromise;
}

function hasRawPublicationState(record: object): record is object & { status?: unknown; draft?: unknown } {
  return Object.hasOwn(record, 'status') || Object.hasOwn(record, 'draft');
}

function hasPublicPublicationState(record: PublicRecord): boolean {
  if (!hasRawPublicationState(record)) return true;
  const state = record as PublicRecord & { status?: unknown; draft?: unknown };
  return isPublicRecord({ status: state.status, draft: state.draft });
}

function incumbentRecordDate(record: PublicRecord): string {
  if (record.collection === 'reviews' && record.completedAt) return record.completedAt;
  if (record.collection === 'travel' && record.visitedAt) return record.visitedAt;
  return record.createdAt;
}

function compareIncumbentLatestFirst(left: PublicRecord, right: PublicRecord): number {
  const dateOrder = Date.parse(incumbentRecordDate(right)) - Date.parse(incumbentRecordDate(left));
  return dateOrder || left.id.localeCompare(right.id);
}

export function recordsForCollection<C extends CandidateCollection>(
  release: CandidateRelease,
  collection: C,
): Array<CandidateRecord<C>> {
  const records = Object.values(release.manifest.records)
    .filter((record) => record.collection === collection)
    .filter(hasPublicPublicationState)
    .filter((record) => record.href === `/${collection}/${record.id}/`)
    .sort(compareIncumbentLatestFirst);
  return records as Array<CandidateRecord<C>>;
}

export function recordAnchor(collection: PublicCollection, id: string): string {
  return createRecordAnchor(collection, id);
}

function detailForRecord(record: PublicRecord): string | undefined {
  switch (record.collection) {
    case 'reviews': return record.authors.join(' · ') || undefined;
    case 'analysis': return record.sourceTitle;
    case 'ideas': return record.maturity;
    case 'travel': return record.location;
    case 'articles':
    case 'memory': return undefined;
  }
}

export function recordSummary(record: PublicRecord): RecordSummary {
  const detail = detailForRecord(record);
  return {
    id: record.id,
    collection: record.collection,
    href: record.href,
    title: record.collection === 'memory' ? record.claimKo : record.title,
    description: record.description,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    tags: [...record.tags],
    ...(detail ? { detail } : {}),
  };
}

export function summariesForCollection<C extends CandidateCollection>(
  release: CandidateRelease,
  collection: C,
): RecordSummary[] {
  return recordsForCollection(release, collection).map(recordSummary);
}

export function allPublicContentRecords(release: CandidateRelease): PublicRecord[] {
  return PUBLIC_CONTENT_COLLECTIONS
    .flatMap((collection) => recordsForCollection(release, collection))
    .sort((left, right) => left.href.localeCompare(right.href));
}

export function exactPublicTags(release: CandidateRelease): PublicTag[] {
  const counts = new Map<string, number>();
  for (const record of allPublicContentRecords(release)) {
    for (const tag of record.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right, 'ko')).map(([label, count]) => ({
    label,
    count,
    href: `/tags/${encodeURIComponent(label)}/`,
  }));
}

export function recordsForTag(release: CandidateRelease, tag: string): RecordSummary[] {
  return allPublicContentRecords(release)
    .filter((record) => record.tags.includes(tag))
    .map(recordSummary);
}

function searchKindForRecord(record: PublicRecord): SearchKind {
  switch (record.collection) {
    case 'reviews': return 'book';
    case 'memory': return 'sentence';
    case 'analysis':
    case 'articles':
    case 'ideas':
    case 'travel': return 'writing';
  }
}

export function searchInventory(release: CandidateRelease): SearchInventoryItem[] {
  const records = Object.values(release.manifest.records)
    .filter(hasPublicPublicationState)
    .sort((left, right) => left.href.localeCompare(right.href))
    .map((record): SearchInventoryItem => ({
      id: `${record.collection}/${record.id}`,
      anchorId: recordAnchor(record.collection, record.id),
      href: record.href,
      kind: searchKindForRecord(record),
      title: record.collection === 'memory' ? record.claimKo : record.title,
      description: record.description,
      topics: record.collection === 'memory'
        ? [...record.topics, ...record.theses, ...record.tags]
        : [...record.tags],
    }));
  const tags = exactPublicTags(release);
  const tagAnchors = safeSearchAnchors(tags.map((tag) => tag.label));
  const topics = tags.map((tag): SearchInventoryItem => ({
    id: `tag/${tag.label}`,
    anchorId: tagAnchors.get(tag.label)!,
    href: tag.href,
    kind: 'topic',
    title: tag.label,
    description: `${tag.count}개의 공개 기록에서 쓰인 태그`,
    topics: [tag.label],
  }));
  return [...records, ...topics];
}

export function recordForRoute<C extends CandidateCollection>(
  release: CandidateRelease,
  collection: C,
  slug: string,
): CandidateRecord<C> | null {
  const record = release.manifest.records[`${collection}/${slug}`];
  return record?.collection === collection
    && hasPublicPublicationState(record)
    && record.href === `/${collection}/${slug}/`
    ? record as CandidateRecord<C>
    : null;
}

export function decisionSlicePaths(release: CandidateRelease): string[] {
  return [
    '/',
    ...recordsForCollection(release, 'articles').map((record) => record.href),
    ...recordsForCollection(release, 'reviews').map((record) => record.href),
    ...recordsForCollection(release, 'memory').map((record) => record.href),
  ];
}

export function fullPublicPaths(release: CandidateRelease): string[] {
  const fixed = [
    '/',
    '/analysis/',
    '/articles/',
    '/ideas/',
    '/memory/',
    '/memory/map/',
    '/reviews/',
    '/search/',
    '/tags/',
    '/travel/',
  ];
  const details = Object.values(release.manifest.records)
    .filter(hasPublicPublicationState)
    .map((record) => record.href);
  const compatibility = VERIFIED_COMPATIBILITY_ROUTES
    .filter(({ target }) => details.includes(target))
    .map(({ path }) => path);
  const tags = exactPublicTags(release).map((tag) => tag.href);
  const paths = [...new Set([...fixed, ...details, ...compatibility, ...tags])];
  return paths.sort((left, right) => left.localeCompare(right));
}
