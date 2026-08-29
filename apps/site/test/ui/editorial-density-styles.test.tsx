import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readActiveRelease } from '@beyondwin/content/release';
import type { PublicRecord } from '@beyondwin/contracts';
import { ArticleReadingPage } from '../../src/ui/reading/ArticleReadingPage';

type Box = { height: number; width: number; x: number };
type ContentBox = Box & { bottom: number };

type Geometry = {
  detailIntro: Box;
  secondaryDetailIntro: Box;
  thoughtDetailIntro: Box;
  filterTarget: Box;
  headerInner: Box;
  hero: Box;
  pick: Box;
  row: Box;
  secondaryRow: Box;
  shell: { box: Box; radius: string; shadow: string };
};

type HomeGeometry = {
  documentWidth: number;
  fontReady: boolean;
  hero: Box;
  heroTitle: ContentBox;
  heroDescription: ContentBox;
  picks: Array<{
    box: ContentBox;
    copy: ContentBox;
    title: ContentBox;
    description: ContentBox;
    media: ContentBox | null;
    mediaPosition: string | null;
    descriptionClientHeight: number;
    descriptionScrollHeight: number;
    descriptionLineHeight: string;
    labelFontSize: string;
    descriptionFontSize: string;
  }>;
  viewportWidth: number;
};

type LedgerRowGeometry = {
  copy: ContentBox;
  date: ContentBox;
  description: ContentBox;
  row: ContentBox;
  title: ContentBox;
};

type MobileDetailGeometry = {
  actionsTop: number;
  introductionTop: number;
  mediaTop: number;
  proseFontSize: string;
  proseTop: number;
};

type FailedMediaGeometry = {
  article: {
    heroWidth: number;
    introductionWidth: number;
    mediaDisplay: string;
    mediaWidth: number;
  };
  homeHero: {
    copyWidth: number;
    heroWidth: number;
    mediaDisplay: string;
    mediaWidth: number;
  };
  homePick: {
    copyWidth: number;
    mediaDisplay: string;
    mediaWidth: number;
    pickWidth: number;
  };
  listRow: {
    copyX: number;
    dateRight: number;
    mediaDisplay: string;
    mediaWidth: number;
    rowRight: number;
    rowX: number;
  };
  review: {
    coverDisplay: string;
    coverHeight: number;
    heroHeight: number;
    introductionHeight: number;
  };
};

type MeasuredElement = ContentBox & {
  clientHeight: number;
  scrollHeight: number;
  top: number;
};

type ProductionArticleGeometry = {
  body: MeasuredElement;
  documentWidth: number;
  id: string;
  introduction: MeasuredElement;
  media: MeasuredElement;
  metadata: MeasuredElement;
  metadataFont: string;
  summary: MeasuredElement;
  title: MeasuredElement;
  uiFontReady: boolean;
  viewportWidth: number;
};

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

let browser: Browser;
let publishedArticleMarkup: Array<{ id: string; html: string }>;
let styles: string;

