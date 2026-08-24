import type { PublicRecord } from '@beyondwin/contracts';
import { DocumentMetadata, metadataForRecord, PageFrame } from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

type MemoryRecord = Extract<PublicRecord, { collection: 'memory' }>;
export interface MemoryData { record: MemoryRecord }

export async function loader({ params }: { params: { slug?: string } }): Promise<MemoryData> {
  const record = params.slug
    ? recordForRoute(await loadVerifiedRelease(), 'memory', params.slug)
    : null;
  if (!record) throw new Response('Not Found', { status: 404 });
  return { record };
}

export function meta({ data }: { data?: MemoryData }) {
  return data ? metadataForRecord(data.record) : [];
}

export function MemoryPresentation({ data }: { data: MemoryData }) {
  return (
    <>
      <DocumentMetadata
        canonical={data.record.href}
        description={data.record.description}
        title={`${data.record.title} · beyondwin`}
      />
      <PageFrame currentPath={data.record.href} pageClass="press-page">
      <article className="press-sheet memory-thought">
        <h1>{data.record.claimKo}</h1>
        {data.record.claimEn && <p className="memory-thought__en">{data.record.claimEn}</p>}
        <div className="press-prose memory-thought__body" dangerouslySetInnerHTML={{ __html: data.record.bodyHtml }} />
        {data.record.sources.length > 0 && (
          <section className="memory-thought__sources">
            <h2>이 문장이 나온 글</h2>
            <ul>{data.record.sources.map((source) => <li key={source.href}><a href={source.href}>{source.title}</a></li>)}</ul>
          </section>
        )}
        {data.record.companions.length > 0 && (
          <section className="memory-thought__companions">
            <h2>같이 붙는 문장</h2>
            <ul>{data.record.companions.map((item) => <li key={item.href}><a href={item.href}>{item.claimKo}</a></li>)}</ul>
          </section>
        )}
      </article>
      </PageFrame>
    </>
  );
}

export default function MemoryRoute({ loaderData }: { loaderData: MemoryData }) {
  return <MemoryPresentation data={loaderData} />;
}
