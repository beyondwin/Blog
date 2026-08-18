import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function source(path) {
  return readFile(join(root, path), 'utf8');
}

describe('public route publication guard', () => {
  it('requires the shared selector at every route that reads a collection directly', async () => {
    const directSurfaces = [
      'src/pages/analysis/[slug].astro',
      'src/pages/articles/[slug].astro',
      'src/pages/articles/index.astro',
      'src/pages/ideas/[slug].astro',
      'src/pages/reviews/[slug].astro',
      'src/pages/reviews/index.astro',
      'src/pages/travel/[slug].astro',
    ];

    for (const path of directSurfaces) {
      const route = await source(path);
      expect(route, path).toContain('isPublicEntry');
      expect(route, path).not.toMatch(/!\s*data\.draft|data\.draft\s*!==\s*true/);
      for (const call of route.matchAll(/getCollection\(([\s\S]*?)\)/g)) {
        expect(call[1], `${path} getCollection selector`).toContain('isPublicEntry');
      }
    }
  });

  it('keeps home, search, collection lists, and nested tag routes behind public aggregators', async () => {
    const surfaces = {
      'src/pages/index.astro': 'loadHomePresentation',
      'src/lib/homeData.ts': 'getContentByCollection',
      'src/pages/search/index.astro': 'loadSearchRecords',
      'src/lib/searchData.ts': 'getAllContent',
      'src/pages/analysis/index.astro': 'getContentByCollection',
      'src/pages/ideas/index.astro': 'getContentByCollection',
      'src/pages/travel/index.astro': 'getContentByCollection',
      'src/pages/tags/index.astro': 'getAllContent',
      'src/pages/tags/[tag].astro': 'getAllContent',
    };

    for (const [path, publicLoader] of Object.entries(surfaces)) {
      expect(await source(path), path).toContain(publicLoader);
    }

    const content = await source('src/lib/content.ts');
    expect(content).toContain('getCollection(\n    collection,\n    isPublicEntry,\n  )');
    expect(content).not.toMatch(/!\s*data\.draft|data\.draft\s*!==\s*true/);
  });
});

describe('home route contract', () => {
  it('home route uses public nouns and thought page hrefs', async () => {
    const home = await readFile(join(root, 'src/pages/index.astro'), 'utf8');
    expect(home).toContain('selectHomeThought');
    expect(home).toContain('featuredThought');
    expect(home).not.toContain('Editor');
    expect(home).not.toContain('READING NOTE');
    expect(home).not.toContain('지금 펼쳐 둔 기록');
    expect(home).not.toContain('/memory/?thought=');
  });
});
