import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCAL_SITE_ORIGIN, PUBLIC_SECURITY_HEADERS, robotsText, sitemapXml } from '../../apps/site/app/delivery';
import { assertProductionBoundary, verifyStaticDelivery } from './verify-public-site.mts';
import { cleanHostCommandEnvironment } from './verify-clean-host.mts';

describe('React-only public-site verification', () => {
  it('uses an explicit Node 24 clean-host environment and drops hostile ambient secrets', () => {
    const environment = cleanHostCommandEnvironment({
      PATH: '/hostile/bin',
      OPENAI_API_KEY: 'secret',
      NPM_TOKEN: 'secret',
      HTTPS_PROXY: 'http://secret.example',
    }, '/tmp/beyondwin-clean-host.test');
    expect(environment.PATH).toBe('/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(JSON.stringify(environment)).not.toMatch(/secret|token|api_key|proxy/iu);
  });

  it('fails closed on all production/canonical authority because no domain is approved', () => {
    expect(() => assertProductionBoundary({
      productionCanonicalOrigin: 'not_measured',
      production_cutover_authorized: false,
      productionHost: null,
    })).not.toThrow();
    expect(() => assertProductionBoundary({
      productionCanonicalOrigin: 'https://guessed.example',
      production_cutover_authorized: false,
      productionHost: null,
    })).toThrow(/not_measured/iu);
    expect(() => assertProductionBoundary({
      productionCanonicalOrigin: 'not_measured',
      production_cutover_authorized: true,
      productionHost: 'https://public.example',
    })).toThrow(/unauthorized/iu);
  });

  it('verifies exact route output, local sitemap/robots, branded 404, and headers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'form-thought-public-site-'));
    await mkdir(join(root, 'articles'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<h1>Home</h1>');
    await writeFile(join(root, 'articles/index.html'), '<h1>Articles</h1>');
    await writeFile(join(root, 'sitemap.xml'), sitemapXml(['/', '/articles/'], LOCAL_SITE_ORIGIN));
    await writeFile(join(root, 'robots.txt'), robotsText(LOCAL_SITE_ORIGIN));
    await writeFile(join(root, '404.html'), '<title>페이지를 찾을 수 없습니다 · FORM &amp; THOUGHT</title>');
    await writeFile(join(root, 'site.webmanifest'), JSON.stringify({ name: 'FORM & THOUGHT' }));
    await writeFile(join(root, 'favicon.svg'), '<svg><path fill="#AF6047"/></svg>');
    await writeFile(join(root, '_headers'), `/*\n${Object.entries(PUBLIC_SECURITY_HEADERS)
      .map(([name, value]) => `  ${name}: ${value}`).join('\n')}\n`);
    await expect(verifyStaticDelivery(root, ['/', '/articles/'], LOCAL_SITE_ORIGIN)).resolves.toEqual({
      routeCount: 2,
      sitemapCount: 2,
    });
    await writeFile(join(root, 'robots.txt'), 'User-agent: *\n');
    await expect(verifyStaticDelivery(root, ['/', '/articles/'], LOCAL_SITE_ORIGIN)).rejects.toThrow(/robots/iu);
  });
});
