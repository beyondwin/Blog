import { useEffect } from 'react';
import { RecordRow, type RecordSummary } from '../collections/RecordRow';
import { EditorialPageHeader } from '../editorial/EditorialPageHeader';

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
    <section className="secondary-index memory-index" aria-label="남는 문장">
      <EditorialPageHeader
        title="남는 문장"
        description="공개하기로 고른 문장과 그 문장이 나온 근거입니다."
      />
      {records.length > 0 ? (
        <ol className="secondary-index__ledger memory-index__list">
          {records.map((record) => <RecordRow key={record.id} record={record} />)}
        </ol>
      ) : <p className="collection-page__empty">아직 공개한 문장이 없습니다.</p>}
    </section>
  );
}
