import { useEffect } from 'react';
import type { RecordSummary } from '../collections/RecordRow';

const SAFE_MEMORY_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const LEGACY_HASH = /^#(?:map|relation|memory-detail)-(.+)$/u;

export function memoryCompatibilityTarget(
  location: { search: string; hash: string },
  verifiedSlugs: readonly string[],
): string | null {
  const thought = new URLSearchParams(location.search).get('thought');
  const hashMatch = LEGACY_HASH.exec(location.hash);
  let hashSlug: string | null = null;
  if (hashMatch?.[1]) {
    try { hashSlug = decodeURIComponent(hashMatch[1]); } catch { hashSlug = null; }
  }
  const slug = thought || hashSlug;
  if (!slug || !SAFE_MEMORY_SLUG.test(slug) || !verifiedSlugs.includes(slug)) return null;
  return `/memory/${slug}/`;
}

export function MemoryIndexPage({ records }: { records: readonly RecordSummary[] }) {
  useEffect(() => {
    const target = memoryCompatibilityTarget(window.location, records.map((record) => record.id));
    if (target !== null) window.location.replace(target);
  }, [records]);

  return (
    <section className="reading-sheet memory-index" aria-labelledby="memory-index-title">
      <header className="collection-page__header">
        <h1 id="memory-index-title">남는 문장</h1>
        <p>공개하기로 고른 문장과 그 문장이 나온 근거입니다.</p>
      </header>
      {records.length > 0 ? (
        <ol className="memory-index__list">
          {records.map((record) => <li key={record.id}><a href={record.href}>{record.title}</a></li>)}
        </ol>
      ) : <p className="collection-page__empty">아직 공개한 문장이 없습니다.</p>}
    </section>
  );
}
