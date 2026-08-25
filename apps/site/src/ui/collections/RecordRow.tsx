import type { PublicCollection } from '@beyondwin/contracts';
import { OriginLink } from '../navigation/OriginLink';
import { recordAnchor } from '../navigation/record-anchor';
import type { ReadingOrigin } from '../navigation/origin';

export interface RecordSummary {
  id: string;
  collection: PublicCollection;
  href: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  detail?: string;
}

type ListOriginKind = Extract<ReadingOrigin['kind'], 'articles' | 'reviews' | 'analysis' | 'ideas' | 'travel' | 'tags'>;

export function RecordRow({
  originKind,
  record,
}: {
  originKind?: ListOriginKind;
  record: RecordSummary;
}) {
  const anchorId = recordAnchor(record.collection, record.id);
  const content = (
    <>
      <span className="record-row__title">{record.title}</span>
      <span className="record-row__description">{record.description}</span>
      {record.detail && <span className="record-row__detail">{record.detail}</span>}
    </>
  );
  return (
    <li className="record-row" id={anchorId}>
      {originKind ? (
        <OriginLink href={record.href} origin={{ kind: originKind, anchorId }}>{content}</OriginLink>
      ) : (
        <a href={record.href}>{content}</a>
      )}
    </li>
  );
}
