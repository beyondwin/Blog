import { OriginLink } from '../navigation/OriginLink';
import { popularKeywords } from './popularKeywords';
import { searchMatches, searchOriginForItem, type SearchInventoryItem, type SearchKind } from './searchModel';

const KIND_LABELS: Record<SearchKind, '아티클' | '서평' | '생각'> = {
  article: '아티클', review: '서평', thought: '생각',
};

export function SearchResults({ inventory, query }: {
  inventory: readonly SearchInventoryItem[];
  query: string;
}) {
  const matches = searchMatches(inventory, query);
  const keywords = popularKeywords(inventory);
  if (matches.length === 0) {
    return (
      <section className="search-zero" aria-labelledby="search-zero-title">
        <h2 id="search-zero-title">일치하는 결과가 없습니다.</h2>
        <p>다른 키워드로 이어서 찾아보세요.</p>
        {keywords.length > 0 ? <ul aria-label="추천 검색어">{keywords.map((keyword) => (
          <li key={keyword.label}><a href={keyword.href}>{keyword.label}</a></li>
        ))}</ul> : null}
      </section>
    );
  }
  return (
    <section className="search-results" aria-labelledby="search-results-title">
      <div className="search-results__heading">
        <h2 id="search-results-title">검색 결과</h2>
        <p><strong>“{query}”</strong>에 이어지는 공개 기록 {matches.length}건</p>
      </div>
      <ol className="search-result-list">
        {matches.map(({ item, match }) => {
          const origin = searchOriginForItem(item, query);
          const content = <>
            <span className="search-result__kind">{KIND_LABELS[item.kind]}</span>
            <strong>{item.title}</strong>
            <span className="search-result__description">{item.description}</span>
            <span className="search-result__reason">{match.reason}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg>
          </>;
          return <li id={item.anchorId} key={item.id}>{origin
            ? <OriginLink href={item.href} origin={origin}>{content}</OriginLink>
            : <a href={item.href}>{content}</a>}</li>;
        })}
      </ol>
    </section>
  );
}
