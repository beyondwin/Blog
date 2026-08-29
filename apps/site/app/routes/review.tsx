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
import { hasApprovedCoverRedistribution } from '../../src/ui/reviews/bookshelfPresentation';
import { selectContinuations, type ContinuationItem } from '../../src/ui/reading/select-continuations';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const detailCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-detail.css?inline').then((module) => module.default)
  : '';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];
const REVIEW_COVER_SIZES = '(max-width: 767px) 72vw, min(38vw, 420px)';
export interface ReviewData {
  record: ReviewRecord;
  coverAsset?: ReleaseAsset;
  continuations: ContinuationItem[];
}

export const handle: RouteCriticalCssHandle = {
  criticalCss: detailCss,
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
  const candidateCover = record.coverState === 'verified' && record.readEditionVerified && record.coverMedia
    ? release.manifest.assets[`reviews/${record.id}/${record.coverMedia}`]
    : undefined;
  const coverAsset = hasApprovedCoverRedistribution(candidateCover) ? candidateCover : undefined;
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
  const approvedCover = hasApprovedCoverRedistribution(data.coverAsset) ? data.coverAsset : undefined;
  const preload = reviewCoverPreload(approvedCover);
  const cover = approvedCover ? (
    <ResponsivePicture
      asset={approvedCover}
      alt={approvedCover.alt}
      className="review-detail__cover-image"
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
      <SiteShell currentSection="reviews" inverseHeader={Boolean(approvedCover)}>
        <ReviewReadingPage record={data.record} cover={cover} continuations={data.continuations} />
      </SiteShell>
    </>
  );
}

export default function ReviewRoute({ loaderData }: { loaderData: ReviewData }) {
  return <ReviewPresentation data={loaderData} />;
}