beforeAll(async () => {
  const stylesRoot = join(import.meta.dirname, '../../src/ui/styles');
  const fontsRoot = join(import.meta.dirname, '../../public/fonts');
  const [styleSources, displayFont, wordmarkFont, uiFont] = await Promise.all([
    Promise.all([
      'tokens.css',
      'shell.css',
      'editorial.css',
      'route-home.css',
      'route-index.css',
      'route-detail.css',
    ].map((file) => readFile(join(stylesRoot, file), 'utf8'))),
    readFile(join(fontsRoot, 'form-thought-display-ko.woff2')),
    readFile(join(fontsRoot, 'form-thought-wordmark.woff2')),
    readFile(join(fontsRoot, 'form-thought-ui-ko.woff2')),
  ]);
  styles = styleSources.join('\n')
    .replace('/fonts/form-thought-display-ko.woff2', `data:font/woff2;base64,${displayFont.toString('base64')}`)
    .replace('/fonts/form-thought-wordmark.woff2', `data:font/woff2;base64,${wordmarkFont.toString('base64')}`)
    .replace('/fonts/form-thought-ui-ko.woff2', `data:font/woff2;base64,${uiFont.toString('base64')}`);
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const active = await readActiveRelease(join(repositoryRoot, 'build/public-releases'));
  publishedArticleMarkup = Object.values(active.manifest.records)
    .filter((record): record is ArticleRecord => record.collection === 'articles')
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => ({
      id: record.id,
      html: renderToStaticMarkup(createElement(ArticleReadingPage, {
        record,
        continuations: [],
        media: createElement('img', { src: '/approved-article-media.webp', alt: '승인된 아티클 미디어' }),
      })),
    }));
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

const fixture = `
  <div class="site-shell">
    <header class="site-header">
      <div class="site-shell-width site-header__inner">
        <a class="site-brand" href="/">FORM &amp; THOUGHT</a>
        <div class="mobile-navigation">
          <button class="mobile-navigation__button touch-target" type="button"><span><i></i><i></i><i></i></span></button>
        </div>
      </div>
    </header>
    <main>
      <section class="form-home">
        <div class="form-home__hero"><div class="form-home__hero-copy"><h1>Graphify는 코드 이해를 정말 더 빠르게 만드는가?</h1><p>Graphify의 코드 지식 그래프 원리와 질의 방식, 통제 실험, 벤치마크 한계, 보안·운영 사각지대와 현실적인 도입법을 코드와 근거로 검토한다.</p><a href="/">이 글 읽기</a></div><figure class="form-home__hero-media"></figure></div>
        <ol class="form-home__picks">
          <li><a class="form-home__pick form-home__pick--text-led" href="/"><span class="form-home__pick-copy"><span class="form-home__pick-label">서평</span><strong>블랙스완</strong><span>우리는 현실을 보는가, 현실에 대해 만든 이야기를 보는가.</span><svg viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg></span></a></li>
          <li><a class="form-home__pick form-home__pick--text-led" href="/"><span class="form-home__pick-copy"><span class="form-home__pick-label">아티클</span><strong>AI 디자인 도구를 보는 기준</strong><span>AI 디자인 레퍼런스와 도구들을 단순 목록이 아니라 아이디어, 디자인 시스템, 모션, 레퍼런스 탐색의 작업 흐름으로 정리한다.</span><svg viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg></span></a></li>
          <li><a class="form-home__pick" href="/"><span class="form-home__pick-media"><picture><img width="1536" height="1024" alt="" /></picture></span><span class="form-home__pick-copy"><span class="form-home__pick-label">생각</span><strong>AI 시대에, 나는 왜 책을 읽는가</strong><span>지식에 도달하는 비용이 싸진 시대에, 더 많은 답을 모으기보다 답을 쉽게 믿지 않기 위해 책을 읽고 함께 읽는다.</span><svg viewBox="0 0 24 24"><path d="M4 12h15M14 6l6 6-6 6" /></svg></span></a></li>
        </ol>
      </section>
      <section class="article-index">
        <header class="editorial-page-header"><div class="editorial-page-header__heading"><h1>아티클</h1></div><div class="editorial-page-header__controls"><nav class="article-topic-filter"><a href="/articles/">전체</a></nav></div></header>
        <ol class="article-index__ledger"><li><a class="editorial-list-row editorial-list-row--text-led" href="/"><span class="editorial-list-row__copy"><h2>Primary row</h2></span><span class="editorial-list-row__date">2026.08.29</span></a></li></ol>
      </section>
      <section class="article-index density-index">
        <ol class="article-index__ledger">
          <li><a class="editorial-list-row" href="/articles/pgvector-hybrid-search/"><span class="editorial-list-row__media" data-media-fit="cover"><picture></picture></span><span class="editorial-list-row__copy"><h2>pgvector로 벡터 검색 이해하기: 임베딩, SQL, HNSW, RRF까지</h2><span>PostgreSQL과 pgvector로 의미 기반 검색을 만드는 과정을 임베딩 기초, 거리 연산자, JSONB/JOIN, HNSW/IVFFLAT, FTS와 RRF 하이브리드 검색까지 한 흐름으로 정리한다.</span></span><span class="editorial-list-row__date"><time>2026.08.26</time><svg viewBox="0 0 24 24"><path d="M5 12h13" /></svg></span></a></li>
          <li><a class="editorial-list-row editorial-list-row--review" href="/reviews/changing-their-minds/"><span class="editorial-list-row__media" data-media-fit="contain"><picture></picture></span><span class="editorial-list-row__copy"><h2>그들의 생각을 바꾸는 방법</h2><span>데이비드 맥레이니 — 생각을 바꾸는 대화는 논쟁의 승패가 아니라 상대가 자기 판단을 다시 살필 수 있는 질문에서 시작된다.</span></span><span class="editorial-list-row__date"><time>2026.05.27</time><svg viewBox="0 0 24 24"><path d="M5 12h13" /></svg></span></a></li>
        </ol>
      </section>
      <section class="secondary-index">
        <ol><li><a class="editorial-list-row editorial-list-row--text-led" href="/"><span class="editorial-list-row__copy"><h2>Secondary row</h2></span><span class="editorial-list-row__date">2026.08.29</span></a></li></ol>
      </section>
      <article class="article-detail">
        <div class="editorial-detail-frame editorial-detail-frame--text-led"><header class="editorial-detail-frame__hero"><div class="editorial-detail-frame__introduction"><h1>Primary detail</h1></div></header><div class="editorial-detail-frame__body"><div class="editorial-detail-frame__prose"><p>Primary reading body.</p></div></div></div>
      </article>
      <article class="secondary-detail">
        <div class="editorial-detail-frame editorial-detail-frame--text-led"><header class="editorial-detail-frame__hero"><div class="editorial-detail-frame__introduction"><h1>Secondary detail</h1></div></header><div class="editorial-detail-frame__body"><div class="editorial-detail-frame__prose"><p>Secondary reading body.</p></div></div></div>
      </article>
      <div class="thought-reading">
        <article class="editorial-detail-frame editorial-detail-frame--split"><header class="editorial-detail-frame__hero"><div class="editorial-detail-frame__introduction"><h1>Thought detail</h1><p>생각의 요약</p><div class="editorial-detail-frame__metadata">2026.08.29</div></div><figure class="editorial-detail-frame__media"></figure></header><div class="editorial-detail-frame__body"><div class="editorial-detail-frame__prose"><p>Thought reading body.</p></div></div></article>
      </div>
    </main>
  </div>`;

async function geometryAt(width: number, height = 900): Promise<Geometry> {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${fixture}</body></html>`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async () => { await document.fonts.ready; });
    return await page.evaluate(() => {
      const shell = getComputedStyle(document.querySelector('.site-shell')!);
      const measuredBox = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x, width: rect.width, height: rect.height };
      };
      return {
        shell: { box: measuredBox('.site-shell'), radius: shell.borderRadius, shadow: shell.boxShadow },
        filterTarget: measuredBox('.article-topic-filter a'),
        headerInner: measuredBox('.site-header__inner'),
        hero: measuredBox('.form-home__hero'),
        pick: measuredBox('.form-home__pick'),
        row: measuredBox('.article-index .editorial-list-row'),
        secondaryRow: measuredBox('.secondary-index .editorial-list-row'),
        detailIntro: measuredBox('.article-detail .editorial-detail-frame__introduction'),
        secondaryDetailIntro: measuredBox('.secondary-detail .editorial-detail-frame__introduction'),
        thoughtDetailIntro: measuredBox('.thought-reading .editorial-detail-frame__introduction'),
      };
    });
  } finally {
    await page.close();
  }
}

async function ledgerRowsAt(width: number): Promise<LedgerRowGeometry[]> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${fixture}</body></html>`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async () => { await document.fonts.ready; });
    return await page.evaluate(() => {
      const measuredBox = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, width: rect.width, height: rect.height, bottom: rect.bottom };
      };
      return [...document.querySelectorAll('.density-index .editorial-list-row')].map((row) => ({
        row: measuredBox(row),
        copy: measuredBox(row.querySelector('.editorial-list-row__copy')!),
        title: measuredBox(row.querySelector('h2')!),
        description: measuredBox(row.querySelector('.editorial-list-row__copy > span')!),
        date: measuredBox(row.querySelector('.editorial-list-row__date')!),
      }));
    });
  } finally {
    await page.close();
  }
}

