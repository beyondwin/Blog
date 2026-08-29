import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { waitForFirstFrameImages } from './support';

const OUTPUT_ROOT = path.resolve('output/playwright/form-and-thought-reference-comparison');
const ACTUAL_DIR = path.join(OUTPUT_ROOT, 'actual');
const ANNOTATED_DIR = path.join(OUTPUT_ROOT, 'annotated');
const COMPARISON_DIR = path.join(OUTPUT_ROOT, 'comparisons');
const MEASUREMENT_DIR = path.join(OUTPUT_ROOT, 'measurements');

type Rect = { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number };
type Viewport = { id: string; width: number; height: number; zoomEquivalent?: string };
type Reference = {
  file: string;
  bitmap: { width: number; height: number };
  crop: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
};
type Surface = {
  id: 'home' | 'articles' | 'article-detail';
  path: string;
  approvedSnapshot: string;
  reference: Reference;
  blocks: Record<string, string>;
  styles: Record<string, string>;
};

const SURFACES: readonly Surface[] = [
  {
    id: 'home',
    path: '/',
    approvedSnapshot: 'home-calibrated-1440x1080.png',
    reference: {
      file: 'docs/notes/project/assets/form-and-thought-reference/reference-05-home.png',
      bitmap: { width: 1448, height: 1086 },
      crop: { x: 75, y: 45, width: 1298, height: 996 },
      viewport: { width: 1440, height: 1080 },
    },
    blocks: {
      shell: '.site-shell',
      header: '.site-header__inner',
      hero: '.form-home__hero',
      heroCopy: '.form-home__hero-copy',
      heroMedia: '.form-home__hero-media',
      picks: '.form-home__picks',
      firstPick: '.form-home__picks > li:first-child .form-home__pick',
    },
    styles: {
      wordmark: '.site-brand',
      title: '.form-home__hero-copy h1',
      body: '.form-home__hero-copy p',
      callToAction: '.form-home__hero-copy > a',
      heroImage: '.form-home__hero-image',
    },
  },
  {
    id: 'articles',
    path: '/articles/',
    approvedSnapshot: 'articles-calibrated-1080x1440.png',
    reference: {
      file: 'docs/notes/project/assets/form-and-thought-reference/reference-04-article-index.png',
      bitmap: { width: 1086, height: 1448 },
      crop: { x: 47, y: 39, width: 992, height: 1367 },
      viewport: { width: 1080, height: 1440 },
    },
    blocks: {
      shell: '.site-shell',
      header: '.site-header__inner',
      pageHeading: '.editorial-page-header__heading',
      filters: '.editorial-page-header__controls',
      ledger: '.article-index__ledger',
      firstRow: '.article-index__ledger > li:first-child .editorial-list-row',
      firstMedia: '.article-index__ledger > li:first-child .editorial-list-row__media',
      firstCopy: '.article-index__ledger > li:first-child .editorial-list-row__copy',
      firstDate: '.article-index__ledger > li:first-child .editorial-list-row__date',
      secondRow: '.article-index__ledger > li:nth-child(2) .editorial-list-row',
    },
    styles: {
      wordmark: '.site-brand',
      title: '.editorial-page-header h1',
      description: '.editorial-page-header p',
      firstRowTitle: '.article-index__ledger > li:first-child h2',
      firstRowBody: '.article-index__ledger > li:first-child .editorial-list-row__copy > span',
    },
  },
  {
    id: 'article-detail',
    path: '/articles/graphify-code-knowledge-graph-deep-dive/',
    approvedSnapshot: 'article-detail-calibrated-1120x1400.png',
    reference: {
      file: 'docs/notes/project/assets/form-and-thought-reference/reference-03-detail.png',
      bitmap: { width: 1122, height: 1402 },
      crop: { x: 29, y: 28, width: 1062, height: 1342 },
      viewport: { width: 1120, height: 1400 },
    },
    blocks: {
      shell: '.site-shell',
      header: '.site-header__inner',
      hero: '.editorial-detail-frame__hero',
      introduction: '.editorial-detail-frame__introduction',
      heroMedia: '.editorial-detail-frame__media',
      body: '.editorial-detail-frame__body',
      actions: '.editorial-detail-frame__actions',
      prose: '.editorial-detail-frame__prose',
    },
    styles: {
      wordmark: '.site-brand',
      title: '.editorial-detail-frame__introduction h1',
      summary: '.editorial-detail-frame__introduction > p',
      metadata: '.editorial-detail-frame__metadata',
      prose: '.editorial-detail-frame__prose',
      heroImage: '.article-detail__hero-image',
    },
  },
] as const;

