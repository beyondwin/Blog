import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { useEffect, useMemo, useState } from 'react';
import { ResponsivePicture } from '../../../app/root';
import { OriginLink } from '../navigation/OriginLink';
import { ORIGIN_QUERY_MAX_LENGTH, parseOrigin } from '../navigation/origin';
import { normalizePublicSearchTag, popularKeywords } from './popularKeywords';

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

const KIND_LABELS: Record<SearchKind, '아티클' | '서평' | '생각'> = {
  article: '아티클',
  review: '서평',
  thought: '생각',
};

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
      value.raw.toLocaleLowerCase('ko').includes(query)
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

function browserSearchQuery(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return boundedSearchQuery(new URLSearchParams(window.location.search).get('q') ?? '');
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

function DiscoveryCard({ item }: { item: SearchDiscoveryItem }) {
  const hasMedia = Boolean(item.media);
  return (
    <li>
      <a
        className={`search-discovery-card search-discovery-card--${item.kind}${hasMedia ? ' search-discovery-card--media' : ''}`}
        href={item.href}
      >
        {item.media ? (
          <span className="search-discovery-card__media">
            <ResponsivePicture
              asset={item.media}
              alt={item.media.alt}
              sizes="(max-width: 767px) 100vw, (max-width: 1179px) 48vw, 380px"
            />
          </span>
        ) : null}
        <span className="search-discovery-card__copy">
          <span className="search-discovery-card__kind">{KIND_LABELS[item.kind]}</span>
          <strong>{item.title}</strong>
          <span className="search-discovery-card__description">{item.description}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg>
        </span>
      </a>
    </li>
  );
}

export function SearchPage({
  discovery,
  initialQuery = '',
  inventory,
}: {
  discovery: readonly SearchDiscoveryItem[];
  initialQuery?: string;
  inventory: readonly SearchInventoryItem[];
}) {
  const [inputValue, setInputValue] = useState(initialQuery);
  const query = boundedSearchQuery(inputValue);

  useEffect(() => {
    setInputValue(browserSearchQuery(initialQuery));
  }, [initialQuery]);

  const keywords = useMemo(() => popularKeywords(inventory), [inventory]);
  const matches = useMemo(() => searchMatches(inventory, query), [inventory, query]);

  return (
    <section className="search-page" aria-labelledby="search-title">
      <header className="search-page__header">
        <h1 id="search-title">검색</h1>
        <p>찾는 키워드에서 서평과 아티클, 생각의 다음 질문을 발견해 보세요.</p>
      </header>

      <div className="search-page__body">
        <form className="search-page__form" action="/search/" method="get" role="search">
          <label className="visually-hidden" htmlFor="public-search">검색어</label>
          <input
            id="public-search"
            name="q"
            type="search"
            value={inputValue}
            aria-label="검색어"
            autoComplete="off"
            maxLength={ORIGIN_QUERY_MAX_LENGTH}
            placeholder="검색어를 입력하세요"
            onChange={(event) => setInputValue(event.currentTarget.value)}
          />
          <button type="submit">
            <span className="visually-hidden">검색</span>
            <SearchIcon />
          </button>
        </form>

        {keywords.length > 0 ? (
          <section className="search-keywords" aria-labelledby="search-keywords-title">
            <h2 id="search-keywords-title">자주 쓰인 키워드</h2>
            <ul>
              {keywords.map((keyword) => (
                <li key={keyword.label}>
                  <a className="search-keywords__link" href={keyword.href}>{keyword.label}</a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!query ? (
          <ol className="search-discovery" aria-label="검색 탐색">
            {discovery.map((item) => <DiscoveryCard item={item} key={item.id} />)}
          </ol>
        ) : matches.length > 0 ? (
          <section className="search-results" aria-labelledby="search-results-title">
            <div className="search-results__heading">
              <h2 id="search-results-title">검색 결과</h2>
              <p><strong>“{query}”</strong>에 이어지는 공개 기록 {matches.length}건</p>
            </div>
            <ol className="search-result-list">
              {matches.map(({ item, match }) => {
                const origin = searchOriginForItem(item, query);
                const content = (
                  <>
                    <span className="search-result__kind">{KIND_LABELS[item.kind]}</span>
                    <strong>{item.title}</strong>
                    <span className="search-result__description">{item.description}</span>
                    <span className="search-result__reason">{match.reason}</span>
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg>
                  </>
                );
                return (
                  <li id={item.anchorId} key={item.id}>
                    {origin
                      ? <OriginLink href={item.href} origin={origin}>{content}</OriginLink>
                      : <a href={item.href}>{content}</a>}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <section className="search-zero" aria-labelledby="search-zero-title">
            <h2 id="search-zero-title">일치하는 결과가 없습니다.</h2>
            <p>다른 키워드로 이어서 찾아보세요.</p>
            {keywords.length > 0 ? (
              <ul aria-label="추천 검색어">
                {keywords.map((keyword) => (
                  <li key={keyword.label}><a href={keyword.href}>{keyword.label}</a></li>
                ))}
              </ul>
            ) : null}
          </section>
        )}
      </div>
    </section>
  );
}

export function searchOriginForItem(item: SearchInventoryItem, rawQuery: string) {
  return parseOrigin({ kind: 'search', query: boundedSearchQuery(rawQuery), anchorId: item.anchorId });
}
