import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import {
  type RouteCriticalCssHandle,
  DocumentMetadata,
  publicMetadataTitle,
  ResponsivePicture,
} from '../root';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { ReviewReadingPage } from '../../src/ui/reading/ReviewReadingPage';
import { selectContinuations, type ContinuationItem } from '../../src/ui/reading/select-continuations';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [routeReadingCss, readingCss, reviewCss] = import.meta.env.SSR
  ? await Promise.all([
      import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
      import('../../src/ui/styles/reading.css?inline').then((module) => module.default),
      import('../../src/ui/styles/route-review.css?inline').then((module) => module.default),
    ])
  : ['', '', ''];

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];
const REVIEW_COVER_SIZES = '(max-width: 720px) 30vw, 9rem';
export interface ReviewData {
  record: ReviewRecord;
  coverAsset?: ReleaseAsset;
  continuations: ContinuationItem[];
}

export const handle: RouteCriticalCssHandle = {
  criticalCss: `${routeReadingCss}${readingCss}${reviewCss}`,
};

function reviewDescription(record: ReviewRecord): string {
  return record.verdict ?? record.description;
}

export function reviewCoverPreload(asset: ReleaseAsset | undefined) {
  const candidates = asset?.sources.find(({ type }) => type === 'image/avif')?.candidates ?? [];
  const href = candidates.at(-1)?.src;
  if (!href) return null;
  return {
    rel: 'preload' as const,
    as: 'image' as const,
    href,
    type: 'image/avif',
    imageSrcSet: candidates.map((candidate) => `${candidate.src} ${candidate.width}w`).join(', '),
    imageSizes: REVIEW_COVER_SIZES,
    fetchPriority: 'high' as const,
  };
}

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
  return {
    record,
    continuations: selectContinuations(record, release.manifest.records),
    ...(coverAsset ? { coverAsset } : {}),
  };
}

export function meta({ data }: { data?: ReviewData }) {
  return data ? [
    { title: publicMetadataTitle(data.record.title) },
    { name: 'description', content: reviewDescription(data.record) },
    { tagName: 'link', rel: 'canonical', href: data.record.href },
  ] : [];
}

export function ReviewPresentation({ data }: { data: ReviewData }) {
  const preload = reviewCoverPreload(data.coverAsset);
  const cover = data.coverAsset ? (
    <ResponsivePicture
      asset={data.coverAsset}
      alt={data.coverAsset.alt}
      className="reading-threshold__media-image reading-threshold__media-image--review"
      eager
      sizes={REVIEW_COVER_SIZES}
    />
  ) : undefined;
  return (
    <>
      {preload ? <link {...preload} /> : null}
      <DocumentMetadata
        canonical={data.record.href}
        description={reviewDescription(data.record)}
        title={publicMetadataTitle(data.record.title)}
      />
      <SiteShell currentSection="reviews">
        <ReviewReadingPage record={data.record} cover={cover} continuations={data.continuations} />
      </SiteShell>
    </>
  );
}

export default function ReviewRoute({ loaderData }: { loaderData: ReviewData }) {
  return <ReviewPresentation data={loaderData} />;
}
