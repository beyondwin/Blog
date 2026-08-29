import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { articleReadingPresentation, formatArticleDate } from '../articles/articlePresentation';
import { DetailActionRail } from '../editorial/DetailActionRail';
import { EditorialDetailFrame } from '../editorial/EditorialDetailFrame';
import { ContinueReading } from './ContinueReading';
import { ContextReturn } from './ContextReturn';
import type { ContinuationItem } from './select-continuations';

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

export function ArticleReadingPage({ continuations, media, record }: {
  continuations: readonly ContinuationItem[];
  media?: ReactNode;
  record: ArticleRecord;
}) {
  const reading = articleReadingPresentation(record);
  const metadata = (
    <>
      <span className="article-detail__type">아티클</span>
      <time dateTime={record.updatedAt}>{formatArticleDate(record.updatedAt)}</time>
    </>
  );
  return (
    <>
      <EditorialDetailFrame
        className="article-detail"
        title={record.title}
        summary={reading.stake}
        metadata={metadata}
        media={media}
        actions={(
          <>
            <ContextReturn collection="articles" />
            <DetailActionRail canonicalUrl={record.href} />
          </>
        )}
      >
        {reading.toc.length > 0 ? (
          <nav className="article-toc" aria-label="절">
            <ol>{reading.toc.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ol>
          </nav>
        ) : null}
        <div className="prose" dangerouslySetInnerHTML={{ __html: reading.proseHtml }} />
        {reading.colophonHtml ? (
          <section className="article-colophon" dangerouslySetInnerHTML={{ __html: reading.colophonHtml }} />
        ) : null}
      </EditorialDetailFrame>
      <ContinueReading items={continuations} collectionHref="/articles/" collectionLabel="아티클 전체 보기" />
    </>
  );
}
