import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bannedPublicNouns, memoryThoughtHref, publicNav } from './siteChrome';

describe('site chrome', () => {
  it('exposes exactly four public nouns', () => {
    expect(publicNav.map((item) => item.label)).toEqual(['글', '책', '문장', '찾기']);
    expect(publicNav.map((item) => item.href)).toEqual([
      '/articles/',
      '/reviews/',
      '/memory/',
      '/search/',
    ]);
  });

  it('builds a real thought page URL', () => {
    expect(memoryThoughtHref('personal-sites-should-show-records-first'))
      .toBe('/memory/personal-sites-should-show-records-first/');
  });

  it('keeps banned nouns out of the header source once wired', async () => {
    const header = await readFile(new URL('../components/SiteHeader.astro', import.meta.url), 'utf8');
    for (const noun of bannedPublicNouns) {
      expect(header).not.toContain(noun);
    }
    expect(header).toContain('publicNav');
    expect(header).not.toContain('literary');
  });
});
