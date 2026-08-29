import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Box = { height: number; width: number; x: number };
type ContentBox = Box & { bottom: number };

type Geometry = {
  detailIntro: Box;
  headerInner: Box;
  hero: Box;
  pick: Box;
  row: Box;
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

let browser: Browser;
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
        <header class="editorial-page-header"><div class="editorial-page-header__controls"></div></header>
        <ol class="article-index__ledger"><li><a class="editorial-list-row editorial-list-row--text-led" href="/"><span class="editorial-list-row__copy"><h2>Primary row</h2></span><span class="editorial-list-row__date">2026.08.29</span></a></li></ol>
      </section>
      <article class="article-detail">
        <div class="editorial-detail-frame editorial-detail-frame--text-led"><header class="editorial-detail-frame__hero"><div class="editorial-detail-frame__introduction"><h1>Primary detail</h1></div></header><div class="editorial-detail-frame__body"><div class="editorial-detail-frame__prose"><p>Primary reading body.</p></div></div></div>
      </article>
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
        headerInner: measuredBox('.site-header__inner'),
        hero: measuredBox('.form-home__hero'),
        pick: measuredBox('.form-home__pick'),
        row: measuredBox('.article-index .editorial-list-row'),
        detailIntro: measuredBox('.article-detail .editorial-detail-frame__introduction'),
      };
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

describe('editorial density geometry', () => {
  const rectanglesOverlap = (first: ContentBox, second: ContentBox) => {
    const horizontal = first.x < second.x + second.width && second.x < first.x + first.width;
    const vertical = first.bottom - first.height < second.bottom && second.bottom - second.height < first.bottom;
    return horizontal && vertical;
  };

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
    expect.soft(desktop.row.height).toBeGreaterThanOrEqual(180);
    expect.soft(desktop.row.height).toBeLessThanOrEqual(210);
    expect.soft(desktop.detailIntro.height).toBeGreaterThanOrEqual(400);
    expect.soft(desktop.detailIntro.height).toBeLessThanOrEqual(440);
  });

  it.each([768, 1179])('keeps the tablet header gutter between 32px and 48px at %ipx', async (width) => {
    const geometry = await geometryAt(width);

    expect(geometry.headerInner.x).toBeGreaterThanOrEqual(32);
    expect(geometry.headerInner.x).toBeLessThanOrEqual(48);
    expect(geometry.headerInner.width).toBe(width - (geometry.headerInner.x * 2));
    expect(geometry.headerInner.height).toBe(80);
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
        const target = document.querySelector('.mobile-navigation__button')!.getBoundingClientRect();
        const prose = getComputedStyle(document.querySelector('.article-detail .editorial-detail-frame__prose')!);
        return {
          measure: { x: measure.x, width: measure.width },
          headerHeight: header.height,
          target: { height: target.height, width: target.width },
          proseFontSize: prose.fontSize,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });

      expect(mobile.measure.x).toBe(22);
      expect(mobile.measure.width).toBe(346);
      expect(mobile.headerHeight).toBe(72);
      expect(mobile.target.height).toBeGreaterThanOrEqual(44);
      expect(mobile.target.width).toBeGreaterThanOrEqual(44);
      expect(mobile.proseFontSize).toBe('16px');
      expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewportWidth);
    } finally {
      await page.close();
    }
  });
});
