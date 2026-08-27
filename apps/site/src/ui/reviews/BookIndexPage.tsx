import { ResponsivePicture } from '../../../app/root';
import { OriginLink } from '../navigation/OriginLink';
import { recordAnchor } from '../navigation/record-anchor';
import {
  buildBookshelfPresentation,
  type BookShelfRecord,
  type ReleaseAsset,
  type ReviewRecord,
} from './bookshelfPresentation';

const COVER_SIZES = '(max-width: 720px) 42vw, 11.5rem';

function BookCover({
  eager = false,
  item,
  small = false,
}: {
  eager?: boolean;
  item: BookShelfRecord;
  small?: boolean;
}) {
  const className = small ? 'book-cover book-cover--small' : 'book-cover';
  if (item.coverAsset) {
    return (
      <ResponsivePicture
        asset={item.coverAsset}
        alt={small ? '' : item.coverAsset.alt}
        className={className}
        eager={eager}
        sizes={COVER_SIZES}
      />
    );
  }
  return (
    <span className={`${className} book-cover--set`} aria-hidden="true">
      <b>{item.title}</b>
      {item.authors.length > 0 ? <em>{item.authors.join(' · ')}</em> : null}
    </span>
  );
}

export function BookIndexPage({
  assets,
  records,
}: {
  assets: ReadonlyMap<string, ReleaseAsset>;
  records: readonly ReviewRecord[];
}) {
  const { diary, shelfTiers } = buildBookshelfPresentation(records, assets);
  const objects = shelfTiers.flat();
  const shelfIds = new Set(objects.map((item) => item.id));
  if (objects.length === 0) {
    return (
      <section className="reading-sheet book-index">
        <p>아직 공개한 책이 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="reading-sheet book-index">
      <h1 className="visually-hidden">책</h1>
      <ol className="book-objects">
        {objects.map((item, index) => {
          const anchorId = recordAnchor('reviews', item.id);
          return (
            <li key={item.id} id={anchorId}>
              <OriginLink
                className="book-card"
                href={item.href}
                origin={{ kind: 'reviews', anchorId }}
              >
                <BookCover eager={index < 4} item={item} />
                <strong className="book-title">{item.title}</strong>
                {item.authors.length > 0 ? (
                  <em className="book-author">{item.authors.join(' · ')}</em>
                ) : null}
                <span className="book-verdict">{item.verdict}</span>
              </OriginLink>
            </li>
          );
        })}
      </ol>
      {diary.map(({ year, entries }) => (
        <section className="book-diary" id={`reviews-${year}`} key={year}>
          <h2>{year}</h2>
          <ol>
            {entries.map((item) => {
              const anchorId = recordAnchor('reviews', item.id);
              return (
                <li key={item.id} id={shelfIds.has(item.id) ? undefined : anchorId}>
                  <OriginLink href={item.href} origin={{ kind: 'reviews', anchorId }}>
                    <BookCover item={item} small />
                    <span className="book-diary__copy">
                      <strong className="book-title">{item.title}</strong>
                      <span className="book-verdict">{item.verdict}</span>
                    </span>
                  </OriginLink>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </section>
  );
}
