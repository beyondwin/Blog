import type { ReactNode } from 'react';

export function EditorialListRow({
  date,
  description,
  href,
  media,
  title,
  variant = 'default',
}: {
  date: string;
  description: string;
  href: string;
  media?: ReactNode;
  title: string;
  variant?: 'default' | 'review';
}) {
  const className = [
    'editorial-list-row',
    media ? null : 'editorial-list-row--text-led',
    variant === 'review' ? 'editorial-list-row--review' : null,
  ].filter(Boolean).join(' ');

  return (
    <a className={className} href={href}>
      {media
        ? (
            <span
              className="editorial-list-row__media"
              data-media-fit={variant === 'review' ? 'contain' : 'cover'}
            >
              {media}
            </span>
          )
        : null}
      <span className="editorial-list-row__copy">
        <h2>{title}</h2>
        <span>{description}</span>
      </span>
      <span className="editorial-list-row__date">
        <time dateTime={date.replaceAll('.', '-')}>{date}</time>
        <svg className="editorial-list-row__arrow" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </span>
    </a>
  );
}
