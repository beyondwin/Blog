import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createServer, transformWithEsbuild, type Plugin, type ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const reviewRoutePath = join(repositoryRoot, 'apps/site/app/routes/review.tsx');
const rootModulePath = join(repositoryRoot, 'apps/site/app/root.tsx');

function clientEntryPlugin(): Plugin {
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
        if (request.url !== '/__task-6-review-client/') return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/@id/virtual:task-6-review-client-entry"></script></body></html>');
      });
    },
  };
}

function entrySource(): string {
  return `
    import { StrictMode } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ReviewPresentation } from ${JSON.stringify(reviewRoutePath)};
    import { ResponsivePicture } from ${JSON.stringify(rootModulePath)};

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
      sourceChecksum: 'sha256:${'0'.repeat(64)}',
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
          checksum: 'sha256:${'1'.repeat(64)}',
        }],
      }],
      fallback: {
        src: '/assets/content/reviews/black-swan/cover.jpg',
        format: 'jpg',
        checksum: 'sha256:${'2'.repeat(64)}',
        candidates: [{
          src: '/assets/content/reviews/black-swan/cover.jpg',
          width: 458,
          height: 671,
          checksum: 'sha256:${'2'.repeat(64)}',
        }],
      },
    };

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
    };

    window.__assetErrorCalls = 0;

    function App() {
      return <>
        <ReviewPresentation data={{ record, coverAsset, continuations: [] }} />
        <div id="callback-probe">
          <ResponsivePicture
            asset={coverAsset}
            alt="콜백 검증 표지"
            className="callback-probe__image"
            sizes="100px"
            onAssetError={() => { window.__assetErrorCalls += 1; }}
          />
        </div>
      </>;
    }

    createRoot(document.querySelector('#root')).render(<StrictMode><App /></StrictMode>);
  `;
}

describe('review cover client fallback', () => {
  it('moves the actual review presentation and callback probe to one stable error state', async () => {
    let browser: Browser | undefined;
    let server: ViteDevServer | undefined;
    try {
      server = await createServer({
        configFile: false,
        root: repositoryRoot,
        logLevel: 'silent',
        plugins: [clientEntryPlugin()],
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
      try {
        await page.locator('.site-shell').waitFor({ state: 'attached', timeout: 5_000 });
      } catch {
        throw new Error(`Review test entry did not mount:\n${browserErrors.join('\n')}`);
      }
      const expectCount = async (selector: string, count: number) => {
        await expect.poll(() => page.locator(selector).count()).toBe(count);
      };

      await expectCount('.site-header--inverse', 1);
      await expectCount('.review-detail--image-led', 1);
      await expectCount('.review-detail__cover-stage', 1);
      await expectCount('.review-detail [data-responsive-picture-state="error"]', 0);

      await page.locator('.callback-probe__image').evaluate((image) => {
        image.dispatchEvent(new Event('error'));
        image.dispatchEvent(new Event('error'));
      });
      await expectCount('#callback-probe [data-responsive-picture-state="error"]', 1);
      await expect.poll(() => page.evaluate(() => (window as typeof window & { __assetErrorCalls: number }).__assetErrorCalls)).toBe(1);

      await page.locator('.review-detail__cover-image').dispatchEvent('error');
      await expectCount('.site-header--inverse', 0);
      await expectCount('.review-detail--image-led', 0);
      await expectCount('.review-detail--text-led', 1);
      await expectCount('.review-detail__cover-stage', 0);
      await expectCount('.review-detail__cover-image', 0);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }, 20_000);
});
