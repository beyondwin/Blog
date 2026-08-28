import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;

function dateLabel(date: string): string {
  return date.slice(0, 10);
}

export function ThoughtReadingPage({ media, record }: { media?: ReactNode; record: ThoughtRecord }) {
  return (
    <article className="reading-sheet thought-reading" aria-labelledby="thought-title">
      <header>
        <p><a href="/thoughts/">생각</a></p>
        <h1 id="thought-title">{record.title}</h1>
        <p>{record.description}</p>
        <time dateTime={record.createdAt}>{dateLabel(record.createdAt)}</time>
      </header>
      {media ? <figure>{media}</figure> : null}
      <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      <footer><a href="/thoughts/">생각 목록으로</a></footer>
    </article>
  );
}
