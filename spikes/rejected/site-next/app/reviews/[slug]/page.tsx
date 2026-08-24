import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublicRecord } from '@beyondwin/contracts';
import {
  loadVerifiedRelease,
  metadataForRecord,
  PageFrame,
  recordForRoute,
  ResponsivePicture,
  staticParamsForCollection,
  type CandidateRelease,
} from '../../layout';

export const dynamicParams = false;

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type RouteProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return staticParamsForCollection(await loadVerifiedRelease(), 'reviews');
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const record = recordForRoute(await loadVerifiedRelease(), 'reviews', slug);
  if (!record) notFound();
  return metadataForRecord(record);
}

function formatReadMonth(date: string): string {
  const [year, month] = date.slice(0, 7).split('-');
  return `${year}년 ${Number(month)}월에 읽음`;
}

export function ReviewPresentation({ record, release }: { record: ReviewRecord; release: CandidateRelease }) {
  const asset = record.coverMedia
    ? release.manifest.assets[`reviews/${record.id}/${record.coverMedia}`]
    : undefined;
  if (record.coverMedia && !asset) throw new Error(`Verified release is missing reviews/${record.id}/${record.coverMedia}`);
  const authorLine = record.authors.join(' · ');
  const whisper = record.editionLabel?.includes(record.publisher ?? '')
    ? record.editionLabel
    : [record.publisher, record.editionLabel].filter(Boolean).join(' · ');
  const cover = asset ? (
    <ResponsivePicture asset={asset} alt={asset.alt} className="book-cover" eager sizes="(max-width: 720px) 42vw, 13.5rem" />
  ) : (
    <span className="book-cover book-cover--set"><b>{record.title}</b><em>{authorLine}</em></span>
  );

  return (
    <PageFrame currentPath={record.href} pageClass="press-page">
      <span className="book-cover-remnant" aria-hidden="true">
        {asset ? <ResponsivePicture asset={asset} alt="" className="book-cover" sizes="28px" /> : cover}
      </span>
      <article className="press-sheet book-sheet">
        <aside className="book-object" aria-label="책">
          <figure className="book-object__cover">
            {cover}
          </figure>
          {whisper && <p className="book-object__whisper">{whisper}</p>}
        </aside>
        <div className="book-reading">
          <header>
            <h1 className="book-title">{record.title}</h1>
            <p className="book-author">{authorLine}</p>
            <p className="book-verdict">{record.verdict ?? record.description}</p>
            {record.completedAt && <time dateTime={record.completedAt}>{formatReadMonth(record.completedAt)}</time>}
          </header>
          <div className="prose book-prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
        </div>
      </article>
    </PageFrame>
  );
}

export default async function ReviewPage({ params }: RouteProps) {
  const { slug } = await params;
  const release = await loadVerifiedRelease();
  const record = recordForRoute(release, 'reviews', slug);
  if (!record) notFound();
  return <ReviewPresentation record={record} release={release} />;
}
