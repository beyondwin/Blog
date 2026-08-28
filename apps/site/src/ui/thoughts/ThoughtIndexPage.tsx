import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ResponsivePicture } from '../../../app/root';
import { EditorialPageHeader } from '../editorial/EditorialPageHeader';

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];
const THOUGHT_CARD_SIZES = '(max-width: 767px) calc(100vw - 44px), (max-width: 1179px) 46vw, 380px';

function dateLabel(date: string): string {
  return date.slice(0, 10).replaceAll('-', '.');
}

export function ThoughtIndexPage({
  assets,
  records,
}: {
  assets: ReadonlyMap<string, ReleaseAsset>;
  records: readonly ThoughtRecord[];
}) {
  if (records.length !== 1) {
    throw new Error(`Thought index requires exactly one public thought; received ${records.length}`);
  }
  const record = records[0];
  const asset = record.featuredMedia
    ? assets.get(`thoughts/${record.id}/${record.featuredMedia}`)
    : undefined;

  return (
    <section className="thought-index">
      <EditorialPageHeader
        title="생각"
        description="빠른 답 사이에서 오래 남은 질문과 판단을 기록합니다."
      />
      <ol className="thought-index__grid" aria-label="공개한 생각">
        <li className="thought-index__cell thought-index__cell--record" data-thought-cell="record">
          <article className={`thought-index__card${asset ? '' : ' thought-index__card--text-led'}`}>
            <a href={record.href}>
              {asset ? (
                <span className="thought-index__media">
                  <ResponsivePicture
                    asset={asset}
                    alt={asset.alt}
                    eager
                    sizes={THOUGHT_CARD_SIZES}
                  />
                </span>
              ) : null}
              <span className="thought-index__copy">
                <h2>{record.title}</h2>
                <span>{record.description}</span>
                <time dateTime={record.createdAt}>{dateLabel(record.createdAt)}</time>
              </span>
            </a>
          </article>
        </li>
        {Array.from({ length: 5 }, (_, index) => (
          <li
            key={`empty-${index + 1}`}
            data-thought-cell="empty"
            aria-hidden="true"
            inert
            className="thought-index__cell thought-index__cell--empty"
          />
        ))}
      </ol>
    </section>
  );
}
