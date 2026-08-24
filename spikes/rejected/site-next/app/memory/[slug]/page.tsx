import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublicRecord } from '@beyondwin/contracts';
import {
  loadVerifiedRelease,
  metadataForRecord,
  PageFrame,
  recordForRoute,
  staticParamsForCollection,
} from '../../layout';

export const dynamicParams = false;

type MemoryRecord = Extract<PublicRecord, { collection: 'memory' }>;
type RouteProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return staticParamsForCollection(await loadVerifiedRelease(), 'memory');
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const record = recordForRoute(await loadVerifiedRelease(), 'memory', slug);
  if (!record) notFound();
  return metadataForRecord(record);
}

export function MemoryPresentation({ record }: { record: MemoryRecord }) {
  return (
    <PageFrame currentPath={record.href} pageClass="press-page">
      <article className="press-sheet memory-thought">
        <h1>{record.claimKo}</h1>
        {record.claimEn && <p className="memory-thought__en">{record.claimEn}</p>}
        <div className="press-prose memory-thought__body" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
        {record.sources.length > 0 && (
          <section className="memory-thought__sources">
            <h2>이 문장이 나온 글</h2>
            <ul>{record.sources.map((source) => <li key={source.href}><a href={source.href}>{source.title}</a></li>)}</ul>
          </section>
        )}
        {record.companions.length > 0 && (
          <section className="memory-thought__companions">
            <h2>같이 붙는 문장</h2>
            <ul>{record.companions.map((item) => <li key={item.href}><a href={item.href}>{item.claimKo}</a></li>)}</ul>
          </section>
        )}
      </article>
    </PageFrame>
  );
}

export default async function MemoryPage({ params }: RouteProps) {
  const { slug } = await params;
  const release = await loadVerifiedRelease();
  const record = recordForRoute(release, 'memory', slug);
  if (!record) notFound();
  return <MemoryPresentation record={record} />;
}
