import { ResponsivePicture } from '../../../app/root';
import { EditorialListRow } from '../editorial/EditorialListRow';
import { EditorialPageHeader } from '../editorial/EditorialPageHeader';
import { recordAnchor } from '../navigation/record-anchor';
import {
  buildBookshelfPresentation,
  formatReviewDate,
  type ReleaseAsset,
  type ReviewRecord,
} from './bookshelfPresentation';

function rowDescription(authors: readonly string[], verdict: string): string {
  return authors.length > 0 ? `${authors.join(' · ')} — ${verdict}` : verdict;
}

export function BookIndexPage({
  assets,
  records,
}: {
  assets: ReadonlyMap<string, ReleaseAsset>;
  records: readonly ReviewRecord[];
}) {
  const rows = buildBookshelfPresentation(records, assets);
  let renderedMedia = 0;

  return (
    <section className="article-index review-index">
      <EditorialPageHeader
        title="서평"
        description="읽고 난 뒤에도 남은 한 문장과 판단을 기록합니다."
      />
      {rows.length > 0 ? (
        <ol className="article-index__ledger review-index__ledger">
          {rows.map((item) => {
            const eager = item.coverAsset ? renderedMedia++ === 0 : false;
            const media = item.coverAsset ? (
              <ResponsivePicture
                asset={item.coverAsset}
                alt={item.coverAsset.alt}
                eager={eager}
                sizes="(max-width: 767px) 100vw, (max-width: 1179px) 37vw, 430px"
              />
            ) : undefined;
            return (
              <li key={item.id} id={recordAnchor('reviews', item.id)}>
                <EditorialListRow
                  href={item.href}
                  title={item.title}
                  description={rowDescription(item.authors, item.verdict)}
                  date={formatReviewDate(item.date)}
                  media={media}
                  variant="review"
                />
              </li>
            );
          })}
        </ol>
      ) : <p className="article-index__empty">아직 공개한 서평이 없습니다.</p>}
    </section>
  );
}
