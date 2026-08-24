import type { Metadata } from 'next';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import {
  loadVerifiedRelease,
  PageFrame,
  ResponsivePicture,
  type CandidateRelease,
} from './layout';

const ARTICLE_ID = 'why-i-read-in-the-ai-era';
const REVIEW_ID = 'black-swan';
const ARTICLE_HREF = `/articles/${ARTICLE_ID}/`;

export const HOME_METADATA: Metadata = {
  title: '판단 · beyondwin',
  description: 'AI 시대에 무엇을 믿을지 판단하기 위해 읽고 연결한 글, 책, 문장.',
  alternates: { canonical: '/' },
};

export const metadata = HOME_METADATA;

type ReleaseAsset = PublicReleaseManifest['assets'][string];

function requireRecord<C extends PublicRecord['collection']>(
  release: CandidateRelease,
  key: string,
  collection: C,
): Extract<PublicRecord, { collection: C }> {
  const record = release.manifest.records[key];
  if (record?.collection !== collection) throw new Error(`Verified release is missing ${key}`);
  return record as Extract<PublicRecord, { collection: C }>;
}

function requireAsset(release: CandidateRelease, key: string): ReleaseAsset {
  const asset = release.manifest.assets[key];
  if (!asset) throw new Error(`Verified release is missing ${key}`);
  return asset;
}

function MediaSceneObject({
  asset,
  id,
  href,
  eager = false,
  decorative = false,
  showFolio = false,
}: {
  asset: ReleaseAsset;
  id: string;
  href: string;
  eager?: boolean;
  decorative?: boolean;
  showFolio?: boolean;
}) {
  const content = (
    <>
      <span className="visually-hidden">그림</span>
      <ResponsivePicture
        asset={asset}
        alt={asset.alt}
        className="scene-object__image"
        eager={eager}
        sizes="(max-width: 720px) 72vw, 61vw"
      />
      {showFolio && (
        <span className="scene-object__folio" aria-hidden="true">
          <span className="scene-object__folio-scene">
            <strong>장면 기록</strong>
            <span>{asset.caption}</span>
          </span>
          <span className="scene-object__folio-fact"><span>제작</span><strong>{asset.credit}</strong></span>
          <span className="scene-object__folio-fact"><span>검증</span><strong>{asset.verifiedAt.replaceAll('-', '.')}</strong></span>
          <span className="scene-object__folio-fact">
            <span>원본</span><strong>{asset.width} × {asset.height} · {asset.fallback.format.toUpperCase()}</strong>
          </span>
        </span>
      )}
    </>
  );

  if (decorative) {
    return <span className="scene-object scene-object--image" data-scene-echo={id} aria-hidden="true">{content}</span>;
  }
  return <a className="scene-object scene-object--image" data-scene-object={id} href={href}>{content}</a>;
}

function ReviewSceneObject({
  record,
  decorative = false,
}: {
  record: Extract<PublicRecord, { collection: 'reviews' }>;
  decorative?: boolean;
}) {
  const content = (
    <>
      <span className="visually-hidden">책</span>
      <span className="scene-object__review">
        <strong className="scene-object__title">{record.title}</strong>
        <span className="scene-object__author">{record.authors.join(' · ')}</span>
        <span className="scene-object__rule" aria-hidden="true" />
        <span className="scene-object__verdict">{record.verdict ?? record.description}</span>
      </span>
    </>
  );
  if (decorative) {
    return <span className="scene-object scene-object--review" data-scene-echo={record.id} aria-hidden="true">{content}</span>;
  }
  return <a className="scene-object scene-object--review" data-scene-object={record.id} href={record.href}>{content}</a>;
}

export function HomePresentation({ release }: { release: CandidateRelease }) {
  const article = requireRecord(release, `articles/${ARTICLE_ID}`, 'articles');
  const review = requireRecord(release, `reviews/${REVIEW_ID}`, 'reviews');
  const judgment = requireAsset(release, `articles/${ARTICLE_ID}/judgment-scale`);
  const lead = requireAsset(release, `articles/${ARTICLE_ID}/reading-desk-cobalt`);
  const shared = requireAsset(release, `articles/${ARTICLE_ID}/shared-reading-table`);
  const titleBreak = article.title.match(/^(.+?,)\s+(.+)$/u);

  return (
    <PageFrame currentPath="/" pageClass="storyworld-page">
      <section className="public-scene" data-scene-id="judgment" data-scene-version="2026-08-22">
        <header className="scene-heading">
          <p className="visually-hidden">판단</p>
          <h1>{titleBreak ? <>{titleBreak[1]}<br />{titleBreak[2]}</> : article.title}</h1>
          <span>에세이 · 2026.08.16</span>
        </header>

        <div className="scene-stage" aria-label="판단 장면">
          <div className="scene-edge-echoes" aria-hidden="true">
            <MediaSceneObject asset={judgment} id="judgment-scale" href={ARTICLE_HREF} decorative />
            <ReviewSceneObject record={review} decorative />
          </div>
          <div className="scene-stage__objects">
            <MediaSceneObject asset={lead} id="reading-desk-cobalt" href={ARTICLE_HREF} eager showFolio />
            <MediaSceneObject asset={judgment} id="judgment-scale" href={ARTICLE_HREF} />
            <ReviewSceneObject record={review} />
            <a className="scene-object scene-object--article-excerpt" data-scene-object="reading-excerpt" href={ARTICLE_HREF}>
              <span className="visually-hidden">문장</span>
              <blockquote>요약은 결론을 주고, 독서는 그 결론까지 가는 시간을 준다.</blockquote>
            </a>
            <MediaSceneObject asset={shared} id="shared-reading-table" href={ARTICLE_HREF} />
          </div>
        </div>

        <nav className="scene-overview-actions" aria-label="중심 글 선택">
          <a data-scene-overview-read href={ARTICLE_HREF}>읽기<svg aria-hidden="true" viewBox="0 0 20 16"><path d="M2 8h15M12 3l5 5-5 5" /></svg></a>
          <a data-scene-enter-focus href="/?focus=reading-desk-cobalt">전체 보기<svg aria-hidden="true" viewBox="0 0 20 16"><path d="M2 8h15M12 3l5 5-5 5" /></svg></a>
        </nav>
        <aside className="scene-focus" hidden>
          <p />
          <h2 />
          <blockquote />
          <a href={ARTICLE_HREF}>읽기</a>
          <button type="button">전체 보기</button>
          <dl><div><dt>관계</dt><dd /></div><div><dt>출처</dt><dd /></div></dl>
        </aside>
        <p className="scene-swipe-cue">좌우로 스와이프</p>
      </section>
    </PageFrame>
  );
}

export default async function HomePage() {
  return <HomePresentation release={await loadVerifiedRelease()} />;
}
