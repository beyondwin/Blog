import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { DetailActionRail } from '../editorial/DetailActionRail';
import { EditorialDetailFrame } from '../editorial/EditorialDetailFrame';

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;

function dateLabel(date: string): string {
  return date.slice(0, 10).replaceAll('-', '.');
}

export function ThoughtReadingPage({ media, record }: { media?: ReactNode; record: ThoughtRecord }) {
  const metadata = (
    <>
      <span className="thought-detail__type">생각</span>
      <time dateTime={record.createdAt}>{dateLabel(record.createdAt)}</time>
    </>
  );

  return (
    <div className="thought-reading">
      <EditorialDetailFrame
        title={record.title}
        summary={record.description}
        metadata={metadata}
        media={media}
        actions={<DetailActionRail canonicalUrl={record.href} />}
      >
        <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      </EditorialDetailFrame>
    </div>
  );
}
