import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Box = { height: number; width: number; x: number };

type Geometry = {
  detailIntro: Box;
  headerInner: Box;
  hero: Box;
  pick: Box;
  row: Box;
  shell: { box: Box; radius: string; shadow: string };
};

let browser: Browser;
let styles: string;

beforeAll(async () => {
  const stylesRoot = join(import.meta.dirname, '../../src/ui/styles');
  styles = (await Promise.all([
    'tokens.css',
    'shell.css',
    'editorial.css',
    'route-home.css',
    'route-index.css',
    'route-detail.css',
  ].map((file) => readFile(join(stylesRoot, file), 'utf8')))).join('\n');
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
        <div class="form-home__hero"><div class="form-home__hero-copy">Editorial home</div><figure class="form-home__hero-media"></figure></div>
        <ol class="form-home__picks"><li><a class="form-home__pick form-home__pick--text-led" href="/"><span class="form-home__pick-copy">Pick</span></a></li></ol>
      </section>
      <section class="article-index">
        <header class="editorial-page-header"><div class="editorial-page-header__controls"></div></header>
        <ol class="article-index__ledger"><li><a class="editorial-list-row editorial-list-row--text-led" href="/"><span class="editorial-list-row__copy"><h2>Primary row</h2></span><span class="editorial-list-row__date">2026.08.29</span></a></li></ol>
      </section>
      <article class="article-detail">
        <div class="editorial-detail-frame editorial-detail-frame--text-led"><header class="editorial-detail-frame__hero"><div class="editorial-detail-frame__introduction"><h1>Primary detail</h1></div></header></div>
      </article>
    </main>
  </div>`;

async function geometryAt(width: number, height = 900): Promise<Geometry> {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${fixture}</body></html>`, {
      waitUntil: 'domcontentloaded',
    });
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

describe('editorial density geometry', () => {
  it('uses the full desktop canvas with compact editorial landmarks', async () => {
    const desktop = await geometryAt(1440);

    expect.soft(desktop.shell.box.x).toBe(0);
    expect.soft(desktop.shell.box.width).toBe(1440);
    expect.soft(desktop.shell.radius).toBe('0px');
    expect.soft(desktop.shell.shadow).toBe('none');
    expect.soft(desktop.headerInner.x).toBeGreaterThanOrEqual(56);
    expect.soft(desktop.headerInner.x).toBeLessThanOrEqual(64);
    expect.soft(desktop.headerInner.width).toBe(1440 - (desktop.headerInner.x * 2));
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
  });

  it('keeps the mobile reading measure, touch target, and document width intact', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${fixture}</body></html>`, {
        waitUntil: 'domcontentloaded',
      });
      const mobile = await page.evaluate(() => {
        const measure = document.querySelector('.site-shell-width')!.getBoundingClientRect();
        const target = document.querySelector('.mobile-navigation__button')!.getBoundingClientRect();
        return {
          measure: { x: measure.x, width: measure.width },
          target: { height: target.height, width: target.width },
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });

      expect(mobile.measure.x).toBe(22);
      expect(mobile.measure.width).toBe(346);
      expect(mobile.target.height).toBeGreaterThanOrEqual(44);
      expect(mobile.target.width).toBeGreaterThanOrEqual(44);
      expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewportWidth);
    } finally {
      await page.close();
    }
  });
});
