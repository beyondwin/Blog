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
import type {
  SearchDiscoveryItem,
  SearchInventoryItem,
  SearchKind,
} from '../src/ui/search/SearchPage';
import {
  SAMPLE_QUESTION,
  type PublicAnswerFixture,
} from '../src/ui/search/secondBrain';
import type { PublicTag } from '../src/ui/tags/TagsPage';
import { PREFERRED_PUBLIC_ARTICLE_LEAD_ID } from '../src/ui/articles/articlePresentation';
import { recordAnchor as createRecordAnchor } from '../src/ui/navigation/record-anchor';

export type CandidateRelease = Pick<VerifiedActivePublicRelease, 'manifest' | 'releasePath'>;
export type CandidateCollection = PublicCollection;
export type CandidateRecord<C extends CandidateCollection> = Extract<PublicRecord, { collection: C }>;
type PublicContentCollection = Exclude<PublicCollection, 'memory'>;

export { PREFERRED_PUBLIC_ARTICLE_LEAD_ID };

export const PUBLIC_CONTENT_COLLECTIONS = [
  'analysis',
  'articles',
  'ideas',
  'reviews',
  'travel',
  'thoughts',
] as const satisfies readonly PublicContentCollection[];

type AssertNever<Value extends never> = Value;
type _PublicContentCollectionsAreExhaustive = AssertNever<
  Exclude<PublicContentCollection, (typeof PUBLIC_CONTENT_COLLECTIONS)[number]>
>;

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
  if (record.collection === 'articles') return record.updatedAt;
  if (record.collection === 'reviews' && record.completedAt) return record.completedAt;
  if (record.collection === 'travel' && record.visitedAt) return record.visitedAt;
  return record.createdAt;
}

function compareIncumbentLatestFirst(
  collection: CandidateCollection,
  left: PublicRecord,
  right: PublicRecord,
): number {
  if (collection === 'articles') {
    if (left.id === PREFERRED_PUBLIC_ARTICLE_LEAD_ID && right.id !== PREFERRED_PUBLIC_ARTICLE_LEAD_ID) return -1;
    if (right.id === PREFERRED_PUBLIC_ARTICLE_LEAD_ID && left.id !== PREFERRED_PUBLIC_ARTICLE_LEAD_ID) return 1;
  }
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
    .sort((left, right) => compareIncumbentLatestFirst(collection, left, right));
  return records as Array<CandidateRecord<C>>;
}

export type ListingRecord<C extends CandidateCollection> = Omit<
  CandidateRecord<C>,
  'bodyHtml' | 'media' | 'memoryLinks' | 'relationships'
>;

export function listingRecord<C extends CandidateCollection>(record: CandidateRecord<C>): ListingRecord<C> {
  const {
    bodyHtml: _bodyHtml,
    media: _media,
    memoryLinks: _memoryLinks,
    relationships: _relationships,
    ...listing
  } = record;
  return listing;
}

type HomeSelectionCollection = 'articles' | 'reviews' | 'thoughts';

export type HomeSelectionRecord<C extends HomeSelectionCollection> = C extends HomeSelectionCollection
  ? {
      collection: C;
      description: string;
      href: string;
      id: string;
      title: string;
    } & (C extends 'reviews' ? { verdict: string } : object)
  : never;

export function homeSelectionRecord(
  record: CandidateRecord<'articles'>,
): HomeSelectionRecord<'articles'>;
export function homeSelectionRecord(
  record: CandidateRecord<'reviews'>,
): HomeSelectionRecord<'reviews'>;
export function homeSelectionRecord(
  record: CandidateRecord<'thoughts'>,
): HomeSelectionRecord<'thoughts'>;
export function homeSelectionRecord(
  record: CandidateRecord<HomeSelectionCollection>,
): HomeSelectionRecord<HomeSelectionCollection> {
  const base = {
    collection: record.collection,
    description: record.description,
    href: record.href,
    id: record.id,
    title: record.title,
  };
  if (record.collection === 'reviews') {
    return { ...base, verdict: record.verdict } as HomeSelectionRecord<HomeSelectionCollection>;
  }
  return base as HomeSelectionRecord<HomeSelectionCollection>;
}

