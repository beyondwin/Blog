import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ResponsivePicture } from '../../../app/root';

type HomeRecord<C extends PublicRecord['collection']> = Pick<
  Extract<PublicRecord, { collection: C }>,
  'collection' | 'description' | 'href' | 'id' | 'title'
>;
type ArticleRecord = HomeRecord<'articles'>;
type ReviewRecord = HomeRecord<'reviews'> & Pick<Extract<PublicRecord, { collection: 'reviews' }>, 'verdict'>;
type ThoughtRecord = HomeRecord<'thoughts'>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

export const HOME_SELECTIONS = {
  hero: { collection: 'articles', id: 'graphify-code-knowledge-graph-deep-dive', mediaId: 'editorial-home-hero' },
  review: { collection: 'reviews', id: 'black-swan' },
  article: { collection: 'articles', id: 'ai-design-references' },
  thought: { collection: 'thoughts', id: 'why-i-read-in-the-ai-era', mediaId: 'editorial-reading' },
} as const;

export interface HomePageData {
  hero: ArticleRecord;
  picks: {
    review: ReviewRecord;
    article: ArticleRecord;
    thought: ThoughtRecord;
  };
  assets: {
    hero: ReleaseAsset;
    thought: ReleaseAsset;
  };
}

function HomePick({
  asset,
  description,
  href,
  label,
  title,
}: {
  asset?: ReleaseAsset;
  description: string;
  href: string;
  label: '서평' | '아티클' | '생각';
  title: string;
}) {
  return (
    <li>
      <a className={`form-home__pick${asset ? '' : ' form-home__pick--text-led'}`} href={href}>
        {asset ? (
          <span className="form-home__pick-media">
            <ResponsivePicture
              asset={asset}
              alt={asset.alt}
              sizes="(max-width: 767px) 100vw, (max-width: 1179px) 30vw, 360px"
            />
          </span>
        ) : null}
        <span className="form-home__pick-copy">
          <span className="form-home__pick-label">{label}</span>
          <strong>{title}</strong>
          <span>{description}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg>
        </span>
      </a>
    </li>
  );
}

export function HomePage({ assets, hero, picks }: HomePageData) {
  return (
    <section className="form-home">
      <div className="form-home__hero">
        <div className="form-home__hero-copy">
          <h1>{hero.title}</h1>
          <p>{hero.description}</p>
          <a href={hero.href}>이 글 읽기 <span aria-hidden="true">→</span></a>
        </div>
        <figure className="form-home__hero-media">
          <ResponsivePicture
            asset={assets.hero}
            alt={assets.hero.alt}
            className="form-home__hero-image"
            eager
            sizes="(max-width: 767px) 100vw, (max-width: 1179px) 54vw, 710px"
          />
        </figure>
      </div>
      <ol className="form-home__picks" aria-label="편집 선택">
        <HomePick
          label="서평"
          href={picks.review.href}
          title={picks.review.title}
          description={picks.review.verdict ?? picks.review.description}
        />
        <HomePick
          label="아티클"
          href={picks.article.href}
          title={picks.article.title}
          description={picks.article.description}
        />
        <HomePick
          label="생각"
          href={picks.thought.href}
          title={picks.thought.title}
          description={picks.thought.description}
          asset={assets.thought}
        />
      </ol>
    </section>
  );
}
