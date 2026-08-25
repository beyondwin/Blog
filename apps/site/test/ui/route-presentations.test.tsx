import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readActiveRelease, type VerifiedActivePublicRelease } from '@beyondwin/content/release';

const candidateRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(candidateRoot, '../..');
const releaseBindingEnvironment = 'BEYONDWIN_PUBLIC_RELEASE_BINDING_V1';
const originalReleaseBinding = process.env[releaseBindingEnvironment];

async function candidateModule<T>(relativePath: string): Promise<T> {
  return import(/* @vite-ignore */ pathToFileURL(join(candidateRoot, relativePath)).href) as Promise<T>;
}

beforeAll(async () => {
  const active = await readActiveRelease(join(repositoryRoot, 'build/public-releases'));
  const binding = await candidateModule<{
    serializeReleaseBinding(active: VerifiedActivePublicRelease): string;
  }>('release-binding.ts');
  process.env[releaseBindingEnvironment] = binding.serializeReleaseBinding(active);
});

afterAll(() => {
  if (originalReleaseBinding === undefined) delete process.env[releaseBindingEnvironment];
  else process.env[releaseBindingEnvironment] = originalReleaseBinding;
});

describe('full public route expansion', () => {
  it('derives exactly the sealed 80-route baseline from the verified release', async () => {
    const baseline = JSON.parse(await readFile(
      join(repositoryRoot, 'tests/fixtures/parity/astro-public-baseline.json'),
      'utf8',
    )) as { routes: Array<{ path: string }> };
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    const active = await releaseModule.loadVerifiedRelease();
    const actual = releaseModule.fullPublicPaths(active);
    const expected = baseline.routes.map(({ path }) => path).sort();

    expect(actual).toHaveLength(80);
    expect([...actual].sort()).toEqual(expected);
    expect(actual).toContain('/memory/map/');
    expect(actual).toContain('/tags/AI-agent/');
    expect(actual).toContain('/tags/AI/');
  });

  it('uses safe stable collection/id anchors and fails closed when one is overlong', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    expect(releaseModule.recordAnchor('articles', 'why-i-read-in-the-ai-era'))
      .toBe('record-articles-why-i-read-in-the-ai-era');
    expect(() => releaseModule.recordAnchor('articles', `x${'a'.repeat(80)}`))
      .toThrow(/safe origin anchor/iu);
  });

  it('renders collection, search, memory, tag, and empty-lane links as canonical no-JS anchors', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    const active = await releaseModule.loadVerifiedRelease();
    const article = releaseModule.recordsForCollection(active, 'articles')[0];
    const memory = releaseModule.recordsForCollection(active, 'memory')[0];
    const CollectionPage = (await candidateModule<any>('src/ui/collections/CollectionPage.tsx')).CollectionPage;
    const SearchPage = (await candidateModule<any>('src/ui/search/SearchPage.tsx')).SearchPage;
    const MemoryIndexPage = (await candidateModule<any>('src/ui/memory/MemoryIndexPage.tsx')).MemoryIndexPage;
    const TagsPage = (await candidateModule<any>('src/ui/tags/TagsPage.tsx')).TagsPage;

    const collectionHtml = renderToStaticMarkup(createElement(CollectionPage, {
      collection: 'articles',
      description: '다 쓴 에세이와 조사.',
      records: [article],
      title: '글',
    }));
    expect(collectionHtml).toContain(`id="${releaseModule.recordAnchor('articles', article.id)}"`);
    expect(collectionHtml).toContain(`href="${article.href}"`);

    const inventory = releaseModule.searchInventory(active);
    const searchHtml = renderToStaticMarkup(createElement(SearchPage, { initialQuery: 'Graphify', inventory }));
    expect(searchHtml).toContain('Graphify');
    expect(searchHtml).toContain('검색어와 제목이 일치합니다');
    expect(searchHtml).toContain('href="/articles/graphify-code-knowledge-graph-deep-dive/"');
    expect(JSON.stringify(inventory)).not.toMatch(/bodyHtml|releaseId|rendererVersion|rawPrompt|privatePath/u);

    const emptySearchHtml = renderToStaticMarkup(createElement(SearchPage, { initialQuery: '', inventory }));
    expect(emptySearchHtml).toContain('글, 책, 문장과 주제를 찾습니다.');
    expect(emptySearchHtml).not.toContain('__bw_');

    const memoryHtml = renderToStaticMarkup(createElement(MemoryIndexPage, { records: [memory] }));
    expect(memoryHtml).toContain(`href="${memory.href}"`);
    expect(memoryHtml).not.toContain('__bw_');

    const tagsHtml = renderToStaticMarkup(createElement(TagsPage, {
      records: [article],
      selectedTag: 'AI',
      tags: releaseModule.exactPublicTags(active),
    }));
    expect(releaseModule.exactPublicTags(active)).toContainEqual(expect.objectContaining({ label: 'AI', href: '/tags/AI/' }));
    expect(tagsHtml).toContain(`href="${article.href}"`);

    const emptyLaneHtml = renderToStaticMarkup(createElement(CollectionPage, {
      collection: 'analysis',
      description: '근거를 붙인 기술 글은 글에서 읽습니다.',
      emptyMessage: '아직 공개한 출처 분석이 없습니다.',
      records: [],
      title: '조사',
    }));
    expect(emptyLaneHtml).toContain('아직 공개한 출처 분석이 없습니다.');
  });

  it('keeps explicit framework routes and presentation-only adapters', async () => {
    const routesSource = await readFile(join(candidateRoot, 'app/routes.ts'), 'utf8');
    for (const routeModule of [
      'articles-index', 'article', 'reviews-index', 'review', 'search',
      'memory-index', 'memory', 'memory-map', 'tags-index', 'tag',
      'analysis-index', 'analysis', 'ideas-index', 'idea', 'travel-index', 'travel',
    ]) {
      expect(routesSource).toContain(`./routes/${routeModule}.tsx`);
    }
    for (const forbidden of ['src/content', 'memory/**', 'memory.public.json']) {
      expect(routesSource).not.toContain(forbidden);
    }
  });

  it('keeps secondary detail evidence and memory map behavior truthful without inventing records', async () => {
    const SecondaryReadingPage = (await candidateModule<any>('src/ui/reading/SecondaryReadingPage.tsx')).SecondaryReadingPage;
    const mapRoute = await candidateModule<any>('app/routes/memory-map.tsx');
    const html = renderToStaticMarkup(createElement(SecondaryReadingPage, { record: {
      collection: 'analysis',
      id: 'evidence-fixture',
      href: '/analysis/evidence-fixture/',
      title: '근거가 있는 조사',
      description: '공개 release가 가진 출처를 그대로 보여준다.',
      bodyHtml: '<p>본문</p>',
      sourceTitle: 'Primary source',
      sourceUrl: 'https://example.com/source',
      format: 'research-report',
      comment: 'fixture',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      media: [],
      relationships: [],
      memoryLinks: [],
    } }));

    expect(html).toContain('출처:');
    expect(html).toContain('href="https://example.com/source"');
    expect(html).toContain('Primary source');
    expect(html).toContain('research-report');
    expect(mapRoute.loader().headers.get('Location')).toBe('/memory/');
  });
});