async function homeGeometryAt(width: number, height = 900): Promise<HomeGeometry> {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${fixture}</body></html>`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async () => { await document.fonts.ready; });
    return await page.evaluate(() => {
      const measuredBox = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, width: rect.width, height: rect.height, bottom: rect.bottom };
      };
      return {
        documentWidth: document.documentElement.scrollWidth,
        fontReady: document.fonts.check('14px "FORM THOUGHT UI"', '한글'),
        hero: measuredBox(document.querySelector('.form-home__hero')!),
        heroTitle: measuredBox(document.querySelector('.form-home__hero-copy h1')!),
        heroDescription: measuredBox(document.querySelector('.form-home__hero-copy p')!),
        picks: [...document.querySelectorAll('.form-home__pick')].map((pick) => ({
          box: measuredBox(pick),
          copy: measuredBox(pick.querySelector('.form-home__pick-copy')!),
          title: measuredBox(pick.querySelector('strong')!),
          description: measuredBox(pick.querySelector('.form-home__pick-copy > span:not(.form-home__pick-label)')!),
          media: pick.querySelector('.form-home__pick-media') ? measuredBox(pick.querySelector('.form-home__pick-media')!) : null,
          mediaPosition: pick.querySelector('.form-home__pick-media') ? getComputedStyle(pick.querySelector('.form-home__pick-media')!).position : null,
          descriptionClientHeight: (pick.querySelector('.form-home__pick-copy > span:not(.form-home__pick-label)') as HTMLElement).clientHeight,
          descriptionScrollHeight: (pick.querySelector('.form-home__pick-copy > span:not(.form-home__pick-label)') as HTMLElement).scrollHeight,
          descriptionLineHeight: getComputedStyle(pick.querySelector('.form-home__pick-copy > span:not(.form-home__pick-label)')!).lineHeight,
          labelFontSize: getComputedStyle(pick.querySelector('.form-home__pick-label')!).fontSize,
          descriptionFontSize: getComputedStyle(pick.querySelector('.form-home__pick-copy > span:not(.form-home__pick-label)')!).fontSize,
        })),
        viewportWidth: document.documentElement.clientWidth,
      };
    });
  } finally {
    await page.close();
  }
}

async function mobileDetailGeometry(): Promise<MobileDetailGeometry> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>
      <article class="article-detail">
        <div class="editorial-detail-frame editorial-detail-frame--split">
          <header class="editorial-detail-frame__hero">
            <div class="editorial-detail-frame__introduction"><h1>Mobile detail</h1></div>
            <figure class="editorial-detail-frame__media"><img alt="승인된 이미지" /></figure>
          </header>
          <div class="editorial-detail-frame__body">
            <div class="editorial-detail-frame__actions">actions</div>
            <div class="editorial-detail-frame__prose">body</div>
          </div>
        </div>
      </article>
    </body></html>`, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      return {
        introductionTop: top('.editorial-detail-frame__introduction'),
        mediaTop: top('.editorial-detail-frame__media'),
        actionsTop: top('.editorial-detail-frame__actions'),
        proseTop: top('.editorial-detail-frame__prose'),
        proseFontSize: getComputedStyle(document.querySelector('.editorial-detail-frame__prose')!).fontSize,
      };
    });
  } finally {
    await page.close();
  }
}

