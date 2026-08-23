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
    const lazyImage = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><path fill="green" d="M0 0h4v4H0z"/></svg>';
    await writeFile(join(root, 'first.js'), firstScript);
    await writeFile(join(root, 'second.js'), secondScript);
    await writeFile(join(root, 'first.svg'), firstImage);
    await writeFile(join(root, 'second.svg'), secondImage);
    await writeFile(join(root, 'lazy.svg'), lazyImage);
    await writeFile(join(root, 'index.html'), `<!doctype html><html lang="ko"><head>
      <title>Measured</title><meta name="viewport" content="width=device-width">
      <script src="/first.js"></script><script src="/second.js"></script>
      </head><body><main><h1>Measured page</h1><p>Stable content.</p>
      <img src="/first.svg" width="2" height="2" alt="Red square">
      <img src="/second.svg" width="3" height="3" alt="Blue square">
      <img src="/first.svg" width="2" height="2" alt="Hidden duplicate" hidden>
      <img loading="lazy" src="/lazy.svg" width="4" height="4" alt="Offscreen green square"
        style="display:block;margin-top:5000px">
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
        Buffer.byteLength(firstImage) + Buffer.byteLength(secondImage) + Buffer.byteLength(lazyImage),
      );
      expect(result.samples[0].renderedImages).toEqual([
        {
          source: '/first.svg',
          displayedHeight: 2,
          displayedWidth: 2,
          naturalHeight: 2,
          naturalWidth: 2,
          declaredHeight: 2,
          declaredWidth: 2,
          format: 'image/svg+xml',
        },
        {
          source: '/second.svg',
          displayedHeight: 3,
          displayedWidth: 3,
          naturalHeight: 3,
          naturalWidth: 3,
          declaredHeight: 3,
          declaredWidth: 3,
          format: 'image/svg+xml',
        },
        {
          source: '/lazy.svg',
          displayedHeight: 4,
          displayedWidth: 4,
          naturalHeight: 4,
          naturalWidth: 4,
          declaredHeight: 4,
          declaredWidth: 4,
          format: 'image/svg+xml',
        },
      ]);
      expect(result.imageFailures).toEqual([]);
      expect(result.consoleErrors).toEqual([]);
      expect(result.hydrationErrors).toEqual([]);
      expect(result.axeSeriousOrCritical).toEqual([]);
      expect(result.overflow.overflow).toBe(false);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it('counts external, inline, and Next flight bootstrap JavaScript without double counting', async () => {
    const root = await createRoot();
    let state = 0x12345678;
    const payload = Array.from({ length: 150 * 1024 }, () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return String.fromCharCode(33 + (state % 90));
    }).join('');
    const externalScript = 'globalThis.externalLoaded = true;';
    const inlineScript = `globalThis.inlinePayload=${JSON.stringify(payload)};`;
    const flightBootstrap = `self.__next_f=self.__next_f||[];self.__next_f.push(${JSON.stringify(payload.slice(0, 4096))});`;
    const flightPayload = `1:${JSON.stringify({ buildId: 'test', payload: payload.slice(0, 8192) })}`;
    const flightLoader = "fetch('/flight.rsc').then((response)=>response.text()).then((value)=>globalThis.flight=value);";
    await writeFile(join(root, 'external.js'), externalScript);
    await writeFile(join(root, 'flight.rsc'), flightPayload);
    await writeFile(join(root, 'index.html'), `<!doctype html><html lang="ko"><head>
      <title>JavaScript bytes</title><meta name="viewport" content="width=device-width">
      <script src="/external.js"></script><script>${inlineScript}</script>
      <script>${flightBootstrap}</script><script>${flightLoader}</script>
      </head><body><main><h1>JavaScript bytes</h1></main></body></html>`);
    const server = await startStaticServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);
    const browser = await chromium.launch({ headless: true });

    try {
      const result = await measureBrowserPage(browser, server.baseUrl, '/', 'desktop', {
        warmups: 1,
        samples: 1,
      });

      expect(Buffer.byteLength(inlineScript)).toBeGreaterThan(150 * 1024);
      expect(result.samples[0].jsGzipBytes).toBe([
        externalScript,
        inlineScript,
        flightBootstrap,
        flightLoader,
        flightPayload,
      ].reduce((total, source) => total + gzipSync(source, { level: 9 }).byteLength, 0));
    } finally {
      await browser.close();
    }
  }, 30_000);

  it('rejects a styled invalid image instead of treating its tiny bytes as an advantage', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'broken.webp'), 'not-webp!');
    await writeFile(join(root, 'index.html'), `<!doctype html><html lang="ko"><head>
      <title>Broken image</title><meta name="viewport" content="width=device-width">
      </head><body><main><h1>Broken image</h1>
      <img src="/broken.webp" srcset="/broken.webp 600w" sizes="600px"
        width="600" height="400" style="width:600px;height:400px" alt="Broken fixture">
      </main></body></html>`);
    const server = await startStaticServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);
    const browser = await chromium.launch({ headless: true });

    try {
      const result = await measureBrowserPage(browser, server.baseUrl, '/', 'desktop', {
        warmups: 1,
        samples: 1,
      });

      expect(result.samples[0].imageFailures ?? []).toContainEqual(expect.stringContaining('decode-failed'));
      expect(result.samples[0].renderedImages).toEqual([]);
      expect(result.samples[0].imageBytes).toBe(0);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
