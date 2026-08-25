import type { PublicCollection } from '@beyondwin/contracts';
import { RecordRow, type RecordSummary } from './RecordRow';

const ORIGIN_KIND = {
  analysis: 'analysis',
  articles: 'articles',
  ideas: 'ideas',
  reviews: 'reviews',
  travel: 'travel',
} as const;

type CollectionLane = Exclude<PublicCollection, 'memory'>;

export function CollectionPage({
  collection,
  description,
  emptyMessage = '아직 공개한 기록이 없습니다.',
  records,
  title,
}: {
  collection: CollectionLane;
  description: string;
  emptyMessage?: string;
  records: readonly RecordSummary[];
  title: string;
}) {
  return (
    <section className={`reading-sheet collection-page collection-page--${collection}`} aria-labelledby="collection-title">
      <header className="collection-page__header">
        <h1 id="collection-title">{title}</h1>
        <p>{description}</p>
      </header>
      {records.length > 0 ? (
        <ol className="record-list">
          {records.map((record) => (
            <RecordRow key={`${record.collection}/${record.id}`} record={record} originKind={ORIGIN_KIND[collection]} />
          ))}
        </ol>
      ) : (
        <p className="collection-page__empty">{emptyMessage}</p>
      )}
    </section>
  );
}
