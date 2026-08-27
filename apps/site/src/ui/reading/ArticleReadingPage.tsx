import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { articleReadingPresentation } from '../articles/articlePresentation';
import { ContinueReading } from './ContinueReading';
import { ReadingThreshold } from './ReadingThreshold';
import type { ContinuationItem } from './select-continuations';

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

export function ArticleReadingPage({
  continuations,
  media,
  record,
}: {
  continuations: readonly ContinuationItem[];
  media?: ReactNode;
  record: ArticleRecord;
}) {
  const reading = articleReadingPresentation(record);
  const summary = reading.stake;
  return (
    <article className="reading-sheet reading-detail article-reading-page">
      <ReadingThreshold collection="articles" kindLabel={reading.kicker} media={media} title={record.title} />
      <div className="reading-detail__body">
        {summary ? <p className="reading-detail__summary">{summary}</p> : null}
        {reading.toc.length > 0 ? (
          <nav className="article-toc" aria-label="절">
            <ol>
              {reading.toc.map((item) => (
                <li key={item.href}><a href={item.href}>{item.label}</a></li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="prose" dangerouslySetInnerHTML={{ __html: reading.proseHtml }} />
      </div>
      {reading.colophonHtml ? (
        <section className="article-colophon" dangerouslySetInnerHTML={{ __html: reading.colophonHtml }} />
      ) : null}
      <ContinueReading items={continuations} collectionHref="/articles/" collectionLabel="글 전체 보기" />
    </article>
  );
}
