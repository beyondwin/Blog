import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { ContinueReading } from './ContinueReading';
import { ReadingThreshold } from './ReadingThreshold';
import type { ContinuationItem } from './select-continuations';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;

function formatReadMonth(date: string): string {
  const [year, month] = date.slice(0, 7).split('-');
  return `${year}년 ${Number(month)}월에 읽음`;
}

export function ReviewReadingPage({
  continuations,
  cover,
  record,
}: {
  continuations: readonly ContinuationItem[];
  cover?: ReactNode;
  record: ReviewRecord;
}) {
  const edition = record.editionLabel?.includes(record.publisher ?? '')
    ? record.editionLabel
    : [record.publisher, record.editionLabel].filter(Boolean).join(' · ');
  return (
    <article className="reading-sheet reading-detail review-reading-page">
      <ReadingThreshold collection="reviews" kindLabel="책" media={cover} title={record.title} />
      <div className="reading-detail__body">
        <div className="review-reading-page__identity">
          <p>{record.authors.join(' · ')}</p>
          {edition && <small>{edition}</small>}
          {record.completedAt && <time dateTime={record.completedAt}>{formatReadMonth(record.completedAt)}</time>}
        </div>
        <p className="review-reading-page__verdict">{record.verdict ?? record.description}</p>
        <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      </div>
      <ContinueReading
        items={continuations}
        collectionHref="/reviews/"
        collectionLabel="책 전체 보기"
      />
    </article>
  );
}
