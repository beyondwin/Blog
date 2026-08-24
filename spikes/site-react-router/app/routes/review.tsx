import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { DocumentMetadata, metadataForRecord, PageFrame, ResponsivePicture } from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];
export interface ReviewData { record: ReviewRecord; coverAsset?: ReleaseAsset }

export async function loader({ params }: { params: { slug?: string } }): Promise<ReviewData> {
  const release = await loadVerifiedRelease();
  const record = params.slug ? recordForRoute(release, 'reviews', params.slug) : null;
  if (!record) throw new Response('Not Found', { status: 404 });
  const coverAsset = record.coverMedia
    ? release.manifest.assets[`reviews/${record.id}/${record.coverMedia}`]
    : undefined;
  if (record.coverMedia && !coverAsset) {
    throw new Error(`Verified release is missing reviews/${record.id}/${record.coverMedia}`);
  }
  return { record, ...(coverAsset ? { coverAsset } : {}) };
}

export function meta({ data }: { data?: ReviewData }) {
  return data ? metadataForRecord(data.record) : [];
}

function formatReadMonth(date: string): string {
  const [year, month] = date.slice(0, 7).split('-');
  return `${year}년 ${Number(month)}월에 읽음`;
}

export function ReviewPresentation({ data }: { data: ReviewData }) {
  const authorLine = data.record.authors.join(' · ');
  const whisper = data.record.editionLabel?.includes(data.record.publisher ?? '')
    ? data.record.editionLabel
    : [data.record.publisher, data.record.editionLabel].filter(Boolean).join(' · ');
  const cover = data.coverAsset ? (
    <ResponsivePicture
      asset={data.coverAsset}
      alt={data.coverAsset.alt}
      className="book-cover"
      eager
      sizes="(max-width: 720px) 42vw, 13.5rem"
    />
  ) : (
    <span className="book-cover book-cover--set"><b>{data.record.title}</b><em>{authorLine}</em></span>
  );
  return (
    <>
      <DocumentMetadata
        canonical={data.record.href}
        description={data.record.description}
        title={`${data.record.title} · beyondwin`}
      />
      <PageFrame currentPath={data.record.href} pageClass="press-page">
      <span className="book-cover-remnant" aria-hidden="true">
        {data.coverAsset
          ? <ResponsivePicture asset={data.coverAsset} alt="" className="book-cover" sizes="28px" />
          : cover}
      </span>
      <article className="press-sheet book-sheet">
        <aside className="book-object" aria-label="책">
          <figure className="book-object__cover">{cover}</figure>
          {whisper && <p className="book-object__whisper">{whisper}</p>}
        </aside>
        <div className="book-reading">
          <header>
            <h1 className="book-title">{data.record.title}</h1>
            <p className="book-author">{authorLine}</p>
            <p className="book-verdict">{data.record.verdict ?? data.record.description}</p>
            {data.record.completedAt && <time dateTime={data.record.completedAt}>{formatReadMonth(data.record.completedAt)}</time>}
          </header>
          <div className="prose book-prose" dangerouslySetInnerHTML={{ __html: data.record.bodyHtml }} />
        </div>
      </article>
      </PageFrame>
    </>
  );
}

export default function ReviewRoute({ loaderData }: { loaderData: ReviewData }) {
  return <ReviewPresentation data={loaderData} />;
}
