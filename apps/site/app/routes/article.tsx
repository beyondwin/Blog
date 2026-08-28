import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { ArticleReadingPage } from '../../src/ui/reading/ArticleReadingPage';
import { selectContinuations, type ContinuationItem } from '../../src/ui/reading/select-continuations';
import {
  type RouteCriticalCssHandle,
  DocumentMetadata,
  metadataForRecord,
  publicMetadataTitle,
  ResponsivePicture,
} from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [routeReadingCss, readingCss, articleCss] = import.meta.env.SSR
  ? await Promise.all([
      import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
      import('../../src/ui/styles/reading.css?inline').then((module) => module.default),
      import('../../src/ui/styles/route-article.css?inline').then((module) => module.default),
    ])
  : ['', '', ''];

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];
export interface ArticleData {
  record: ArticleRecord;
  featuredAsset?: ReleaseAsset;
  continuations: ContinuationItem[];
}

export const handle: RouteCriticalCssHandle = {
  criticalCss: `${routeReadingCss}${readingCss}${articleCss}`,
};

export async function loader({ params }: { params: { slug?: string } }): Promise<ArticleData> {
  const release = await loadVerifiedRelease();
  const record = params.slug ? recordForRoute(release, 'articles', params.slug) : null;
  if (!record) throw new Response('Not Found', { status: 404 });
  const featuredAsset = record.featuredMedia
    ? release.manifest.assets[`articles/${record.id}/${record.featuredMedia}`]
    : undefined;
  if (record.featuredMedia && !featuredAsset) {
    throw new Error(`Verified release is missing articles/${record.id}/${record.featuredMedia}`);
  }
  return {
    record,
    continuations: selectContinuations(record, release.manifest.records),
    ...(featuredAsset ? { featuredAsset } : {}),
  };
}

export function meta({ data }: { data?: ArticleData }) {
  return data ? metadataForRecord(data.record) : [];
}

export function ArticlePresentation({ data }: { data: ArticleData }) {
  const media = data.featuredAsset ? (
    <ResponsivePicture
      asset={data.featuredAsset}
      alt={data.featuredAsset.alt}
      className="reading-threshold__media-image reading-threshold__media-image--article"
      eager
      sizes="(max-width: 720px) 30vw, 9rem"
    />
  ) : undefined;
  return (
    <>
      <DocumentMetadata
        canonical={data.record.href}
        description={data.record.description}
        title={publicMetadataTitle(data.record.title)}
      />
      <SiteShell currentSection="articles">
        <ArticleReadingPage record={data.record} media={media} continuations={data.continuations} />
      </SiteShell>
    </>
  );
}

export default function ArticleRoute({ loaderData }: { loaderData: ArticleData }) {
  return <ArticlePresentation data={loaderData} />;
}
