import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { ThoughtReadingPage } from '../../src/ui/thoughts/ThoughtReadingPage';
import {
  type RouteCriticalCssHandle,
  DocumentMetadata,
  metadataForRecord,
  publicMetadataTitle,
  ResponsivePicture,
} from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [routeReadingCss, readingCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/reading.css?inline').then((module) => module.default),
]) : ['', ''];

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

export interface ThoughtData {
  record: ThoughtRecord;
  featuredAsset?: ReleaseAsset;
}

export const handle: RouteCriticalCssHandle = { criticalCss: `${routeReadingCss}${readingCss}` };

export async function loader({ params }: { params: { slug?: string } }): Promise<ThoughtData> {
  const release = await loadVerifiedRelease();
  const record = params.slug ? recordForRoute(release, 'thoughts', params.slug) : null;
  if (!record) throw new Response('Not Found', { status: 404 });
  const featuredAsset = record.featuredMedia
    ? release.manifest.assets[`thoughts/${record.id}/${record.featuredMedia}`]
    : undefined;
  if (record.featuredMedia && !featuredAsset) {
    throw new Error(`Verified release is missing thoughts/${record.id}/${record.featuredMedia}`);
  }
  return { record, ...(featuredAsset ? { featuredAsset } : {}) };
}

export function meta({ data }: { data?: ThoughtData }) {
  return data ? metadataForRecord(data.record) : [];
}

export function ThoughtPresentation({ data }: { data: ThoughtData }) {
  const media = data.featuredAsset ? (
    <ResponsivePicture
      asset={data.featuredAsset}
      alt={data.featuredAsset.alt}
      sizes="(max-width: 720px) calc(100vw - 48px), 42em"
    />
  ) : undefined;
  return (
    <>
      <DocumentMetadata
        canonical={data.record.href}
        description={data.record.description}
        title={publicMetadataTitle(data.record.title)}
      />
      <SiteShell mode="reading" currentSection={null}>
        <ThoughtReadingPage record={data.record} media={media} />
      </SiteShell>
    </>
  );
}

export default function ThoughtRoute({ loaderData }: { loaderData: ThoughtData }) {
  return <ThoughtPresentation data={loaderData} />;
}
