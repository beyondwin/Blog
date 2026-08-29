import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ReviewPresentation } from '../../app/routes/review';
import { BookIndexPage } from '../../src/ui/reviews/BookIndexPage';
import { ReadingThreshold } from '../../src/ui/reading/ReadingThreshold';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const coverAsset = {
  id: 'cover',
  collection: 'reviews',
  recordId: 'black-swan',
  kind: 'book-cover',
  alt: '블랙 스완 표지',
  credit: '출판유통통합전산망',
  provenanceUrl: 'https://example.test/black-swan-cover.jpg',
  verifiedAt: '2026-08-13',
  rightsNote: '서평의 판본 식별용 테스트 fixture.',
  width: 458,
  height: 671,
  sourceChecksum: `sha256:${'0'.repeat(64)}`,
  redistributionEvidence: {
    state: 'approved',
    decision: 'approve-public-redistribution',
  },
  sources: [{
    type: 'image/avif',
    candidates: [{
      src: '/assets/content/reviews/black-swan/cover-458w.avif',
      width: 458,
      height: 671,
      checksum: `sha256:${'1'.repeat(64)}`,
    }],
  }],
  fallback: {
    src: '/assets/content/reviews/black-swan/cover.jpg',
    format: 'jpg',
    checksum: `sha256:${'2'.repeat(64)}`,
    candidates: [{
      src: '/assets/content/reviews/black-swan/cover.jpg',
      width: 458,
      height: 671,
      checksum: `sha256:${'2'.repeat(64)}`,
    }],
  },
} as ReleaseAsset;

const reviewRecord = {
  collection: 'reviews',
  id: 'black-swan',
  href: '/reviews/black-swan/',
  title: '블랙 스완',
  description: '불확실성을 몸으로 읽는다.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-05-27T00:00:00.000Z',
  completedAt: '2026-05-27T00:00:00.000Z',
  tags: [],
  media: [],
  relationships: [],
  memoryLinks: [],
  bodyHtml: '<p>본문</p>',
  itemType: 'book',
  authors: ['나심 니콜라스 탈레브'],
  publisher: '동녘사이언스',
  verdict: '불확실성을 몸으로 읽는다.',
  coverState: 'verified',
  coverMedia: 'cover',
  readEditionVerified: true,
} satisfies ReviewRecord;

let browser: Browser;
let reviewCss: string;

beforeAll(async () => {
  const stylesRoot = join(import.meta.dirname, '../../src/ui/styles');
  reviewCss = (await Promise.all([
    readFile(join(stylesRoot, 'editorial.css'), 'utf8'),
    readFile(join(stylesRoot, 'route-index.css'), 'utf8'),
    readFile(join(stylesRoot, 'route-detail.css'), 'utf8'),
  ])).join('\n');
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

async function computedObjectFits(html: string, selector: string): Promise<string[]> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent(`<style>${reviewCss}</style>${html}`, { waitUntil: 'domcontentloaded' });
    return await page.locator(selector).evaluateAll((elements) => (
      elements.map((element) => getComputedStyle(element).objectFit)
    ));
  } finally {
    await page.close();
  }
}

describe('current review route cover styling', () => {
  it('preserves the full cover in the canonical review ledger', async () => {
    const html = renderToStaticMarkup(createElement(BookIndexPage, {
      records: [reviewRecord],
      assets: new Map([['reviews/black-swan/cover', coverAsset]]),
    }));

    await expect(computedObjectFits(html, '.review-index .editorial-list-row__media img'))
      .resolves.toEqual(['contain']);
  });

  it('preserves the full cover on the current review detail route', async () => {
    const html = renderToStaticMarkup(createElement(ReviewPresentation, {
      data: {
        record: reviewRecord,
        coverAsset,
        continuations: [],
      },
    }));

    expect(html).toContain('<a class="context-return" href="/reviews/">서평 목록으로</a>');
    expect(html.indexOf('review-detail__cover-stage')).toBeLessThan(
      html.indexOf('review-detail__identity'),
    );
    await expect(computedObjectFits(
      html,
      '.review-detail__cover-stage img',
    )).resolves.toEqual(['contain']);
  });

  it('keeps a forged cover asset without verified redistribution evidence text-led', async () => {
    const html = renderToStaticMarkup(createElement(ReviewPresentation, {
      data: {
        record: reviewRecord,
        coverAsset: { ...coverAsset, redistributionEvidence: undefined } as ReleaseAsset,
        continuations: [],
      },
    }));

    expect(html).toContain('판본 확인 · 표지 공개 권리 미확인');
    expect(html).toContain('review-detail--text-led');
    expect(html).not.toContain('review-detail__cover-stage');
    expect(html).not.toContain('/assets/content/reviews/black-swan/cover');
  });

  it('does not apply review containment to article landscape media', async () => {
    const html = renderToStaticMarkup(createElement(ReadingThreshold, {
      collection: 'articles',
      kindLabel: '글',
      title: '가로형 아티클 미디어',
      media: createElement('img', {
        className: 'reading-threshold__media-image reading-threshold__media-image--article',
        src: '/assets/content/articles/example/landscape.jpg',
        alt: '가로형 풍경',
      }),
    }));

    await expect(computedObjectFits(
      html,
      'img.reading-threshold__media-image--article',
    )).resolves.toEqual(['fill']);
  });
});
