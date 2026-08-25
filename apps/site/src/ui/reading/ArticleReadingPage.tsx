import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
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
  return (
    <article className="reading-sheet reading-detail article-reading-page">
      <ReadingThreshold collection="articles" kindLabel="글" media={media} title={record.title} />
      <div className="reading-detail__body">
        <p className="reading-detail__summary">{record.description}</p>
        <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      </div>
      <ContinueReading
        items={continuations}
        collectionHref="/articles/"
        collectionLabel="글 전체 보기"
      />
    </article>
  );
}
