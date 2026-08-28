import type { LinksFunction } from 'react-router';
import type { PublicRecord } from '@beyondwin/contracts';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { HomePage, HOME_SELECTIONS, type HomePageData } from '../../src/ui/home/HomePage';
import { type RouteCriticalCssHandle, publicMetadataTitle } from '../root';
import { loadVerifiedRelease } from '../release.server';

const homeCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-home.css?inline').then((module) => module.default)
  : '';

const HERO_AVIF = '/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero-1536w.avif';
const HERO_AVIF_SRC_SET = `${HERO_AVIF} 1536w`;
const HERO_IMAGE_SIZES = '(max-width: 767px) 100vw, (max-width: 1179px) 54vw, 710px';

export const handle: RouteCriticalCssHandle = { criticalCss: homeCss };
export type HomeData = HomePageData;

function fixedRecord<C extends PublicRecord['collection']>(
  records: Record<string, PublicRecord>,
  collection: C,
  id: string,
): Extract<PublicRecord, { collection: C }> {
  const record = records[`${collection}/${id}`];
  if (!record || record.collection !== collection || record.href !== `/${collection}/${id}/`) {
    throw new Error(`Verified release is missing fixed home selection ${collection}/${id}`);
  }
  return record as Extract<PublicRecord, { collection: C }>;
}

export async function loader(): Promise<HomeData> {
  const release = await loadVerifiedRelease();
  const hero = fixedRecord(release.manifest.records, HOME_SELECTIONS.hero.collection, HOME_SELECTIONS.hero.id);
  const review = fixedRecord(release.manifest.records, HOME_SELECTIONS.review.collection, HOME_SELECTIONS.review.id);
  const article = fixedRecord(release.manifest.records, HOME_SELECTIONS.article.collection, HOME_SELECTIONS.article.id);
  const thought = fixedRecord(release.manifest.records, HOME_SELECTIONS.thought.collection, HOME_SELECTIONS.thought.id);
  if (hero.id === article.id) throw new Error('Fixed home hero and article pick must be distinct');
  const heroAsset = release.manifest.assets[`articles/${hero.id}/${HOME_SELECTIONS.hero.mediaId}`];
  const thoughtAsset = release.manifest.assets[`thoughts/${thought.id}/${HOME_SELECTIONS.thought.mediaId}`];
  if (!heroAsset) throw new Error(`Verified release is missing fixed home media articles/${hero.id}/${HOME_SELECTIONS.hero.mediaId}`);
  if (!thoughtAsset) throw new Error(`Verified release is missing fixed home media thoughts/${thought.id}/${HOME_SELECTIONS.thought.mediaId}`);
  return { hero, picks: { review, article, thought }, assets: { hero: heroAsset, thought: thoughtAsset } };
}

export const links: LinksFunction = () => [{
  rel: 'preload', as: 'image', href: HERO_AVIF, type: 'image/avif', imageSrcSet: HERO_AVIF_SRC_SET,
  imageSizes: HERO_IMAGE_SIZES, fetchPriority: 'high',
}];

export function meta() {
  return [
    { title: publicMetadataTitle() },
    { name: 'description', content: '서평과 아티클, 생각을 한 지면에서 골라 읽는 FORM & THOUGHT.' },
    { tagName: 'link', rel: 'canonical', href: '/' },
  ];
}

export function HomePresentation({ data }: { data: HomeData }) {
  return <SiteShell currentSection={null} inverseHeader><HomePage {...data} /></SiteShell>;
}

export default function HomeRoute({ loaderData }: { loaderData: HomeData }) {
  return <HomePresentation data={loaderData} />;
}
