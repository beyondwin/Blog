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

const [detailCss, thoughtCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-detail.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-thought.css?inline').then((module) => module.default),
]) : ['', ''];

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

export interface ThoughtData {
  record: ThoughtRecord;
  featuredAsset?: ReleaseAsset;
}

export const handle: RouteCriticalCssHandle = { criticalCss: `${detailCss}${thoughtCss}` };

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
      className="thought-detail__hero-image"
      eager
      sizes="(max-width: 767px) 100vw, (max-width: 1179px) 40vw, 500px"
    />
  ) : undefined;
  return (
    <>
      <DocumentMetadata
        canonical={data.record.href}
        description={data.record.description}
        title={publicMetadataTitle(data.record.title)}
      />
      <SiteShell currentSection="thoughts">
        <ThoughtReadingPage record={data.record} media={media} />
      </SiteShell>
    </>
  );
}

export default function ThoughtRoute({ loaderData }: { loaderData: ThoughtData }) {
  return <ThoughtPresentation data={loaderData} />;
}
