import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { readActiveRelease, type VerifiedActivePublicRelease } from '@beyondwin/content/release';
import { parsePublicRecord } from '@beyondwin/contracts';
import { CollectionPage, supportsCollectionPage } from '../../src/ui/collections/CollectionPage';

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
  it('derives the public route set from the verified release', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    const active = await releaseModule.loadVerifiedRelease();
    const actual = releaseModule.fullPublicPaths(active) as string[];
    expect(actual).toHaveLength(93);
    expect(actual).toEqual([...new Set(actual)].sort((left, right) => left.localeCompare(right)));
    for (const record of Object.values(active.manifest.records) as Array<{ href: string }>) {
      expect(actual).toContain(record.href);
    }
    expect(actual).toContain('/memory/map/');
    expect(actual).toContain('/tags/AI-agent/');
    expect(actual).toContain('/tags/AI/');
    expect(actual).toContain('/articles/agents-md-vs-agent-skills-evidence/');
    expect(actual).toContain('/articles/aws-static-frontend-serverless-bff/');
    expect(actual).toContain('/articles/karpathy-delete-everything-keep-graph/');
    expect(actual).toContain('/articles/shared-ai-conversation-evidence-boundaries/');
    expect(actual).toContain('/articles/uncle-bob-ai-code-review-evidence/');
  }, 30_000);

  it('keeps the frozen article and review fixtures in incumbent latest-first order', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    const active = await releaseModule.loadVerifiedRelease();

    expect(releaseModule.recordsForCollection(active, 'articles').map(({ id }: { id: string }) => id)).toEqual([
      'graphify-code-knowledge-graph-deep-dive',
      'agents-md-vs-agent-skills-evidence',
      'ai-design-references',
      'andrej-karpathy-skills-analysis',
      'aws-static-frontend-serverless-bff',
      'codex-ui-mockup-workflow',
      'context-refinement-system-design',
      'hermes-agent-persistent-worker-runtime',
      'karpathy-delete-everything-keep-graph',
      'lazycodex-agent-harness-analysis',
      'oh-my-pi-deep-review',
      'open-design-repo-analysis',
      'pgvector-hybrid-search',
      'ponytail-agent-minimalism-analysis',
      'postgresql-bm25-pg-search',
      'shared-ai-conversation-evidence-boundaries',
      'uncle-bob-ai-code-review-evidence',
    ]);
    expect(releaseModule.recordsForCollection(active, 'reviews').map(({ id }: { id: string }) => id)).toEqual([
      'changing-their-minds',
      'lord-of-the-flies',
      'black-swan',
      'nevertheless',
      'goethe-said-everything',
      'devotion-of-suspect-x',
      'poor-charlies-almanack',
      'art-thief',
      'siddhartha',
      'habitus',
      'how-adam-smith-can-change-your-life',
      'lolita',
      'future-arrived-first',
      'how-we-crossed-winter',
      'convenience-store-woman',
      'miracles-of-namiya-general-store',
      'doing-good-better',
      'factfulness',
    ]);
    expect(releaseModule.recordsForCollection(active, 'thoughts').map(({ id }: { id: string }) => id)).toEqual([
      'why-i-read-in-the-ai-era',
    ]);
  });

  it('includes the public thought in all-content and tag-facing discovery', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    const active = await releaseModule.loadVerifiedRelease();

    expect(releaseModule.allPublicContentRecords(active)).toContainEqual(expect.objectContaining({
      collection: 'thoughts',
      id: 'why-i-read-in-the-ai-era',
    }));
    expect(releaseModule.recordsForTag(active, 'reading')).toContainEqual(expect.objectContaining({
      collection: 'thoughts',
      id: 'why-i-read-in-the-ai-era',
      href: '/thoughts/why-i-read-in-the-ai-era/',
    }));
    expect(releaseModule.exactPublicTags(active)).toContainEqual(expect.objectContaining({ label: 'reading' }));
  });

  it('keeps the generic collection page typed to its secondary origins and excludes thoughts', () => {
    type Collection = ComponentProps<typeof CollectionPage>['collection'];
    expectTypeOf<Collection>().toEqualTypeOf<'analysis' | 'articles' | 'ideas' | 'reviews' | 'travel'>();
    expect(supportsCollectionPage('thoughts')).toBe(false);
    expect(supportsCollectionPage('articles')).toBe(true);
  });

  it('accounts for every transport-producing destination with a current detail consumer', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    expect([...releaseModule.PUBLIC_CONTENT_COLLECTIONS].sort()).toEqual([
      'analysis', 'articles', 'ideas', 'reviews', 'thoughts', 'travel',
    ]);

    const ownerAssertions = [
      ['analysis', 'src/ui/reading/SecondaryReadingPage.tsx', /<ContextReturn collection=\{record\.collection\}/u],
      ['articles', 'src/ui/reading/ArticleReadingPage.tsx', /<ContextReturn collection="articles"/u],
      ['ideas', 'src/ui/reading/SecondaryReadingPage.tsx', /<ContextReturn collection=\{record\.collection\}/u],
      ['reviews', 'src/ui/reading/ReviewReadingPage.tsx', /<ContextReturn collection="reviews"/u],
      ['thoughts', 'src/ui/thoughts/ThoughtReadingPage.tsx', /<ContextReturn collection="thoughts"/u],
      ['travel', 'src/ui/reading/SecondaryReadingPage.tsx', /<ContextReturn collection=\{record\.collection\}/u],
    ] as const;
    for (const [collection, path, consumer] of ownerAssertions) {
      const source = await readFile(join(candidateRoot, path), 'utf8');
      expect(source, `${collection} detail owner ${path}`).toMatch(consumer);
    }
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
    expect(collectionHtml).toContain('class="editorial-page-header"');
    expect(collectionHtml).toContain('class="editorial-list-row editorial-list-row--text-led"');
    expect(collectionHtml).not.toMatch(/reading-sheet|data-surface-mode|public-scene/iu);

    const inventory = releaseModule.searchInventory(active);
    const discovery = releaseModule.searchDiscovery(active);
    const fixture = releaseModule.publicSecondBrainFixture(active);
    const searchHtml = renderToStaticMarkup(createElement(SearchPage, {
      discovery,
      fixture,
      initialQuery: 'Graphify',
      inventory,
    }));
    expect(searchHtml).toContain('Graphify');
    expect(searchHtml).toContain('제목이 검색어와 일치합니다');
    expect(searchHtml).toContain('href="/articles/graphify-code-knowledge-graph-deep-dive/"');
    expect(JSON.stringify(inventory)).not.toMatch(/bodyHtml|releaseId|rendererVersion|rawPrompt|privatePath/u);

    const emptySearchHtml = renderToStaticMarkup(createElement(SearchPage, {
      discovery,
      fixture,
      initialQuery: '',
      inventory,
    }));
    expect(emptySearchHtml).toContain('제 기록에');
    expect(emptySearchHtml).not.toContain('__bw_');

    const memoryHtml = renderToStaticMarkup(createElement(MemoryIndexPage, { records: [memory] }));
    expect(memoryHtml).toContain(`href="${memory.href}"`);
    expect(memoryHtml).not.toContain('__bw_');
    expect(memoryHtml).toContain('class="editorial-page-header"');

    const tagsHtml = renderToStaticMarkup(createElement(TagsPage, {
      records: [article],
      selectedTag: 'AI',
    }));
    expect(releaseModule.exactPublicTags(active)).toContainEqual(expect.objectContaining({ label: 'AI', href: '/tags/AI/' }));
    expect(tagsHtml).toContain(`href="${article.href}"`);
    expect(tagsHtml).toContain('class="editorial-page-header"');
    expect(tagsHtml).not.toMatch(/reading-sheet|data-surface-mode|public-scene/iu);

    const emptyLaneHtml = renderToStaticMarkup(createElement(CollectionPage, {
      collection: 'analysis',
      description: '근거를 붙인 기술 글은 아티클에서 읽습니다.',
      emptyMessage: '아직 공개한 출처 분석이 없습니다.',
      records: [],
      title: '조사',
    }));
    expect(emptyLaneHtml).toContain('아직 공개한 출처 분석이 없습니다.');
    expect(emptyLaneHtml).toContain('아티클에서 읽습니다.');
    expect(emptyLaneHtml).not.toContain('글에서 읽습니다.');
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
    const MemoryDetailPage = (await candidateModule<any>('src/ui/memory/MemoryDetailPage.tsx')).MemoryDetailPage;
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
    expect(html).toContain('class="editorial-detail-frame editorial-detail-frame--text-led"');
    expect(html).toContain('class="detail-action-rail"');
    expect(html).toContain('<a class="context-return" href="/analysis/">조사 목록으로</a>');
    expect(html).not.toMatch(/reading-sheet|reading-threshold|data-surface-mode|public-scene/iu);

    const memoryHtml = renderToStaticMarkup(createElement(MemoryDetailPage, { record: parsePublicRecord({
      collection: 'memory',
      id: 'memory-fixture',
      href: '/memory/memory-fixture/',
      title: '검토가 필요한 문장',
      description: '공개 projection fixture.',
      claimKo: '판단은 검토를 지나야 한다.',
      claimEn: 'Judgment needs review.',
      body: '본문',
      bodyHtml: '<p>본문</p>',
      memoryType: 'reflective',
      origin: 'author',
      topics: [],
      theses: [],
      sources: [{ href: '/articles/source/', title: '근거가 된 글' }],
      companions: [{ slug: 'companion', href: '/memory/companion/', claimKo: '함께 읽는 문장' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      media: [],
      relationships: [],
      memoryLinks: [],
    }) }));
    expect(memoryHtml).toContain('<a class="context-return" href="/memory/">문장 목록으로</a>');
    expect(memoryHtml).toContain('class="memory-thought__sources"');
    expect(memoryHtml).toContain('class="memory-thought__companions"');
    expect(mapRoute.loader().headers.get('Location')).toBe('/memory/');
  });

  it('keeps retired public-scene and mineral language out of active runtime sources', async () => {
    const runtimeFiles = [
      'app/routes/secondary-shared.tsx',
      'src/ui/collections/CollectionPage.tsx',
      'src/ui/collections/RecordRow.tsx',
      'src/ui/memory/MemoryIndexPage.tsx',
      'src/ui/memory/MemoryDetailPage.tsx',
      'src/ui/memory/MemoryMapPage.tsx',
      'src/ui/navigation/origin.ts',
      'src/ui/reading/ContextReturn.tsx',
      'src/ui/reading/SecondaryReadingPage.tsx',
      'src/ui/tags/TagsPage.tsx',
    ];
    const source = (await Promise.all(runtimeFiles.map((path) => readFile(join(candidateRoot, path), 'utf8'))))
      .join('\n');
    expect(source).not.toMatch(/public-scene|Continuity Zoom|data-surface-mode|\bmineral\b/iu);
    expect(source).not.toMatch(/[>'"]\s*(?:장면|beyondwin)(?:\s|[<'"])/iu);
  });

  it('loads every secondary detail adapter from one verified record and resolves applicable media', async () => {
    const common = {
      description: 'Verified secondary fixture.',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: ['fixture'],
      media: [],
      relationships: [],
      memoryLinks: [],
      bodyHtml: '<p>Verified body</p>',
    };
    const records = [
      parsePublicRecord({ collection: 'analysis', id: 'analysis-fixture', href: '/analysis/analysis-fixture/', title: 'Analysis fixture', sourceTitle: 'Primary source', sourceUrl: 'https://example.com/source', comment: 'Verified fixture', format: 'research-report', ...common }),
      parsePublicRecord({ collection: 'ideas', id: 'idea-fixture', href: '/ideas/idea-fixture/', title: 'Idea fixture', maturity: 'proposal', ...common }),
      parsePublicRecord({ collection: 'travel', id: 'travel-fixture', href: '/travel/travel-fixture/', title: 'Travel fixture', location: 'Seoul', leadMedia: 'lead', ...common }),
    ];
    const leadAsset = { id: 'lead', alt: 'Verified place', fallback: { src: '/assets/content/travel/travel-fixture/lead.webp', candidates: [] }, sources: [], width: 10, height: 10 };
    const release = { releasePath: '/verified', manifest: {
      records: Object.fromEntries(records.map((record) => [`${record.collection}/${record.id}`, record])),
      assets: { 'travel/travel-fixture/lead': leadAsset },
    } };
    const adapters = [
      ['app/routes/analysis.tsx', 'analysis-fixture'],
      ['app/routes/idea.tsx', 'idea-fixture'],
      ['app/routes/travel.tsx', 'travel-fixture'],
    ] as const;

    for (const [path, slug] of adapters) {
      const adapter = await candidateModule<any>(path);
      const data = adapter.loadDetail(release, slug);
      expect(data.record.id).toBe(slug);
      expect(adapter.meta({ data })).toContainEqual({
        tagName: 'link', rel: 'canonical', href: `https://form-thought.local.invalid${data.record.href}`,
      });
      expect(() => adapter.loadDetail(release, 'missing')).toThrow();
    }
    expect((await candidateModule<any>('app/routes/travel.tsx')).loadDetail(release, 'travel-fixture').mediaAsset)
      .toBe(leadAsset);
    const fixtureRoutes = (await candidateModule<any>('app/routes.ts')).routeConfigForRelease(release);
    expect(fixtureRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'analysis/:slug', file: './routes/analysis.tsx' }),
      expect.objectContaining({ path: 'ideas/:slug', file: './routes/idea.tsx' }),
      expect.objectContaining({ path: 'travel/:slug', file: './routes/travel.tsx' }),
    ]));
  });

  it('preserves raw search typing, creates a bounded primary-result origin, and detects safe tag-anchor collisions', async () => {
    const search = await candidateModule<any>('src/ui/search/SearchPage.tsx');
    const secondBrain = await candidateModule<any>('src/ui/search/secondBrain.ts');
    const anchors = await candidateModule<any>('src/ui/navigation/search-anchor.ts');
    const article = { id: 'articles/AI-design', anchorId: 'record-articles-ai-design', href: '/articles/ai-design/', kind: 'article', title: 'AI 설계', description: '설명', topics: ['AI 설계'] };
    const html = renderToStaticMarkup(createElement(search.SearchPage, {
      fixture: {
        question: secondBrain.SAMPLE_QUESTION,
        answerLead: '답변',
        answerConclusionPrefix: '판단 ',
        answerEmphasis: '근거',
        answerConclusionSuffix: '입니다.',
        evidence: [],
      },
      initialQuery: 'AI 설계 ',
      inventory: [article],
    }));

    expect(html).toContain('value="AI 설계 "');
    expect(search.boundedSearchQuery('AI 설계 ')).toBe('AI 설계');
    expect(search.searchOriginForItem(article, 'AI 설계 ')).toEqual({
      kind: 'search', query: 'AI 설계', anchorId: 'record-articles-ai-design',
    });
    expect(anchors.safeSearchAnchor('AI 설계')).toMatch(/^tag-[a-f0-9]{16}$/u);
    expect(anchors.safeSearchAnchor('AI 설계')).not.toBe(anchors.safeSearchAnchor('ai 설계'));
    expect(() => anchors.safeSearchAnchors(['한국어', 'space label'], () => 'tag-collision'))
      .toThrow(/collision/iu);
  });

  it('restores only verified memory compatibility targets for query and legacy hash prefixes', async () => {
    const memory = await candidateModule<any>('src/ui/memory/MemoryIndexPage.tsx');
    const slugs = ['known-memory'];

    expect(memory.memoryCompatibilityTarget({ search: '?thought=known-memory', hash: '' }, slugs))
      .toBe('/memory/known-memory/');
    for (const prefix of ['map-', 'relation-', 'memory-detail-']) {
      expect(memory.memoryCompatibilityTarget({ search: '', hash: `#${prefix}known-memory` }, slugs))
        .toBe('/memory/known-memory/');
    }
    expect(memory.memoryCompatibilityTarget({ search: '?thought=unknown-memory', hash: '' }, slugs)).toBeNull();
    expect(memory.memoryCompatibilityTarget({ search: '?thought=../private', hash: '' }, slugs)).toBeNull();
  });

  it('keeps selected-tag payloads narrow and restores sealed index metadata', async () => {
    const releaseModule = await candidateModule<any>('app/release.server.ts');
    const active = await releaseModule.loadVerifiedRelease();
    const tagRoute = await candidateModule<any>('app/routes/tag.tsx');
    const tagData = await tagRoute.loader({ params: { tag: 'AI' } });
    expect(Object.keys(tagData).sort()).toEqual(['records', 'tag']);

    const cases = [
      ['app/routes/memory-index.tsx', 'MemoryIndexPresentation', '<title>문장 · FORM &amp; THOUGHT</title>', '글로 쓰고 난 뒤에도 남는 문장만 여기에 둡니다.'],
      ['app/routes/search.tsx', 'SearchPresentation', '<title>검색 · FORM &amp; THOUGHT</title>', '공개된 기록에 질문하고, 연결된 답과 근거를 살펴봅니다.'],
      ['app/routes/tags-index.tsx', 'TagsIndexPresentation', '<title>FORM &amp; THOUGHT</title>', '찾기로 이어진 단어들.'],
    ] as const;
    for (const [path, presentationName, title, description] of cases) {
      const route = await candidateModule<any>(path);
      const data = path.includes('memory-index')
        ? { records: releaseModule.summariesForCollection(active, 'memory') }
        : path.includes('search')
          ? {
              fixture: releaseModule.publicSecondBrainFixture(active),
              initialQuery: '',
              inventory: releaseModule.searchInventory(active),
            }
          : { tags: releaseModule.exactPublicTags(active) };
      const html = renderToStaticMarkup(createElement(route[presentationName], { data }));
      expect(html).toContain(title);
      expect(html).toContain(`content="${description}"`);
    }
  });

  it('renders all reviews as a latest-first editorial ledger with the exact public noun', async () => {
    const route = await candidateModule<any>('app/routes/reviews-index.tsx');
    const data = await route.loader();
    const html = renderToStaticMarkup(createElement(route.ReviewsIndexPresentation, { data }));

    expect(data.records).toHaveLength(18);
    expect(data.records.map(({ id }: { id: string }) => id).slice(0, 3)).toEqual([
      'changing-their-minds',
      'lord-of-the-flies',
      'black-swan',
    ]);
    expect(html).toContain('<title>서평 · FORM &amp; THOUGHT</title>');
    expect(html).toContain('<h1>서평</h1>');
    expect(html.match(/class="editorial-list-row(?: |")/gu)).toHaveLength(18);
    expect(html).toContain('우리는 현실을 보는가, 현실에 대해 만든 이야기를 보는가.');
    expect(html).toContain('<time dateTime="2026-05-27">2026.05.27</time>');
    expect(html).not.toMatch(/book-cover--set|book-objects|book-diary/u);
    expect(html).not.toContain('/assets/content/reviews/black-swan/cover');
  }, 30_000);

  it('uses the verdict-led review detail and keeps warning covers text-led', async () => {
    const route = await candidateModule<any>('app/routes/review.tsx');
    const data = await route.loader({ params: { slug: 'black-swan' } });
    const html = renderToStaticMarkup(createElement(route.ReviewPresentation, { data }));

    expect(data.coverAsset).toBeUndefined();
    expect(html).toContain('<h1>블랙스완</h1>');
    expect(html).toContain('나심 니콜라스 탈레브');
    expect(html).toContain('동녘사이언스 2018 개정증보판, 차익종·김현구 옮김');
    expect(html).toContain('<time dateTime="2026-05-27T00:00:00.000Z">2026.05.27</time>');
    expect(html).toContain('표지 공개 권리 미확인');
    expect(html).toContain('<a class="continue-reading__collection" href="/reviews/">서평 전체 보기</a>');
    expect(html.indexOf('우리는 현실을 보는가, 현실에 대해 만든 이야기를 보는가.'))
      .toBeLessThan(html.indexOf('나심 니콜라스 탈레브의 블랙 스완은'));
    expect(html).not.toContain('/assets/content/reviews/black-swan/cover');
    expect(html).not.toMatch(/>책(?: 목록으로| 전체 보기|<)/u);
  }, 30_000);
});
