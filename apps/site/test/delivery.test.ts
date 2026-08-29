import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  LOCAL_SITE_ORIGIN,
  PUBLIC_SECURITY_HEADERS,
  absolutePublicUrl,
  resolveSiteOrigin,
  robotsText,
  sitemapXml,
} from '../app/delivery';

describe('React-only delivery contract', () => {
  it('requires one normalized exact HTTPS origin in production mode', () => {
    expect(resolveSiteOrigin({ FORM_THOUGHT_SITE_ORIGIN: 'https://form.example' }, 'production'))
      .toBe('https://form.example');
    for (const value of [undefined, '', 'http://form.example', 'https://form.example/path', 'https://user@form.example']) {
      expect(() => resolveSiteOrigin({ FORM_THOUGHT_SITE_ORIGIN: value }, 'production')).toThrow(/HTTPS origin/u);
    }
    expect(() => resolveSiteOrigin({ FORM_THOUGHT_SITE_ORIGIN: LOCAL_SITE_ORIGIN }, 'production'))
      .toThrow(/reserved local origin/u);
  });

  it('allows only the visible reserved invalid origin in explicit local mode', () => {
    expect(resolveSiteOrigin({}, 'local')).toBe(LOCAL_SITE_ORIGIN);
    expect(new URL(LOCAL_SITE_ORIGIN).hostname.endsWith('.invalid')).toBe(true);
    expect(absolutePublicUrl('/articles/', LOCAL_SITE_ORIGIN)).toBe(`${LOCAL_SITE_ORIGIN}/articles/`);
  });

  it('generates deterministic escaped sitemap and robots from verified public paths', () => {
    const paths = ['/articles/a&b/', '/', '/thoughts/one/'];
    expect(sitemapXml(paths, 'https://form.example')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + '  <url><loc>https://form.example/</loc></url>\n'
      + '  <url><loc>https://form.example/articles/a&amp;b/</loc></url>\n'
      + '  <url><loc>https://form.example/thoughts/one/</loc></url>\n'
      + '</urlset>\n',
    );
    expect(robotsText('https://form.example')).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://form.example/sitemap.xml\n',
    );
  });

  it('seals the required response header policy', () => {
    expect(PUBLIC_SECURITY_HEADERS).toEqual(expect.objectContaining({
      'Content-Security-Policy': expect.stringContaining("default-src 'self'"),
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    }));
  });

  it('ships final FORM & THOUGHT icon and install metadata without legacy colors', async () => {
    const [icon, manifestSource] = await Promise.all([
      readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8'),
      readFile(new URL('../public/site.webmanifest', import.meta.url), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestSource);
    expect(icon).toContain('#AF6047');
    expect(icon).toContain('#F2EFE9');
    expect(icon).not.toMatch(/oklch|rx=/u);
    expect(manifest).toMatchObject({
      name: 'FORM & THOUGHT',
      short_name: 'FORM & THOUGHT',
      start_url: '/',
      display: 'standalone',
      background_color: '#F2EFE9',
      theme_color: '#AF6047',
    });
  });

  it('keeps local acceptance explicit and exposes a fail-closed production build mode', async () => {
    const [rootPackage, sitePackage] = await Promise.all([
      readFile(new URL('../../../package.json', import.meta.url), 'utf8').then(JSON.parse),
      readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    ]);
    expect(sitePackage.scripts.build).toContain('FORM_THOUGHT_DELIVERY_MODE=local');
    expect(sitePackage.scripts['build:production']).toContain('FORM_THOUGHT_DELIVERY_MODE=production');
    expect(rootPackage.scripts['site:build:production'])
      .toBe('npm run build:production --workspace @beyondwin/site');
  });
});
