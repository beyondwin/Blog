import { join, resolve } from 'node:path';
import { createElement, Fragment, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { createServer, transformWithEsbuild, type Plugin, type ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ResponsivePicture } from '../../app/root';
import { ReviewPresentation } from '../../app/routes/review';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const reviewRoutePath = join(repositoryRoot, 'apps/site/app/routes/review.tsx');
const rootModulePath = join(repositoryRoot, 'apps/site/app/root.tsx');
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

const record = {
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

function HydrationFixture() {
  return createElement(Fragment, null,
    createElement(ReviewPresentation, { data: { record, coverAsset, continuations: [] } }),
    createElement('div', { id: 'hydration-failure-probe' }, createElement(ResponsivePicture, {
      asset: coverAsset,
      alt: '수화 전 실패 표지',
      className: 'hydration-failure-probe__image',
      sizes: '100px',
      onAssetError: () => undefined,
    })),
    createElement('div', { id: 'cached-success-probe' }, createElement(ResponsivePicture, {
      asset: coverAsset,
      alt: '캐시 성공 표지',
      className: 'cached-success-probe__image',
      sizes: '100px',
      onAssetError: () => undefined,
    })),
  );
}

function clientEntryPlugin(serverMarkup: string): Plugin {
  const stubId = '\0review-release-server-stub';
  const entryId = '\0task-6-review-client-entry.tsx';
  return {
    name: 'task-6-review-client-entry',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.endsWith('/release.server') && importer?.includes('/app/routes/review.tsx')) return stubId;
      if (source === 'virtual:task-6-review-client-entry') return entryId;
      return null;
    },
    load(id) {
      if (id === stubId) {
        return [
          'export async function loadVerifiedRelease() { throw new Error("test-only loader stub"); }',
          'export function recordForRoute() { throw new Error("test-only loader stub"); }',
        ].join('\n');
      }
      if (id === entryId) return entrySource();
      return null;
    },
    async transform(code, id) {
      if (id !== entryId) return null;
      return transformWithEsbuild(code, 'task-6-review-client-entry.tsx', {
        loader: 'tsx',
        jsx: 'automatic',
      });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/__task-6-success.png') {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'image/png');
          response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
          return;
        }
        if (request.url !== '/__task-6-review-client/') return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head></head><body>
          <div id="hydrate-root">${serverMarkup}</div>
          <div id="mount-root"></div>
          <script>
            const markImage = (selector, naturalWidth, dispatchError) => {
              const image = document.querySelector(selector);
              Object.defineProperties(image, {
                complete: { configurable: true, value: true },
                naturalWidth: { configurable: true, value: naturalWidth },
              });
              if (dispatchError) image.dispatchEvent(new Event('error'));
            };
            window.__serverSnapshot = {
              inverseHeaders: document.querySelectorAll('.site-header--inverse').length,
              imageLedReviews: document.querySelectorAll('.review-detail--image-led').length,
              reviewCoverStages: document.querySelectorAll('.review-detail__cover-stage').length,
              reviewPreloads: document.querySelectorAll('link[rel="preload"][as="image"]').length,
              pictureSources: document.querySelectorAll('#hydrate-root picture source').length,
            };
            markImage('.review-detail__cover-image', 0, true);
            markImage('.hydration-failure-probe__image', 0, true);
            markImage('.cached-success-probe__image', 1, false);
          </script>
          <script type="module" src="/@id/virtual:task-6-review-client-entry"></script>
        </body></html>`);
      });
    },
  };
}

function entrySource(): string {
  return `
    import { StrictMode } from 'react';
    import { createRoot, hydrateRoot } from 'react-dom/client';
    import { ReviewPresentation } from ${JSON.stringify(reviewRoutePath)};
    import { ResponsivePicture } from ${JSON.stringify(rootModulePath)};

    const coverAsset = ${JSON.stringify(coverAsset)};
    const mountedAsset = {
      ...coverAsset,
      sources: [],
      fallback: {
        ...coverAsset.fallback,
        src: '/__task-6-success.png',
        candidates: [{
          ...coverAsset.fallback.candidates[0],
          src: '/__task-6-success.png',
        }],
      },
    };
    const record = ${JSON.stringify(record)};
    window.__hydrationAssetErrorCalls = 0;
    window.__cachedSuccessAssetErrorCalls = 0;
    window.__mountedAssetErrorCalls = 0;

    function HydrationApp() {
      return <>
        <ReviewPresentation data={{ record, coverAsset, continuations: [] }} />
        <div id="hydration-failure-probe">
          <ResponsivePicture
            asset={coverAsset}
            alt="수화 전 실패 표지"
            className="hydration-failure-probe__image"
            sizes="100px"
            onAssetError={() => { window.__hydrationAssetErrorCalls += 1; }}
          />
        </div>
        <div id="cached-success-probe">
          <ResponsivePicture
            asset={coverAsset}
            alt="캐시 성공 표지"
            className="cached-success-probe__image"
            sizes="100px"
            onAssetError={() => { window.__cachedSuccessAssetErrorCalls += 1; }}
          />
        </div>
      </>;
    }

    function MountedProbe() {
      return <ResponsivePicture
        asset={mountedAsset}
        alt="반복 오류 표지"
        className="mounted-probe__image"
        sizes="100px"
        onAssetError={() => { window.__mountedAssetErrorCalls += 1; }}
      />;
    }

    hydrateRoot(document.querySelector('#hydrate-root'), <StrictMode><HydrationApp /></StrictMode>);
    createRoot(document.querySelector('#mount-root')).render(<StrictMode><MountedProbe /></StrictMode>);
  `;
}

describe('review cover client fallback', () => {
  it('recovers failed SSR pictures during hydration while cached successes remain stable', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      const serverMarkup = renderToString(createElement(StrictMode, null, createElement(HydrationFixture)));
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        logLevel: 'silent',
        plugins: [clientEntryPlugin(serverMarkup)],
        define: {
          'import.meta.env.VITE_FORM_THOUGHT_SITE_ORIGIN': JSON.stringify('https://form-thought.local.invalid'),
        },
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind an ephemeral TCP port');

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route('**/assets/content/**', async (route) => {
        await route.fulfill({
          contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
        });
      });
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        void response.text().then((body) => browserErrors.push(`${response.status()} ${response.url()}\n${body}`));
      });
      await page.goto(`http://127.0.0.1:${address.port}/__task-6-review-client/`, { waitUntil: 'domcontentloaded' });
      const expectCount = async (selector: string, count: number) => {
        await expect.poll(() => page.locator(selector).count()).toBe(count);
      };

      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __serverSnapshot: Record<string, number>;
      }).__serverSnapshot)).toEqual({
        inverseHeaders: 1,
        imageLedReviews: 1,
        reviewCoverStages: 1,
        reviewPreloads: 1,
        pictureSources: 3,
      });
      try {
        await page.locator('.mounted-probe__image').waitFor({ state: 'attached', timeout: 5_000 });
      } catch {
        const state = await page.evaluate(() => ({
          mountHtml: document.querySelector('#mount-root')?.innerHTML,
          mountedCalls: (window as typeof window & { __mountedAssetErrorCalls?: number }).__mountedAssetErrorCalls,
        }));
        throw new Error(`Review test entry did not hydrate:\n${JSON.stringify(state)}\n${browserErrors.join('\n')}`);
      }

      await expectCount('#hydration-failure-probe [data-responsive-picture-state="error"]', 1);
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __hydrationAssetErrorCalls: number;
      }).__hydrationAssetErrorCalls)).toBe(1);

      await expectCount('#cached-success-probe picture', 1);
      await expectCount('#cached-success-probe source[type="image/avif"]', 1);
      await expectCount('.cached-success-probe__image', 1);
      await expectCount('#cached-success-probe [data-responsive-picture-state="error"]', 0);
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __cachedSuccessAssetErrorCalls: number;
      }).__cachedSuccessAssetErrorCalls)).toBe(0);

      await expectCount('.site-header--inverse', 0);
      await expectCount('.review-detail--image-led', 0);
      await expectCount('.review-detail--text-led', 1);
      await expectCount('.review-detail__cover-stage', 0);
      await expectCount('.review-detail__cover-image', 0);
      await expectCount('link[rel="preload"][as="image"]', 0);

      await page.locator('.mounted-probe__image').evaluate((image) => {
        image.dispatchEvent(new Event('error'));
        image.dispatchEvent(new Event('error'));
      });
      await expectCount('#mount-root [data-responsive-picture-state="error"]', 1);
      await expect.poll(() => page.evaluate(() => (window as typeof window & {
        __mountedAssetErrorCalls: number;
      }).__mountedAssetErrorCalls)).toBe(1);

      expect(browserErrors).toEqual([]);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);
});
