import type { LinksFunction } from 'react-router';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { ScenePage, type ScenePageData } from '../../src/ui/scene/ScenePage';
import { type RouteCriticalCssHandle, publicMetadataTitle } from '../root';
import { loadVerifiedRelease } from '../release.server';

const sceneCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-scene.css?inline').then((module) => module.default)
  : '';

const ARTICLE_ID = 'why-i-read-in-the-ai-era';
const REVIEW_ID = 'black-swan';
const LEAD_AVIF = '/assets/content/articles/why-i-read-in-the-ai-era/reading-desk-cobalt-1536w.avif';
const LEAD_AVIF_SRC_SET = `${LEAD_AVIF} 1536w`;
const LEAD_IMAGE_SIZES = '(max-width: 720px) 70vw, (max-width: 1540px) 61vw, 940px';

export const handle: RouteCriticalCssHandle = { criticalCss: sceneCss };
export type HomeData = ScenePageData;

export async function loader(): Promise<HomeData> {
  const release = await loadVerifiedRelease();
  const article = release.manifest.records[`articles/${ARTICLE_ID}`];
  const review = release.manifest.records[`reviews/${REVIEW_ID}`];
  const judgment = release.manifest.assets[`articles/${ARTICLE_ID}/judgment-scale`];
  const lead = release.manifest.assets[`articles/${ARTICLE_ID}/reading-desk-cobalt`];
  const shared = release.manifest.assets[`articles/${ARTICLE_ID}/shared-reading-table`];
  if (article?.collection !== 'articles') throw new Error(`Verified release is missing articles/${ARTICLE_ID}`);
  if (review?.collection !== 'reviews') throw new Error(`Verified release is missing reviews/${REVIEW_ID}`);
  if (!judgment || !lead || !shared) throw new Error('Verified release is missing the judgment scene assets');
  return {
    article: {
      title: article.title,
      description: article.description,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      href: article.href,
    },
    review: {
      id: review.id,
      href: review.href,
      title: review.title,
      authors: review.authors,
      description: review.description,
      updatedAt: review.updatedAt,
      verdict: review.verdict,
    },
    assets: { judgment, lead, shared },
  };
}

export const links: LinksFunction = () => [{
  rel: 'preload',
  as: 'image',
  href: LEAD_AVIF,
  type: 'image/avif',
  imageSrcSet: LEAD_AVIF_SRC_SET,
  imageSizes: LEAD_IMAGE_SIZES,
  fetchPriority: 'high',
}];

export function meta() {
  return [
    { title: publicMetadataTitle('판단') },
    { name: 'description', content: 'AI 시대에 무엇을 믿을지 판단하기 위해 읽고 연결한 글, 책, 문장.' },
    { tagName: 'link', rel: 'canonical', href: '/' },
  ];
}

export function HomePresentation({ data }: { data: HomeData }) {
  return (
    <SiteShell currentSection={null} inverseHeader>
      <ScenePage data={data} />
    </SiteShell>
  );
}

export default function HomeRoute({ loaderData }: { loaderData: HomeData }) {
  return <HomePresentation data={loaderData} />;
}
