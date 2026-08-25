import { useEffect, useMemo, useState } from 'react';
import { OriginLink } from '../navigation/OriginLink';
import { ORIGIN_QUERY_MAX_LENGTH, parseOrigin } from '../navigation/origin';

export type SearchKind = 'writing' | 'book' | 'sentence' | 'topic';

export interface SearchInventoryItem {
  id: string;
  anchorId: string;
  href: string;
  kind: SearchKind;
  title: string;
  description: string;
  topics: string[];
}

const GROUP_LABELS: Record<SearchKind, string> = {
  writing: '글',
  book: '책',
  sentence: '문장',
  topic: '주제와 태그',
};

export function boundedSearchQuery(value: string): string {
  const query = value.trim();
  return query.length > 0 && Array.from(query).length <= ORIGIN_QUERY_MAX_LENGTH ? query : '';
}

export function matchSearchItem(item: SearchInventoryItem, rawQuery: string): string | null {
  const query = boundedSearchQuery(rawQuery).toLocaleLowerCase('ko');
  if (!query) return null;
  if (item.title.toLocaleLowerCase('ko').includes(query)) return '검색어와 제목이 일치합니다';
  const topic = item.topics.find((value) => value.toLocaleLowerCase('ko').includes(query));
  if (topic) return `태그 “${topic}”와 일치합니다`;
  if (item.description.toLocaleLowerCase('ko').includes(query)) return '설명에 검색어가 있습니다';
  return null;
}

export function SearchPage({
  initialQuery,
  inventory,
}: {
  initialQuery?: string;
  inventory: readonly SearchInventoryItem[];
}) {
  const [inputValue, setInputValue] = useState(initialQuery ?? '');
  const query = boundedSearchQuery(inputValue);

  useEffect(() => {
    if (initialQuery !== undefined) return;
    setInputValue(new URLSearchParams(window.location.search).get('q') ?? '');
  }, [initialQuery]);

  const groups = useMemo(() => {
    const matched = query
      ? inventory.flatMap((item) => {
          const reason = matchSearchItem(item, query);
          return reason ? [{ item, reason }] : [];
        })
      : inventory.filter((item) => item.kind !== 'topic').map((item) => ({ item, reason: '' }));
    return (Object.keys(GROUP_LABELS) as SearchKind[]).map((kind) => ({
      kind,
      label: GROUP_LABELS[kind],
      matches: matched.filter(({ item }) => item.kind === kind),
    })).filter(({ matches }) => matches.length > 0);
  }, [inventory, query]);

  const matchCount = groups.reduce((sum, group) => sum + group.matches.length, 0);
  return (
    <section className="reading-sheet search-page" aria-labelledby="search-title">
      <header className="search-page__header">
        <h1 id="search-title">{query || '찾기'}</h1>
        <p>글, 책, 문장과 주제를 찾습니다.</p>
      </header>
      <form className="search-page__form" action="/search/" method="get" role="search">
        <label htmlFor="public-search">찾기</label>
        <div>
          <input
            id="public-search"
            name="q"
            type="search"
            value={inputValue}
            autoComplete="off"
            maxLength={ORIGIN_QUERY_MAX_LENGTH}
            onChange={(event) => setInputValue(event.currentTarget.value)}
          />
          <button type="submit">검색</button>
        </div>
      </form>
      {groups.map((group) => (
        <section className="search-page__group" key={group.kind} aria-labelledby={`search-${group.kind}`}>
          <h2 id={`search-${group.kind}`}>{group.label}</h2>
          <ol>
            {group.matches.map(({ item, reason }) => {
              const origin = searchOriginForItem(item, query);
              const content = <><strong>{item.title}</strong>{reason && <span>{reason}</span>}</>;
              return (
                <li id={item.anchorId} key={item.id}>
                  {origin ? <OriginLink href={item.href} origin={origin}>{content}</OriginLink> : <a href={item.href}>{content}</a>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {matchCount === 0 && <p className="search-page__empty">일치하는 글이 없습니다.</p>}
    </section>
  );
}

export function searchOriginForItem(item: SearchInventoryItem, rawQuery: string) {
  if (item.kind === 'topic') return null;
  return parseOrigin({ kind: 'search', query: boundedSearchQuery(rawQuery), anchorId: item.anchorId });
}
