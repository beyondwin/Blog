import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ResponsivePicture } from '../../../app/root';

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];
const THOUGHT_CARD_SIZES = '(max-width: 720px) calc(100vw - 48px), 42em';

function dateLabel(date: string): string {
  return date.slice(0, 10);
}

export function ThoughtIndexPage({
  assets,
  records,
}: {
  assets: ReadonlyMap<string, ReleaseAsset>;
  records: readonly ThoughtRecord[];
}) {
  return (
    <section className="reading-sheet thoughts-index" aria-labelledby="thoughts-index-title">
      <header>
        <h1 id="thoughts-index-title">생각</h1>
      </header>
      {records.length === 0 ? (
        <p>공개한 생각이 없습니다.</p>
      ) : (
        <ol>
          {records.map((record) => {
            const asset = record.featuredMedia
              ? assets.get(`thoughts/${record.id}/${record.featuredMedia}`)
              : undefined;
            return (
              <li key={record.id}>
                <article>
                  {asset ? (
                    <a href={record.href}>
                      <ResponsivePicture asset={asset} alt={asset.alt} sizes={THOUGHT_CARD_SIZES} />
                    </a>
                  ) : null}
                  <h2><a href={record.href}>{record.title}</a></h2>
                  <p>{record.description}</p>
                  <time dateTime={record.createdAt}>{dateLabel(record.createdAt)}</time>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
