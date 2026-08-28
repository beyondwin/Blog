import type { ContinuationItem } from './select-continuations';

const KIND_LABELS: Record<ContinuationItem['kind'], string> = {
  analysis: '조사',
  article: '글',
  idea: '아이디어',
  review: '책',
  travel: '여행',
  thought: '생각',
  memory: '기억',
};

export function ContinueReading({
  collectionHref,
  collectionLabel,
  items,
}: {
  collectionHref: '/articles/' | '/reviews/';
  collectionLabel: '글 전체 보기' | '책 전체 보기';
  items: readonly ContinuationItem[];
}) {
  const visibleItems = items.slice(0, 3);
  return (
    <section className="continue-reading" aria-labelledby="continue-reading-title">
      <h2 id="continue-reading-title">이어서 읽기</h2>
      {visibleItems.length > 0 && (
        <ol>
          {visibleItems.map((item) => (
            <li key={item.href}>
              <a href={item.href}>
                <span>{KIND_LABELS[item.kind]}</span>
                <strong>{item.title}</strong>
                <small>{item.reason}</small>
              </a>
            </li>
          ))}
        </ol>
      )}
      <a className="continue-reading__collection" href={collectionHref}>{collectionLabel}</a>
    </section>
  );
}
