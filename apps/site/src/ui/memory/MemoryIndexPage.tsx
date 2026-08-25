import type { RecordSummary } from '../collections/RecordRow';

export function MemoryIndexPage({ records }: { records: readonly RecordSummary[] }) {
  return (
    <section className="reading-sheet memory-index" aria-labelledby="memory-index-title">
      <header className="collection-page__header">
        <h1 id="memory-index-title">남는 문장</h1>
        <p>공개하기로 고른 문장과 그 문장이 나온 근거입니다.</p>
      </header>
      {records.length > 0 ? (
        <ol className="memory-index__list">
          {records.map((record) => <li key={record.id}><a href={record.href}>{record.title}</a></li>)}
        </ol>
      ) : <p className="collection-page__empty">아직 공개한 문장이 없습니다.</p>}
    </section>
  );
}
