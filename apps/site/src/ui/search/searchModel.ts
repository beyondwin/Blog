import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ORIGIN_QUERY_MAX_LENGTH, parseOrigin } from '../navigation/origin';
import { normalizePublicSearchTag } from './popularKeywords';

export type SearchKind = 'article' | 'review' | 'thought';

export interface SearchInventoryItem {
  id: string;
  anchorId: string;
  href: string;
  kind: SearchKind;
  title: string;
  description: string;
  topics: string[];
}

type ReleaseAsset = PublicReleaseManifest['assets'][string];

export interface SearchDiscoveryItem extends SearchInventoryItem {
  media?: ReleaseAsset;
}

export interface SearchMatch {
  field: 'title' | 'tag' | 'description';
  rank: 0 | 1 | 2;
  reason: string;
}

export function boundedSearchQuery(value: string): string {
  const query = value.trim();
  return query.length > 0 && Array.from(query).length <= ORIGIN_QUERY_MAX_LENGTH ? query : '';
}

export function matchSearchItem(item: SearchInventoryItem, rawQuery: string): SearchMatch | null {
  const query = boundedSearchQuery(rawQuery).toLocaleLowerCase('ko');
  if (!query) return null;
  if (item.title.toLocaleLowerCase('ko').includes(query)) {
    return { field: 'title', rank: 0, reason: '제목이 검색어와 일치합니다' };
  }
  const topic = item.topics
    .map(normalizePublicSearchTag)
    .find((value) => value && (
      value.key.includes(query)
      || value.label.toLocaleLowerCase('ko').includes(query)
    ));
  if (topic) return { field: 'tag', rank: 1, reason: `태그 “${topic.label}”와 일치합니다` };
  if (item.description.toLocaleLowerCase('ko').includes(query)) {
    return { field: 'description', rank: 2, reason: '설명에 검색어가 있습니다' };
  }
  return null;
}

export function searchMatches(inventory: readonly SearchInventoryItem[], rawQuery: string) {
  return inventory
    .flatMap((item) => {
      const match = matchSearchItem(item, rawQuery);
      return match ? [{ item, match }] : [];
    })
    .sort((left, right) => (
      left.match.rank - right.match.rank
      || left.item.title.localeCompare(right.item.title, 'ko')
      || left.item.href.localeCompare(right.item.href)
    ));
}

export function searchOriginForItem(item: SearchInventoryItem, rawQuery: string) {
  return parseOrigin({ kind: 'search', query: boundedSearchQuery(rawQuery), anchorId: item.anchorId });
}