async function failedMediaGeometry(width: number): Promise<FailedMediaGeometry> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>
      <section class="form-home">
        <div class="form-home__hero failed-home-hero">
          <div class="form-home__hero-copy"><h1>실패해도 남는 홈 제목</h1><p>이미지 칸 없이 읽히는 설명</p><a href="/">읽기</a></div>
          <figure class="form-home__hero-media"><span hidden data-responsive-picture-state="error"></span></figure>
        </div>
        <ol class="form-home__picks">
          <li>
            <a class="form-home__pick failed-home-pick" href="/thoughts/one/">
              <span class="form-home__pick-media"><span hidden data-responsive-picture-state="error"></span></span>
              <span class="form-home__pick-copy"><span class="form-home__pick-label">생각</span><strong>실패해도 남는 선택</strong><span>빈 색상 블록 없이 전체 폭을 쓰는 설명</span></span>
            </a>
          </li>
        </ol>
      </section>
      <a class="editorial-list-row failed-list-row" href="/articles/one/">
        <span class="editorial-list-row__media"><span hidden data-responsive-picture-state="error"></span></span>
        <span class="editorial-list-row__copy"><h2>실패해도 남는 목록 제목</h2><span>텍스트 설명</span></span>
        <span class="editorial-list-row__date">2026.08.29</span>
      </a>
      <article class="article-detail">
        <div class="editorial-detail-frame editorial-detail-frame--split failed-article-detail">
          <header class="editorial-detail-frame__hero">
            <div class="editorial-detail-frame__introduction"><h1>실패해도 남는 상세 제목</h1></div>
            <figure class="editorial-detail-frame__media"><span hidden data-responsive-picture-state="error"></span></figure>
          </header>
        </div>
      </article>
      <article class="review-detail review-detail--image-led failed-review-detail">
        <header class="review-detail__hero">
          <figure class="review-detail__cover-stage"><span hidden data-responsive-picture-state="error"></span></figure>
          <div class="review-detail__introduction"><h1>실패해도 남는 서평 제목</h1></div>
        </header>
      </article>
    </body></html>`, { waitUntil: 'domcontentloaded' });

    return await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const display = (selector: string) => getComputedStyle(document.querySelector(selector)!).display;
      const homeHero = box('.failed-home-hero');
      const homeHeroCopy = box('.failed-home-hero .form-home__hero-copy');
      const homeHeroMedia = box('.failed-home-hero .form-home__hero-media');
      const homePick = box('.failed-home-pick');
      const homePickCopy = box('.failed-home-pick .form-home__pick-copy');
      const homePickMedia = box('.failed-home-pick .form-home__pick-media');
      const listRow = box('.failed-list-row');
      const listCopy = box('.failed-list-row .editorial-list-row__copy');
      const listDate = box('.failed-list-row .editorial-list-row__date');
      const listMedia = box('.failed-list-row .editorial-list-row__media');
      const articleHero = box('.failed-article-detail .editorial-detail-frame__hero');
      const articleIntroduction = box('.failed-article-detail .editorial-detail-frame__introduction');
      const articleMedia = box('.failed-article-detail .editorial-detail-frame__media');
      const reviewHero = box('.failed-review-detail .review-detail__hero');
      const reviewIntroduction = box('.failed-review-detail .review-detail__introduction');
      const reviewCover = box('.failed-review-detail .review-detail__cover-stage');
      return {
        homeHero: {
          heroWidth: homeHero.width,
          copyWidth: homeHeroCopy.width,
          mediaDisplay: display('.failed-home-hero .form-home__hero-media'),
          mediaWidth: homeHeroMedia.width,
        },
        homePick: {
          pickWidth: homePick.width,
          copyWidth: homePickCopy.width,
          mediaDisplay: display('.failed-home-pick .form-home__pick-media'),
          mediaWidth: homePickMedia.width,
        },
        listRow: {
          rowX: listRow.x,
          rowRight: listRow.right,
          copyX: listCopy.x,
          dateRight: listDate.right,
          mediaDisplay: display('.failed-list-row .editorial-list-row__media'),
          mediaWidth: listMedia.width,
        },
        article: {
          heroWidth: articleHero.width,
          introductionWidth: articleIntroduction.width,
          mediaDisplay: display('.failed-article-detail .editorial-detail-frame__media'),
          mediaWidth: articleMedia.width,
        },
        review: {
          heroHeight: reviewHero.height,
          introductionHeight: reviewIntroduction.height,
          coverDisplay: display('.failed-review-detail .review-detail__cover-stage'),
          coverHeight: reviewCover.height,
        },
      };
    });
  } finally {
    await page.close();
  }
}

async function productionArticleGeometryAtDesktop(): Promise<ProductionArticleGeometry[]> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const results: ProductionArticleGeometry[] = [];
    for (const article of publishedArticleMarkup) {
      await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${article.html}</body></html>`, {
        waitUntil: 'domcontentloaded',
      });
      await page.evaluate(async () => { await document.fonts.ready; });
      results.push(await page.evaluate((id) => {
        const measured = (selector: string) => {
          const element = document.querySelector(selector) as HTMLElement;
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          };
        };
        return {
          id,
          introduction: measured('.editorial-detail-frame__introduction'),
          media: measured('.editorial-detail-frame__media'),
          title: measured('.editorial-detail-frame__introduction h1'),
          summary: measured('.editorial-detail-frame__introduction > p'),
          metadata: measured('.editorial-detail-frame__metadata'),
          body: measured('.editorial-detail-frame__body'),
          metadataFont: getComputedStyle(document.querySelector('.editorial-detail-frame__metadata')!).fontFamily,
          uiFontReady: document.fonts.check('14px "FORM THOUGHT UI"', '아티클'),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      }, article.id));
    }
    return results;
  } finally {
    await page.close();
  }
}

