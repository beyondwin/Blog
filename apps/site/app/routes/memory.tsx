import type { PublicRecord } from '@beyondwin/contracts';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { MemoryDetailPage } from '../../src/ui/memory/MemoryDetailPage';
import { type RouteCriticalCssHandle, DocumentMetadata, metadataForRecord } from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [readingCss, memoryCss] = import.meta.env.SSR
  ? await Promise.all([
      import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
      import('../../src/ui/styles/route-memory.css?inline').then((module) => module.default),
    ])
  : ['', ''];

type MemoryRecord = Extract<PublicRecord, { collection: 'memory' }>;
export interface MemoryData { record: MemoryRecord }

export const handle: RouteCriticalCssHandle = {
  criticalCss: `${readingCss}${memoryCss}`,
};

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
      <SiteShell mode="reading" currentSection={null}>
        <MemoryDetailPage record={data.record} />
      </SiteShell>
    </>
  );
}

export default function MemoryRoute({ loaderData }: { loaderData: MemoryData }) {
  return <MemoryPresentation data={loaderData} />;
}