export function listingAssets(
  release: CandidateRelease,
  records: readonly PublicRecord[],
): CandidateRelease['manifest']['assets'] {
  const keys = new Set(records.flatMap((record) => {
    if (record.collection === 'reviews') {
      return record.coverMedia ? [`reviews/${record.id}/${record.coverMedia}`] : [];
    }
    if (record.collection === 'articles' || record.collection === 'thoughts') {
      return record.featuredMedia ? [`${record.collection}/${record.id}/${record.featuredMedia}`] : [];
    }
    return [];
  }));
  return Object.fromEntries(Object.entries(release.manifest.assets).filter(([key]) => keys.has(key)));
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
    case 'thoughts':
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

const PRIMARY_SEARCH_COLLECTIONS = ['articles', 'reviews', 'thoughts'] as const;
const SEARCH_DISCOVERY_SELECTIONS = [
  { collection: 'reviews', id: 'black-swan', kind: 'review' },
  {
    collection: 'articles',
    id: 'graphify-code-knowledge-graph-deep-dive',
    kind: 'article',
    mediaId: 'editorial-home-hero',
  },
  { collection: 'thoughts', id: 'why-i-read-in-the-ai-era', kind: 'thought' },
] as const;
type PrimarySearchCollection = (typeof PRIMARY_SEARCH_COLLECTIONS)[number];
type PrimarySearchRecord = Extract<PublicRecord, { collection: PrimarySearchCollection }>;

function searchKindForRecord(record: PrimarySearchRecord): SearchKind {
  switch (record.collection) {
    case 'articles': return 'article';
    case 'reviews': return 'review';
    case 'thoughts': return 'thought';
  }
}

function searchItem(record: PrimarySearchRecord): SearchInventoryItem {
  return {
    id: `${record.collection}/${record.id}`,
    anchorId: recordAnchor(record.collection, record.id),
    href: record.href,
    kind: searchKindForRecord(record),
    title: record.title,
    description: record.description,
    topics: [...record.tags],
  };
}

export function searchInventory(release: CandidateRelease): SearchInventoryItem[] {
  return PRIMARY_SEARCH_COLLECTIONS
    .flatMap((collection) => recordsForCollection(release, collection))
    .sort((left, right) => left.href.localeCompare(right.href))
    .map(searchItem);
}

export function searchDiscovery(release: CandidateRelease): SearchDiscoveryItem[] {
  return SEARCH_DISCOVERY_SELECTIONS.map((selection) => {
    const record = release.manifest.records[`${selection.collection}/${selection.id}`];
    if (!record
      || record.collection !== selection.collection
      || !hasPublicPublicationState(record)
      || record.href !== `/${selection.collection}/${selection.id}/`) {
      throw new Error(`Verified release is missing fixed search discovery ${selection.collection}/${selection.id}`);
    }
    const item: SearchDiscoveryItem = searchItem(record as PrimarySearchRecord);
    if (!('mediaId' in selection)) return item;
    const media = release.manifest.assets[`${selection.collection}/${selection.id}/${selection.mediaId}`];
    if (!media) {
      throw new Error(`Verified release is missing fixed search media ${selection.collection}/${selection.id}/${selection.mediaId}`);
    }
    return { ...item, media };
  });
}

export function publicSecondBrainFixture(release: CandidateRelease): PublicAnswerFixture {
  const record = recordForRoute(release, 'thoughts', 'why-i-read-in-the-ai-era');
  if (!record) throw new Error('Verified release is missing the public second-brain fixture thought');

  const evidence = [
    {
      id: 'reading-time',
      label: '결론까지 가는 시간',
      locatorLabel: '문단 10',
      excerpt: '요약은 결론을 주고, 독서는 그 결론까지 가는 시간을 준다.',
      context: '요약의 효율보다 판단이 만들어지는 시간을 중요하게 본 근거입니다.',
    },
    {
      id: 'last-judgment',
      label: '판단의 마지막 몫',
      locatorLabel: '문단 05',
      excerpt: '더 많이 아는 경쟁은 이미 졌다. 중요한 것은 얼마나 많이 아느냐보다, 그 많은 정보와 답을 어떻게 받아들이고 판단하느냐일 것이다.',
      context: '정보의 양보다 마지막 판단을 자기 몫으로 남겨야 한다는 관점을 가져왔습니다.',
    },
    {
      id: 'doubt-the-answer',
      label: '답을 쉽게 믿지 않기',
      locatorLabel: '문단 16',
      excerpt: '그래서 책을 읽는다. 더 많은 답을 가지기 위해서라기보다, 답을 쉽게 믿지 않는 사람이 되기 위해서.',
      context: '읽기를 더 많은 답의 수집이 아니라 믿음을 점검하는 태도로 연결한 근거입니다.',
    },
  ] as const;

  const paragraphs = record.bodyHtml.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gu) ?? [];
  for (const item of evidence) {
    if (!record.bodyHtml.includes(item.excerpt)) {
      throw new Error(`Public answer fixture excerpt drifted: ${item.excerpt}`);
    }
    const paragraphNumber = Number.parseInt(item.locatorLabel.replace(/^문단 /u, ''), 10);
    if (!Number.isInteger(paragraphNumber) || paragraphNumber < 1
      || !paragraphs[paragraphNumber - 1]?.includes(item.excerpt)) {
      throw new Error(`Public answer fixture locator drifted: ${item.locatorLabel}`);
    }
  }

  const dateLabel = record.updatedAt.slice(0, 7).replace('-', '.');
  return {
    question: SAMPLE_QUESTION,
    answerLead: '저에게 독서는 답을 얻는 일이 아닙니다.',
    answerConclusionPrefix: '결론까지 가는 시간을 지나며 ',
    answerEmphasis: '내 판단',
    answerConclusionSuffix: '을 되찾는 일입니다.',
    evidence: evidence.map((item) => ({
      ...item,
      collectionLabel: '생각',
      dateLabel,
      recordTitle: record.title,
      canonicalPath: record.href,
    })),
  };
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
    '/thoughts/',
    '/travel/',
  ];
  const details = Object.values(release.manifest.records)
    .filter(hasPublicPublicationState)
    .map((record) => record.href);
  const tags = exactPublicTags(release).map((tag) => tag.href);
  const paths = [...new Set([...fixed, ...details, ...tags])];
  return paths.sort((left, right) => left.localeCompare(right));
}
