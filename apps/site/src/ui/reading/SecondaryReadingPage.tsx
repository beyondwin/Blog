import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { DetailActionRail } from '../editorial/DetailActionRail';
import { EditorialDetailFrame } from '../editorial/EditorialDetailFrame';

type SecondaryRecord = Extract<PublicRecord, { collection: 'analysis' | 'ideas' | 'travel' }>;

const KIND_LABELS = { analysis: '조사', ideas: '아이디어', travel: '여행' } as const;

export function SecondaryReadingPage({ media, record }: { media?: ReactNode; record: SecondaryRecord }) {
  const metadata = (
    <>
      <span className="secondary-detail__kind">{KIND_LABELS[record.collection]}</span>
      <time dateTime={record.updatedAt}>{record.updatedAt.slice(0, 10).replaceAll('-', '.')}</time>
    </>
  );
  return (
    <EditorialDetailFrame
      title={record.title}
      summary={record.description}
      metadata={metadata}
      media={media}
      actions={<DetailActionRail canonicalUrl={record.href} />}
    >
      {record.collection === 'analysis' && (
        <p className="secondary-reading-page__source">
          출처: <a href={record.sourceUrl} rel="noreferrer">{record.sourceTitle}</a> · {record.format}
        </p>
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
    </EditorialDetailFrame>
  );
}
