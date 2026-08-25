import type { ReactNode } from 'react';
import { ContextReturn, type DetailCollection } from './ContextReturn';

export function ReadingThreshold({
  collection,
  kindLabel,
  media,
  title,
}: {
  collection: DetailCollection;
  kindLabel: string;
  media?: ReactNode;
  title: string;
}) {
  return (
    <header className="reading-threshold">
      <ContextReturn collection={collection} />
      {media && <figure className="reading-threshold__media">{media}</figure>}
      <div className="reading-threshold__identity">
        <p>{kindLabel}</p>
        <h1>{title}</h1>
      </div>
      <span className="reading-threshold__marker" aria-hidden="true" />
    </header>
  );
}