describe('editorial density geometry', () => {
  const rectanglesOverlap = (first: ContentBox, second: ContentBox) => {
    const horizontal = first.x < second.x + second.width && second.x < first.x + first.width;
    const vertical = first.bottom - first.height < second.bottom && second.bottom - second.height < first.bottom;
    return horizontal && vertical;
  };

  it.each([1440, 390])('collapses failed editorial media stages into their text-led geometry at %ipx', async (width) => {
    const failed = await failedMediaGeometry(width);

    expect(failed.homeHero.mediaDisplay).toBe('none');
    expect(failed.homeHero.mediaWidth).toBe(0);
    expect(failed.homeHero.copyWidth).toBe(failed.homeHero.heroWidth);
    expect(failed.homePick.mediaDisplay).toBe('none');
    expect(failed.homePick.mediaWidth).toBe(0);
    expect(failed.homePick.copyWidth).toBe(failed.homePick.pickWidth - 2);
    expect(failed.listRow.mediaDisplay).toBe('none');
    expect(failed.listRow.mediaWidth).toBe(0);
    expect(failed.listRow.copyX).toBe(failed.listRow.rowX);
    expect(failed.listRow.dateRight).toBe(failed.listRow.rowRight);
    expect(failed.article.mediaDisplay).toBe('none');
    expect(failed.article.mediaWidth).toBe(0);
    expect(failed.article.introductionWidth).toBe(failed.article.heroWidth);
    expect(failed.review.coverDisplay).toBe('none');
    expect(failed.review.coverHeight).toBe(0);
    expect(failed.review.introductionHeight).toBe(failed.review.heroHeight);
  });

  it.each([
    [1440, 500, 540, 200, 220],
    [1179, 500, 500, 200, 200],
    [768, 500, 500, 200, 200],
  ])('fits the fixed home copy inside the compact frame at %ipx', async (width, heroMin, heroMax, pickMin, pickMax) => {
    const home = await homeGeometryAt(width);

    expect(home.hero.height).toBeGreaterThanOrEqual(heroMin);
    expect(home.hero.height).toBeLessThanOrEqual(heroMax);
    expect(home.heroTitle.bottom).toBeLessThanOrEqual(home.hero.height);
    expect(home.heroDescription.bottom).toBeLessThanOrEqual(home.hero.height);
    for (const pick of home.picks) {
      expect(pick.box.height).toBeGreaterThanOrEqual(pickMin);
      expect(pick.box.height).toBeLessThanOrEqual(pickMax);
      expect(pick.title.bottom).toBeLessThanOrEqual(pick.box.bottom);
      expect(pick.description.bottom).toBeLessThanOrEqual(pick.box.bottom);
    }
    const thought = home.picks[2]!;
    expect(thought.media).not.toBeNull();
    expect(thought.media!.width).toBeGreaterThan(0);
    expect(thought.media!.height).toBeGreaterThan(0);
    if (width === 1440) expect(thought.media!.width / thought.media!.height).toBeGreaterThanOrEqual(.85);
    if (width <= 1179) {
      expect.soft(home.fontReady).toBe(true);
      for (const pick of home.picks) {
        const fontSize = Number.parseFloat(pick.descriptionFontSize);
        expect.soft(Number.parseFloat(pick.labelFontSize)).toBeGreaterThanOrEqual(14);
        expect.soft(fontSize).toBeGreaterThanOrEqual(14);
        expect.soft(Number.parseFloat(pick.descriptionLineHeight)).toBeGreaterThanOrEqual(fontSize * 1.5);
        expect.soft(pick.descriptionScrollHeight).toBeLessThanOrEqual(pick.descriptionClientHeight);
      }
    }
    if (width === 768) expect.soft(rectanglesOverlap(thought.title, thought.media!)).toBe(false);
  });

  it.each([390, 320])('keeps thought media in normal flow before copy at %ipx', async (width) => {
    const home = await homeGeometryAt(width);
    const thought = home.picks[2]!;

    expect.soft(home.fontReady).toBe(true);
    expect.soft(thought.mediaPosition).not.toBe('absolute');
    expect.soft(thought.media).not.toBeNull();
    expect.soft(thought.media!.bottom).toBeLessThanOrEqual(thought.copy.bottom - thought.copy.height);
    expect.soft(thought.media!.width / thought.media!.height).toBeGreaterThanOrEqual(1);
    expect.soft(thought.media!.width / thought.media!.height).toBeLessThanOrEqual(4 / 3);
    for (const pick of home.picks) {
      expect.soft(Number.parseFloat(pick.labelFontSize)).toBeGreaterThanOrEqual(14);
      expect.soft(Number.parseFloat(pick.descriptionFontSize)).toBeGreaterThanOrEqual(14);
    }
    expect.soft(home.documentWidth).toBeLessThanOrEqual(home.viewportWidth);
  });

  it('uses the full desktop canvas with compact editorial landmarks', async () => {
    const desktop = await geometryAt(1440);

    expect.soft(desktop.shell.box.x).toBe(0);
    expect.soft(desktop.shell.box.width).toBe(1440);
    expect.soft(desktop.shell.radius).toBe('0px');
    expect.soft(desktop.shell.shadow).toBe('none');
    expect.soft(desktop.headerInner.x).toBeGreaterThanOrEqual(56);
    expect.soft(desktop.headerInner.x).toBeLessThanOrEqual(64);
    expect.soft(desktop.headerInner.width).toBe(1440 - (desktop.headerInner.x * 2));
    expect.soft(desktop.headerInner.height).toBe(88);
    expect.soft(desktop.hero.height).toBeGreaterThanOrEqual(500);
    expect.soft(desktop.hero.height).toBeLessThanOrEqual(540);
    expect.soft(desktop.pick.height).toBeGreaterThanOrEqual(200);
    expect.soft(desktop.pick.height).toBeLessThanOrEqual(220);
    expect(desktop.filterTarget.height).toBeGreaterThanOrEqual(44);
    expect(desktop.filterTarget.width).toBeGreaterThanOrEqual(44);
    expect(desktop.row.height).toBeGreaterThanOrEqual(180);
    expect(desktop.row.height).toBeLessThanOrEqual(210);
    expect(desktop.secondaryRow.height).toBe(250);
    expect.soft(desktop.detailIntro.height).toBeGreaterThanOrEqual(400);
    expect.soft(desktop.detailIntro.height).toBeLessThanOrEqual(440);
    expect(desktop.secondaryDetailIntro.height).toBe(490);
    expect(desktop.thoughtDetailIntro.height).toBe(420);
  });

  it.each([768, 1179])('keeps the tablet header gutter between 32px and 48px at %ipx', async (width) => {
    const geometry = await geometryAt(width);

    expect(geometry.headerInner.x).toBeGreaterThanOrEqual(32);
    expect(geometry.headerInner.x).toBeLessThanOrEqual(48);
    expect(geometry.headerInner.width).toBe(width - (geometry.headerInner.x * 2));
    expect(geometry.headerInner.height).toBe(80);
  });

  it.each([900, 1179])('keeps production-length primary row content inside its owner at %ipx', async (width) => {
    const rows = await ledgerRowsAt(width);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      for (const content of [row.copy, row.title, row.description, row.date]) {
        expect(content.bottom - content.height).toBeGreaterThanOrEqual(row.row.bottom - row.row.height);
        expect(content.bottom).toBeLessThanOrEqual(row.row.bottom);
      }
    }
    expect(rows[0]!.row.bottom).toBeLessThanOrEqual(rows[1]!.row.bottom - rows[1]!.row.height);
  });

  it('keeps wide primary rows fixed at 196px without overflowing production-length content', async () => {
    const rows = await ledgerRowsAt(1440);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.row.height).toBe(196);
      for (const content of [row.copy, row.title, row.description, row.date]) {
        expect(content.bottom - content.height).toBeGreaterThanOrEqual(row.row.bottom - row.row.height);
        expect(content.bottom).toBeLessThanOrEqual(row.row.bottom);
      }
    }
    expect(rows[0]!.row.bottom).toBeLessThanOrEqual(rows[1]!.row.bottom - rows[1]!.row.height);
  });

  it('keeps the mobile reading measure, touch target, and document width intact', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${fixture}</body></html>`, {
        waitUntil: 'domcontentloaded',
      });
      const mobile = await page.evaluate(() => {
        const measure = document.querySelector('.site-shell-width')!.getBoundingClientRect();
        const header = document.querySelector('.site-header__inner')!.getBoundingClientRect();
        const indexHeading = document.querySelector('.article-index .editorial-page-header__heading')!.getBoundingClientRect();
        const target = document.querySelector('.mobile-navigation__button')!.getBoundingClientRect();
        const filterTarget = document.querySelector('.article-topic-filter a')!.getBoundingClientRect();
        const prose = getComputedStyle(document.querySelector('.article-detail .editorial-detail-frame__prose')!);
        return {
          measure: { x: measure.x, width: measure.width },
          headerHeight: header.height,
          indexHeading: { x: indexHeading.x, width: indexHeading.width },
          target: { height: target.height, width: target.width },
          filterTarget: { height: filterTarget.height, width: filterTarget.width },
          proseFontSize: prose.fontSize,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });

      expect(mobile.measure.x).toBe(22);
      expect(mobile.measure.width).toBe(346);
      expect(mobile.headerHeight).toBe(72);
      expect(mobile.indexHeading.x).toBe(22);
      expect(mobile.target.height).toBeGreaterThanOrEqual(44);
      expect(mobile.target.width).toBeGreaterThanOrEqual(44);
      expect(mobile.filterTarget.height).toBeGreaterThanOrEqual(44);
      expect(mobile.filterTarget.width).toBeGreaterThanOrEqual(44);
      expect(mobile.proseFontSize).toBe('16px');
      expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewportWidth);
    } finally {
      await page.close();
    }
  });

  it('keeps the primary detail mobile reading sequence and 16px body type', async () => {
    const mobile = await mobileDetailGeometry();

    expect(mobile.introductionTop).toBeLessThan(mobile.mediaTop);
    expect(mobile.mediaTop).toBeLessThan(mobile.actionsTop);
    expect(mobile.actionsTop).toBeLessThan(mobile.proseTop);
    expect(mobile.proseFontSize).toBe('16px');
  });

  it('fits every published article introduction in the desktop split target without clipping copy', async () => {
    const articles = await productionArticleGeometryAtDesktop();

    expect(articles).toHaveLength(17);
    expect(
      articles
        .filter((article) => article.introduction.height < 400 || article.introduction.height > 440)
        .map((article) => `${article.id}:${article.introduction.height}`),
      'published article introductions outside the 400–440px desktop target',
    ).toEqual([]);
    for (const article of articles) {
      expect(article.introduction.height, article.id).toBeGreaterThanOrEqual(400);
      expect(article.introduction.height, article.id).toBeLessThanOrEqual(440);
      expect(article.media.height, article.id).toBe(article.introduction.height);
      expect(article.body.top, article.id).toBeLessThan(900);
      expect(article.uiFontReady, article.id).toBe(true);
      expect(article.metadataFont, article.id).toContain('FORM THOUGHT UI');
      expect(article.documentWidth, article.id).toBeLessThanOrEqual(article.viewportWidth);
      expect(article.introduction.scrollHeight, article.id).toBe(article.introduction.clientHeight);
      for (const [name, child] of Object.entries({ title: article.title, summary: article.summary, metadata: article.metadata })) {
        expect(child.clientHeight, `${article.id}:${name}`).toBeLessThanOrEqual(Math.ceil(child.height));
        expect(child.bottom, `${article.id}:${name}`).toBeLessThanOrEqual(article.introduction.bottom);
        expect(child.bottom - child.height, `${article.id}:${name}`).toBeGreaterThanOrEqual(
          article.introduction.bottom - article.introduction.height,
        );
      }
    }
  });
});
