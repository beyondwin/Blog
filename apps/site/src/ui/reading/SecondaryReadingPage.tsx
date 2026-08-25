import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { ReadingThreshold } from './ReadingThreshold';

type SecondaryRecord = Extract<PublicRecord, { collection: 'analysis' | 'ideas' | 'travel' }>;

const KIND_LABELS = { analysis: '조사', ideas: '아이디어', travel: '여행' } as const;

export function SecondaryReadingPage({ media, record }: { media?: ReactNode; record: SecondaryRecord }) {
  return (
    <article className={`reading-sheet reading-detail secondary-reading-page secondary-reading-page--${record.collection}`}>
      <ReadingThreshold collection={record.collection} kindLabel={KIND_LABELS[record.collection]} media={media} title={record.title} />
      <div className="reading-detail__body">
        <p className="reading-detail__summary">{record.description}</p>
        {record.collection === 'analysis' && (
          <p className="secondary-reading-page__source">
            출처: <a href={record.sourceUrl} rel="noreferrer">{record.sourceTitle}</a> · {record.format}
          </p>
        )}
        <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      </div>
    </article>
  );
}
