import type { ReactNode } from 'react';

export type EditorialDetailVariant = 'split' | 'review';

export function EditorialDetailFrame({
  actions,
  children,
  media,
  metadata,
  summary,
  supportingMedia,
  title,
  variant = 'split',
}: {
  actions: ReactNode;
  children: ReactNode;
  media?: ReactNode;
  metadata?: ReactNode;
  summary?: string;
  supportingMedia?: ReactNode;
  title: string;
  variant?: EditorialDetailVariant;
}) {
  const introduction = (
    <div className="editorial-detail-frame__introduction">
      <h1>{title}</h1>
      {summary ? <p>{summary}</p> : null}
      {metadata ? <div className="editorial-detail-frame__metadata">{metadata}</div> : null}
    </div>
  );
  const resolvedMedia = media
    ? (
        <figure
          className="editorial-detail-frame__media"
          data-media-fit={variant === 'review' ? 'contain' : 'cover'}
        >
          {media}
        </figure>
      )
    : null;

  return (
    <article className={`editorial-detail-frame editorial-detail-frame--${media ? variant : 'text-led'}`}>
      <header className="editorial-detail-frame__hero">
        {variant === 'review' ? <>{resolvedMedia}{introduction}</> : <>{introduction}{resolvedMedia}</>}
      </header>
      <div className="editorial-detail-frame__body">
        <div className="editorial-detail-frame__actions">{actions}</div>
        <div className="editorial-detail-frame__prose">{children}</div>
        {supportingMedia
          ? <div className="editorial-detail-frame__supporting-media">{supportingMedia}</div>
          : null}
      </div>
    </article>
  );
}
