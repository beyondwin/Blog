import type { PublicCollection } from '@beyondwin/contracts';
import { EditorialPageHeader } from '../editorial/EditorialPageHeader';
import { RecordRow, type RecordSummary } from './RecordRow';

const ORIGIN_KIND = {
  analysis: 'analysis',
  articles: 'articles',
  ideas: 'ideas',
  reviews: 'reviews',
  travel: 'travel',
} as const;

type CollectionLane = keyof typeof ORIGIN_KIND;

export function supportsCollectionPage(collection: PublicCollection): collection is CollectionLane {
  return Object.hasOwn(ORIGIN_KIND, collection);
}

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
    <section className={`secondary-index collection-page collection-page--${collection}`} aria-label={title}>
      <EditorialPageHeader title={title} description={description} />
      {records.length > 0 ? (
        <ol className="secondary-index__ledger record-list">
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