const RESPONSIVE_VIEWPORTS: readonly Viewport[] = [
  { id: 'wide-1440x900', width: 1440, height: 900 },
  { id: 'intermediate-768x900', width: 768, height: 900 },
  { id: 'mobile-390x844', width: 390, height: 844 },
  {
    id: 'zoom-200-320x844',
    width: 320,
    height: 844,
    zoomEquivalent: '320 CSS px reflow proxy for a 640 CSS px viewport at 200% zoom',
  },
] as const;

const OVERLAY_COLORS = ['#00A4CC', '#FFB000', '#E43D30', '#6C5CE7', '#008F5A', '#D14D9A', '#855C2D', '#2C3E50'];
const ROW_EDGE_TOLERANCE = 0.5;

async function ready(page: Page, surface: Surface, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(surface.path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  expect(await waitForFirstFrameImages(page)).toEqual([]);
}

async function measure(page: Page, surface: Surface, viewport: Viewport | Reference['viewport']) {
  return page.evaluate(({ blocks, styles, viewportMeta }) => {
    const rect = (selector: string): Rect | null => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
      };
    };
    const computed = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
      };
    };
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      return {
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        overflowY: style.overflowY,
      };
    };
    return {
      url: location.href,
      title: document.title,
      viewport: viewportMeta,
      devicePixelRatio: window.devicePixelRatio,
      scroll: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      },
      rectangles: Object.fromEntries(Object.entries(blocks).map(([name, selector]) => [name, rect(selector)])),
      boxMetrics: Object.fromEntries(Object.entries(blocks).map(([name, selector]) => [name, box(selector)])),
      computedStyles: Object.fromEntries(Object.entries(styles).map(([name, selector]) => [name, computed(selector)])),
    };
  }, { blocks: surface.blocks, styles: surface.styles, viewportMeta: viewport });
}

async function annotatedScreenshot(page: Page, surface: Surface, outputPath: string) {
  await page.evaluate(({ blocks, colors }) => {
    const layer = document.createElement('div');
    layer.id = 'form-thought-geometry-overlay';
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
    Object.entries(blocks).forEach(([name, selector], index) => {
      const node = document.querySelector(selector);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const box = document.createElement('div');
      const color = colors[index % colors.length];
      Object.assign(box.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
        height: `${rect.height}px`, border: `2px solid ${color}`, boxSizing: 'border-box',
      });
      const label = document.createElement('span');
      label.textContent = name;
      Object.assign(label.style, {
        position: 'absolute', left: '0', top: '0', padding: '2px 5px', background: color,
        color: '#fff', font: '11px/1.3 ui-monospace, monospace', whiteSpace: 'nowrap',
      });
      box.append(label);
      layer.append(box);
    });
    document.body.append(layer);
  }, { blocks: surface.blocks, colors: OVERLAY_COLORS });
  await page.screenshot({ path: outputPath, fullPage: false });
  await page.evaluate(() => document.querySelector('#form-thought-geometry-overlay')?.remove());
}

function imageDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function comparisonSheet(
  page: Page,
  surface: Surface,
  annotatedPath: string,
  metrics: Awaited<ReturnType<typeof measure>>,
) {
  const referenceBuffer = await readFile(path.resolve(surface.reference.file));
  const actualBuffer = await readFile(annotatedPath);
  const shell = metrics.rectangles.shell;
  if (!shell) throw new Error(`${surface.id} shell rectangle is missing`);
  const actualCropHeight = Math.min(
    surface.reference.viewport.height - shell.y,
    shell.width * (surface.reference.crop.height / surface.reference.crop.width),
  );
  const actualCrop = { x: shell.x, y: shell.y, width: shell.width, height: actualCropHeight };
  const summary = {
    referenceId: path.basename(surface.reference.file, path.extname(surface.reference.file)),
    comparisonViewportCss: surface.reference.viewport,
    referencePageShellCropPx: surface.reference.crop,
    actualPageShellCropCssPx: actualCrop,
    overflowCssPx: metrics.scroll.horizontalOverflow,
    rectangles: metrics.rectangles,
    computedStyles: metrics.computedStyles,
  };
  const reference = surface.reference;
  const refData = imageDataUrl(referenceBuffer, 'image/png');
  const actualData = imageDataUrl(actualBuffer, 'image/png');
  const panelWidth = 720;
  const refScale = panelWidth / reference.crop.width;
  const actualScale = panelWidth / actualCrop.width;
  const escapedSummary = JSON.stringify(summary, null, 2)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  await page.setViewportSize({ width: 1540, height: 1000 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin: 0; padding: 32px; background: #191715; color: #f7f3ed; font: 14px/1.5 ui-monospace, monospace; }
    h1 { margin: 0 0 24px; font: 28px/1.2 Georgia, serif; } .grid { display: grid; grid-template-columns: repeat(2, ${panelWidth}px); gap: 28px; align-items: start; }
    h2 { margin: 0 0 10px; font-size: 15px; } .crop { position: relative; width: ${panelWidth}px; overflow: hidden; background: #e8e1d8; outline: 1px solid #80766d; }
    .ref { height: ${reference.crop.height * refScale}px; } .ref img { position: absolute; width: ${reference.bitmap.width * refScale}px; height: ${reference.bitmap.height * refScale}px; left: ${-reference.crop.x * refScale}px; top: ${-reference.crop.y * refScale}px; max-width: none; }
    .actual { height: ${actualCrop.height * actualScale}px; } .actual img { position: absolute; width: ${reference.viewport.width * actualScale}px; height: ${reference.viewport.height * actualScale}px; left: ${-actualCrop.x * actualScale}px; top: ${-actualCrop.y * actualScale}px; max-width: none; }
    pre { margin: 28px 0 0; padding: 20px; overflow: visible; border: 1px solid #514a44; background: #221f1c; color: #f7f3ed; white-space: pre-wrap; font-size: 12px; }
  </style></head><body><h1>${surface.id} · calibrated reference comparison</h1><div class="grid">
    <section><h2>canonical reference region</h2><div class="crop ref"><img src="${refData}" alt=""></div></section>
    <section><h2>actual release · annotated rectangles</h2><div class="crop actual"><img src="${actualData}" alt=""></div></section>
  </div><pre>${escapedSummary}</pre></body></html>`);
  await page.screenshot({ path: path.join(COMPARISON_DIR, `${surface.id}-calibrated-side-by-side.png`), fullPage: true });
}

function assertSharedGeometry(metrics: Awaited<ReturnType<typeof measure>>, viewportWidth: number) {
  const shell = metrics.rectangles.shell;
  const header = metrics.rectangles.header;
  expect(shell).not.toBeNull();
  expect(header).not.toBeNull();
  expect(metrics.scroll.horizontalOverflow).toBe(0);
  expect(shell!.width).toBeLessThanOrEqual(1280.5);
  if (viewportWidth >= 768) {
    expect(Math.abs(shell!.left - (viewportWidth - shell!.width) / 2)).toBeLessThanOrEqual(1);
    expect(header!.height).toBeGreaterThanOrEqual(viewportWidth >= 1180 ? 96 : 84);
    expect(header!.height).toBeLessThanOrEqual(viewportWidth >= 1180 ? 112 : 96);
  } else {
    expect(shell!.left).toBe(0);
    expect(shell!.width).toBe(viewportWidth);
    expect(header!.height).toBeGreaterThanOrEqual(68);
    expect(header!.height).toBeLessThanOrEqual(76);
  }
}

function assertSurfaceGeometry(surface: Surface, metrics: Awaited<ReturnType<typeof measure>>, viewportWidth: number) {
  assertSharedGeometry(metrics, viewportWidth);
  const rectangles = metrics.rectangles;
  if (surface.id === 'home') {
    expect(rectangles.hero).not.toBeNull();
    expect(rectangles.heroCopy).not.toBeNull();
    expect(rectangles.heroMedia).not.toBeNull();
    if (viewportWidth >= 768) {
      const copyRatio = rectangles.heroCopy!.width / rectangles.hero!.width;
      expect(copyRatio).toBeGreaterThanOrEqual(.43);
      expect(copyRatio).toBeLessThanOrEqual(.48);
      expect(rectangles.heroMedia!.width / rectangles.hero!.width).toBeGreaterThanOrEqual(.52);
    } else {
      expect(rectangles.heroCopy!.top).toBeLessThan(rectangles.heroMedia!.top);
      expect(rectangles.heroMedia!.top).toBeLessThan(rectangles.picks!.top);
    }
  }
  if (surface.id === 'articles') {
    expect(rectangles.firstRow).not.toBeNull();
    expect(rectangles.firstMedia).not.toBeNull();
    expect(rectangles.firstCopy).not.toBeNull();
    expect(rectangles.firstDate).not.toBeNull();
    expect(rectangles.secondRow).not.toBeNull();
    const rowBoundary = Math.min(rectangles.firstRow!.bottom, rectangles.secondRow!.top);
    for (const childName of ['firstMedia', 'firstCopy', 'firstDate'] as const) {
      expect(
        rectangles[childName]!.bottom,
        `${surface.id} ${childName} must not cross the first-row rule`,
      ).toBeLessThanOrEqual(rowBoundary + ROW_EDGE_TOLERANCE);
    }
    for (const childName of ['firstCopy', 'firstDate'] as const) {
      const box = metrics.boxMetrics[childName];
      expect(box).not.toBeNull();
      expect(
        box!.scrollHeight,
        `${surface.id} ${childName} must contain its meaningful text without clipping`,
      ).toBeLessThanOrEqual(box!.clientHeight + ROW_EDGE_TOLERANCE);
    }
    if (viewportWidth >= 900) {
      expect(rectangles.firstRow!.height).toBeGreaterThanOrEqual(210);
      expect(rectangles.firstRow!.height).toBeLessThanOrEqual(250);
      expect(rectangles.firstMedia!.left).toBeLessThan(rectangles.firstCopy!.left);
      expect(rectangles.firstCopy!.left).toBeLessThan(rectangles.firstDate!.left);
    } else if (viewportWidth >= 768) {
      expect(rectangles.firstRow!.height).toBeGreaterThanOrEqual(210);
      expect(rectangles.firstMedia!.left).toBeLessThan(rectangles.firstCopy!.left);
      expect(Math.abs(rectangles.firstCopy!.left - rectangles.firstDate!.left)).toBeLessThanOrEqual(1);
      expect(rectangles.firstCopy!.bottom).toBeLessThanOrEqual(rectangles.firstDate!.top + 1);
    } else {
      expect(rectangles.firstMedia!.top).toBeLessThan(rectangles.firstCopy!.top);
      expect(rectangles.firstCopy!.top).toBeLessThan(rectangles.firstDate!.top);
    }
  }
  if (surface.id === 'article-detail') {
    expect(rectangles.hero).not.toBeNull();
    expect(rectangles.introduction).not.toBeNull();
    expect(rectangles.heroMedia).not.toBeNull();
    if (viewportWidth >= 768) {
      const introRatio = rectangles.introduction!.width / rectangles.hero!.width;
      expect(introRatio).toBeGreaterThanOrEqual(.58);
      expect(introRatio).toBeLessThanOrEqual(.64);
      expect(rectangles.introduction!.left).toBeLessThan(rectangles.heroMedia!.left);
    } else {
      expect(rectangles.introduction!.top).toBeLessThan(rectangles.heroMedia!.top);
      expect(rectangles.heroMedia!.top).toBeLessThan(rectangles.actions!.top);
      expect(rectangles.actions!.top).toBeLessThan(rectangles.prose!.top);
    }
  }
}

test.describe.serial('FORM & THOUGHT representative visual evidence', () => {
  test.beforeAll(async () => {
    await Promise.all([ACTUAL_DIR, ANNOTATED_DIR, COMPARISON_DIR, MEASUREMENT_DIR].map((directory) => (
      mkdir(directory, { recursive: true })
    )));
  });

  test('captures calibrated canonical comparisons with rectangles and computed styles', async ({ page }) => {
    for (const surface of SURFACES) {
      const viewport = { id: `calibrated-${surface.reference.viewport.width}x${surface.reference.viewport.height}`, ...surface.reference.viewport };
      await ready(page, surface, surface.reference.viewport);
      const metrics = await measure(page, surface, viewport);
      const actualPath = path.join(ACTUAL_DIR, `${surface.id}-${viewport.id}.png`);
      const annotatedPath = path.join(ANNOTATED_DIR, `${surface.id}-${viewport.id}.png`);
      await page.screenshot({ path: actualPath, fullPage: false });
      await expect(page).toHaveScreenshot(surface.approvedSnapshot, { fullPage: false });
      await annotatedScreenshot(page, surface, annotatedPath);
      await writeFile(path.join(MEASUREMENT_DIR, `${surface.id}-${viewport.id}.json`), `${JSON.stringify(metrics, null, 2)}\n`);
      assertSurfaceGeometry(surface, metrics, viewport.width);
      await comparisonSheet(page, surface, annotatedPath, metrics);
    }
  });

  test('captures the wide, intermediate, mobile, and 200% reflow matrix without overflow', async ({ page }) => {
    for (const surface of SURFACES) {
      for (const viewport of RESPONSIVE_VIEWPORTS) {
        await ready(page, surface, viewport);
        const metrics = await measure(page, surface, viewport);
        await page.screenshot({ path: path.join(ACTUAL_DIR, `${surface.id}-${viewport.id}.png`), fullPage: false });
        await writeFile(path.join(MEASUREMENT_DIR, `${surface.id}-${viewport.id}.json`), `${JSON.stringify(metrics, null, 2)}\n`);
        assertSurfaceGeometry(surface, metrics, viewport.width);
      }
    }
  });
});
