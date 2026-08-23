import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildStableRouteContract,
  hashOutputArtifact,
} from '../src/capture-renderer';
import {
  median,
  medianAbsoluteDeviation,
  measureBrowserPage,
} from '../src/measure-browser';
import { startStaticServer, type StaticServer } from '../src/serve-static';

const temporaryRoots: string[] = [];
const servers: StaticServer[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'beyondwin-renderer-harness-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('renderer capture harness', () => {
  it('normalizes only generated IDs and asset hashes while retaining semantic evidence', () => {
    const html = `<!doctype html>
      <html><head>
        <title>Semantic title</title>
        <link rel="canonical" href="/articles/example/">
        <meta name="description" content="Semantic description">
        <meta property="og:title" content="Semantic title">
      </head><body data-debug="/Users/user/private/source.md">
        <h1 id=":R1:">Semantic heading</h1>
        <a href="/articles/example/">Read</a>
        <a href="https://example.com/provenance">Source</a>
        <img src="/_astro/cover.Ab12Cd34.webp" width="1200" height="800" alt="Cover">
      </body></html>`;

    const captured = buildStableRouteContract('/articles/example/', html);

    expect(captured.contract).toMatchObject({
      canonical: '/articles/example/',
      title: 'Semantic title',
      description: 'Semantic description',
      openGraph: { 'og:title': 'Semantic title' },
      headings: [{ level: 1, text: 'Semantic heading', id: '__framework_id__' }],
      internalHrefs: ['/articles/example/'],
      externalHrefs: ['https://example.com/provenance'],
      imageAttributes: [{
        alt: 'Cover',
        height: '800',
        src: '/_astro/cover.__asset_hash__.webp',
        width: '1200',
      }],
    });
    expect(captured.privateBoundaryHits).toEqual(['/Users/user/private/source.md']);
  });

  it('hashes the complete output artifact deterministically and notices semantic changes', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'index.html'), '<a href="/articles/">Articles</a>');
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets/app.js'), 'console.log("safe")');

    const first = await hashOutputArtifact(root);
    const second = await hashOutputArtifact(root);
    await writeFile(join(root, 'index.html'), '<a href="/reviews/">Reviews</a>');

    expect(second).toBe(first);
    expect(await hashOutputArtifact(root)).not.toBe(first);
  });

  it('serves directory routes and gzip-compressed JavaScript on an atomically allocated port', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'articles'));
    await writeFile(join(root, 'articles/index.html'), '<h1>Articles</h1>');
    await writeFile(join(root, 'app.js'), 'console.log("compressed")');
    const server = await startStaticServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);

    const routeResponse = await fetch(`${server.baseUrl}/articles/`);
    const scriptResponse = await fetch(`${server.baseUrl}/app.js`, {
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(server.port).toBeGreaterThan(0);
    expect(routeResponse.status).toBe(200);
    expect(await routeResponse.text()).toContain('<h1>Articles</h1>');
    expect(scriptResponse.headers.get('content-encoding')).toBe('gzip');
    expect(await scriptResponse.text()).toContain('compressed');
  });

  it('derives literal medians and median absolute deviation', () => {
    expect(median([1, 4, 7, 10, 13])).toBe(7);
    expect(medianAbsoluteDeviation([1, 4, 7, 10, 13])).toBe(3);
  });

  it('measures a real production page in a fresh Chromium context', async () => {
    const root = await createRoot();
    const firstScript = 'globalThis.firstLoaded = true;';
    const secondScript = 'globalThis.secondLoaded = true;';
    const firstImage = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="red" d="M0 0h2v2H0z"/></svg>';
    const secondImage = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="3"><path fill="blue" d="M0 0h3v3H0z"/></svg>';
    await writeFile(join(root, 'first.js'), firstScript);
    await writeFile(join(root, 'second.js'), secondScript);
    await writeFile(join(root, 'first.svg'), firstImage);
    await writeFile(join(root, 'second.svg'), secondImage);
    await writeFile(join(root, 'index.html'), `<!doctype html><html lang="ko"><head>
      <title>Measured</title><meta name="viewport" content="width=device-width">
      <script src="/first.js"></script><script src="/second.js"></script>
      </head><body><main><h1>Measured page</h1><p>Stable content.</p>
      <img src="/first.svg" alt="Red square"><img src="/second.svg" alt="Blue square">
      <img src="/first.svg" alt="Hidden duplicate" hidden>
      </main></body></html>`);
    const server = await startStaticServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);
    const browser = await chromium.launch({ headless: true });

    try {
      const result = await measureBrowserPage(browser, server.baseUrl, '/', 'desktop', {
        warmups: 1,
        samples: 1,
      });

      expect(result.warmupDiscarded).toBe(1);
      expect(result.sampleCount).toBe(1);
      expect(result.samples).toHaveLength(1);
      expect(result.samples[0].lcpMs).toBeGreaterThanOrEqual(0);
      expect(result.samples[0].jsGzipBytes).toBe(
        gzipSync(firstScript, { level: 9 }).byteLength + gzipSync(secondScript, { level: 9 }).byteLength,
      );
      expect(result.samples[0].imageBytes).toBe(
        Buffer.byteLength(firstImage) + Buffer.byteLength(secondImage),
      );
      expect(result.samples[0].renderedImages).toEqual([
        { displayedHeight: 2, displayedWidth: 2, format: 'image/svg+xml' },
        { displayedHeight: 3, displayedWidth: 3, format: 'image/svg+xml' },
      ]);
      expect(result.consoleErrors).toEqual([]);
      expect(result.hydrationErrors).toEqual([]);
      expect(result.axeSeriousOrCritical).toEqual([]);
      expect(result.overflow.overflow).toBe(false);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
