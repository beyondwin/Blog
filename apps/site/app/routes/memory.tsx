import type { PublicRecord } from '@beyondwin/contracts';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { MemoryDetailPage } from '../../src/ui/memory/MemoryDetailPage';
import { type RouteCriticalCssHandle, DocumentMetadata, metadataForRecord, publicMetadataTitle } from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [detailCss, memoryCss] = import.meta.env.SSR
  ? await Promise.all([
      import('../../src/ui/styles/route-detail.css?inline').then((module) => module.default),
      import('../../src/ui/styles/route-memory.css?inline').then((module) => module.default),
    ])
  : ['', ''];

type MemoryRecord = Extract<PublicRecord, { collection: 'memory' }>;
export interface MemoryData { record: MemoryRecord }

export const handle: RouteCriticalCssHandle = {
  criticalCss: `${detailCss}${memoryCss}`,
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
        title={publicMetadataTitle(data.record.title)}
      />
      <SiteShell currentSection={null}>
        <MemoryDetailPage record={data.record} />
      </SiteShell>
    </>
  );
}

export default function MemoryRoute({ loaderData }: { loaderData: MemoryData }) {
  return <MemoryPresentation data={loaderData} />;
}
