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

export function formatRecordDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return [parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('.');
}

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
      <span className="editorial-list-row__copy">
        <h2>{record.title}</h2>
        <span>{record.description}</span>
        {record.detail && <span className="secondary-record-row__detail">{record.detail}</span>}
      </span>
      <span className="editorial-list-row__date">
        <time dateTime={record.updatedAt}>{formatRecordDate(record.updatedAt)}</time>
        <svg className="editorial-list-row__arrow" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </span>
    </>
  );
  return (
    <li className="record-row" id={anchorId}>
      {originKind ? (
        <OriginLink className="editorial-list-row editorial-list-row--text-led" href={record.href} origin={{ kind: originKind, anchorId }}>{content}</OriginLink>
      ) : (
        <a className="editorial-list-row editorial-list-row--text-led" href={record.href}>{content}</a>
      )}
    </li>
  );
}
