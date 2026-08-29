import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readActiveRelease } from '@beyondwin/content/release';
import type { VerifiedActivePublicRelease } from '@beyondwin/content/release';

const ARTICLE_ID = 'graphify-code-knowledge-graph-deep-dive';
const ESTABLISHED_ARTICLE_ID = ARTICLE_ID;
const REVIEW_ID = 'black-swan';
const MEMORY_ID = 'agent-harnesses-are-operating-systems';
const THOUGHT_ID = 'why-i-read-in-the-ai-era';
const LOCAL_ORIGIN = 'https://form-thought.local.invalid';
const candidateRoot = fileURLToPath(new URL('..', import.meta.url));
const releaseBindingEnvironment = 'BEYONDWIN_PUBLIC_RELEASE_BINDING_V1';
const originalReleaseBinding = process.env[releaseBindingEnvironment];

async function candidateModule<T>(relativePath: string): Promise<T> {
  const moduleUrl = pathToFileURL(resolve(candidateRoot, relativePath)).href;
  return import(/* @vite-ignore */ moduleUrl) as Promise<T>;
}

beforeAll(async () => {
  const repositoryRoot = resolve(candidateRoot, '../..');
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

describe('React Router current-behavior static route contract', () => {
  it('resolves the repository root from both source and bundled module locations', async () => {
    const releaseModule = await candidateModule<{
      repositoryRootFromModuleUrl(moduleUrl: string): string;
    }>('app/release.server.ts');
    const repositoryRoot = resolve(candidateRoot, '../..');

    expect(releaseModule.repositoryRootFromModuleUrl(
      pathToFileURL(join(candidateRoot, 'app/release.server.ts')).href,
    )).toBe(repositoryRoot);
    expect(releaseModule.repositoryRootFromModuleUrl(
      pathToFileURL(join(candidateRoot, 'build/server/index.js')).href,
    )).toBe(repositoryRoot);
  });

  it('uses Framework Mode explicit routes, disables runtime SSR, and prerenders every verified decision-slice URL', async () => {
    const configModule = await candidateModule<{ default: { ssr: boolean; prerender(): Promise<string[]> } }>(
      'react-router.config.ts',
    );
    const routesModule = await candidateModule<{ default: Array<{ path?: string; index?: boolean; file: string }> }>(
      'app/routes.ts',
    );
    const releaseModule = await candidateModule<{
      loadVerifiedRelease(): Promise<VerifiedActivePublicRelease>;
      fullPublicPaths(release: VerifiedActivePublicRelease): string[];
    }>('app/release.server.ts');

    expect(configModule.default.ssr).toBe(false);
    const release = await releaseModule.loadVerifiedRelease();
    expect(await configModule.default.prerender()).toEqual(releaseModule.fullPublicPaths(release));
    expect(routesModule.default).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: true, file: './routes/home.tsx' }),
      expect.objectContaining({ path: 'articles', file: './routes/articles-index.tsx' }),
      expect.objectContaining({ path: 'articles/:slug', file: './routes/article.tsx' }),
      expect.objectContaining({ path: 'reviews', file: './routes/reviews-index.tsx' }),
      expect.objectContaining({ path: 'reviews/:slug', file: './routes/review.tsx' }),
      expect.objectContaining({ path: 'thoughts', file: './routes/thoughts-index.tsx' }),
      expect.objectContaining({ path: 'thoughts/:slug', file: './routes/thought.tsx' }),
      expect.objectContaining({ path: 'memory', file: './routes/memory-index.tsx' }),
      expect.objectContaining({ path: 'memory/:slug', file: './routes/memory.tsx' }),
      expect.objectContaining({ path: 'search', file: './routes/search.tsx' }),
      expect.objectContaining({ path: 'tags/:tag', file: './routes/tag.tsx' }),
    ]));
    expect(routesModule.default).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'reviews/the-life-you-can-save' }),
    ]));
    expect(await configModule.default.prerender()).toContain('/thoughts/');
    expect(await configModule.default.prerender()).toContain(`/thoughts/${THOUGHT_ID}/`);
  }, 30_000);

  it('resolves the approved Vite pin from the React Router developer tool itself', () => {
    const candidateRequire = createRequire(join(candidateRoot, 'package.json'));
    const devPackagePath = candidateRequire.resolve('@react-router/dev/package.json');
    const devRequire = createRequire(devPackagePath);
    expect(devRequire('@react-router/dev/package.json').version).toBe('8.3.0');
    expect(devRequire('vite/package.json').version).toBe('8.2.2');
  });

  it('keeps index and Home hydration payloads bounded and excludes full MDX bodies', async () => {
    const [articlesIndex, reviewsIndex, home] = await Promise.all([
      candidateModule<any>('app/routes/articles-index.tsx'),
      candidateModule<any>('app/routes/reviews-index.tsx'),
      candidateModule<any>('app/routes/home.tsx'),
    ]);
    for (const data of [await articlesIndex.loader(), await reviewsIndex.loader()]) {
      expect(data.records.length).toBeGreaterThan(0);
      expect(data.records.every((record: Record<string, unknown>) => !Object.hasOwn(record, 'bodyHtml'))).toBe(true);
      expect(data.records.every((record: Record<string, unknown>) => !Object.hasOwn(record, 'memoryLinks'))).toBe(true);
      expect(data.records.every((record: Record<string, unknown>) => !Object.hasOwn(record, 'relationships'))).toBe(true);
    }
    const homeData = await home.loader();
    expect(Object.keys(homeData.hero).sort()).toEqual(['collection', 'description', 'href', 'id', 'title']);
    expect(Object.keys(homeData.picks.article).sort()).toEqual(['collection', 'description', 'href', 'id', 'title']);
    expect(Object.keys(homeData.picks.thought).sort()).toEqual(['collection', 'description', 'href', 'id', 'title']);
    expect(Object.keys(homeData.picks.review).sort()).toEqual([
      'collection', 'description', 'href', 'id', 'title', 'verdict',
    ]);
    expect(Object.keys(homeData.assets).sort()).toEqual(['hero', 'thought']);
    const serializedHome = JSON.stringify(homeData);
    for (const forbidden of ['body', 'bodyHtml', 'media', 'memoryLinks', 'relationships']) {
      expect(serializedHome).not.toContain(`"${forbidden}"`);
    }
    expect(serializedHome).not.toContain('Graphify는 분명 쓸모가 있다.');
    expect(serializedHome).not.toContain('AI 때문에 책을 읽기 시작했다.');
  });

  it('inlines route-scoped parity CSS and prioritizes the home LCP image', async () => {
    const root = await candidateModule<any>('app/root.tsx');
    const home = await candidateModule<any>('app/routes/home.tsx');
    const rootSource = await readFile(join(candidateRoot, 'app/root.tsx'), 'utf8');
    const [
      homeSource, articleSource, articlesIndexSource, reviewSource, reviewsIndexSource,
      memorySource, searchSource, thoughtSource, thoughtsIndexSource,
    ] = await Promise.all([
      readFile(join(candidateRoot, 'app/routes/home.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/article.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/articles-index.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/review.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/reviews-index.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/memory.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/search.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/thought.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/thoughts-index.tsx'), 'utf8'),
    ]);

    expect(rootSource).toContain("import('../src/ui/styles/tokens.css?inline')");
    expect(rootSource).toContain("import('../src/ui/styles/shell.css?inline')");
    expect(rootSource).toContain('import.meta.env.SSR');
    expect(rootSource).not.toContain('criticalCssForPath');
    expect(homeSource).toContain("import('../../src/ui/styles/route-home.css?inline')");
    expect(homeSource).not.toContain("route-scene.css?inline");
    expect(articlesIndexSource).toContain("import('../../src/ui/styles/route-index.css?inline')");
    expect(articleSource).toContain("import('../../src/ui/styles/route-detail.css?inline')");
    expect(articleSource).not.toMatch(/route-article\.css\?inline|reading\.css\?inline/u);
    expect(reviewsIndexSource).toContain("import('../../src/ui/styles/route-index.css?inline')");
    expect(reviewSource).toContain("import('../../src/ui/styles/route-detail.css?inline')");
    expect(reviewSource).not.toMatch(/route-review\.css\?inline|route-reading\.css\?inline|reading\.css\?inline/u);
    expect(thoughtsIndexSource).toContain("import('../../src/ui/styles/route-thought.css?inline')");
    expect(thoughtsIndexSource).not.toMatch(/route-reading\.css\?inline|reading\.css\?inline/u);
    expect(thoughtSource).toContain("import('../../src/ui/styles/route-detail.css?inline')");
    expect(thoughtSource).toContain("import('../../src/ui/styles/route-thought.css?inline')");
    expect(thoughtSource).not.toMatch(/route-reading\.css\?inline|reading\.css\?inline/u);
    expect(memorySource).toContain("import('../../src/ui/styles/route-memory.css?inline')");
    expect(memorySource).toContain("import('../../src/ui/styles/route-detail.css?inline')");
    expect(searchSource).toContain("import('../../src/ui/styles/route-search.css?inline')");
    expect(searchSource).not.toMatch(/route-(?:reading|collections|index|detail)\.css\?inline/u);
    expect(root.resolveCriticalCssForRender('route', null, 'tokens', 'shell'))
      .toBe('tokensshellroute');
    expect(root.resolveCriticalCssForRender('', 'server-rendered', '', ''))
      .toBe('server-rendered');
    expect(() => root.resolveCriticalCssForRender('', null, '', '')).toThrow(
      'Route-scoped critical CSS is unavailable',
    );
    expect(home.links()).toEqual([{
      rel: 'preload',
      as: 'image',
      href: '/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero-1536w.avif',
      type: 'image/avif',
      imageSrcSet: '/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero-1536w.avif 1536w',
      imageSizes: '(max-width: 767px) 100vw, (max-width: 1179px) 54vw, 710px',
      fetchPriority: 'high',
    }]);

    const criticalResources = renderToStaticMarkup(createElement('div', null, root.withoutModulePreloads([
      createElement('link', { key: 'module', rel: 'modulepreload', href: '/boot.js' }),
      createElement('script', { key: 'script', type: 'module' }, 'import("/boot.js")'),
      createElement('link', { key: 'image', rel: 'preload', as: 'image', href: '/lead.avif' }),
    ])));
    expect(criticalResources).not.toContain('rel="modulepreload"');
    expect(criticalResources).toContain('rel="preload"');
    expect(criticalResources).toContain('import("/boot.js")');
  });

  it('loads only the four page-specific public slices and emits incumbent metadata with clean canonicals', async () => {
    const home = await candidateModule<any>('app/routes/home.tsx');
    const article = await candidateModule<any>('app/routes/article.tsx');
    const review = await candidateModule<any>('app/routes/review.tsx');
    const memory = await candidateModule<any>('app/routes/memory.tsx');

    expect(article.meta({ data: undefined })).toEqual([]);
    expect(review.meta({ data: undefined })).toEqual([]);
    expect(memory.meta({ data: undefined })).toEqual([]);

    const homeData = await home.loader();
    const articleData = await article.loader({ params: { slug: ARTICLE_ID } });
    const reviewData = await review.loader({ params: { slug: REVIEW_ID } });
    const coverlessReviewData = await review.loader({ params: { slug: 'devotion-of-suspect-x' } });
    const memoryData = await memory.loader({ params: { slug: MEMORY_ID } });
    const verdictReviewData = await review.loader({ params: { slug: 'art-thief' } });

    expect(home.meta({ data: homeData })).toEqual([
      { title: 'FORM & THOUGHT' },
      { name: 'description', content: '서평과 아티클, 생각을 한 지면에서 골라 읽는 FORM & THOUGHT.' },
      { tagName: 'link', rel: 'canonical', href: `${LOCAL_ORIGIN}/` },
      { property: 'og:title', content: 'FORM & THOUGHT' },
      { property: 'og:description', content: '서평과 아티클, 생각을 한 지면에서 골라 읽는 FORM & THOUGHT.' },
      { property: 'og:url', content: `${LOCAL_ORIGIN}/` },
    ]);
    expect(article.meta({ data: articleData })).toContainEqual({
      tagName: 'link', rel: 'canonical', href: `${LOCAL_ORIGIN}/articles/${ARTICLE_ID}/`,
    });
    expect(review.meta({ data: reviewData })).toContainEqual({
      tagName: 'link', rel: 'canonical', href: `${LOCAL_ORIGIN}/reviews/${REVIEW_ID}/`,
    });
    expect(review.meta({ data: verdictReviewData })).toContainEqual({
      name: 'description', content: '예술 도둑은 중독에 관한 기록이다.',
    });
    expect(review.reviewCoverPreload(reviewData.coverAsset)).toBeNull();
    expect(review.reviewCoverPreload(coverlessReviewData.coverAsset)).toBeNull();
    expect(memory.meta({ data: memoryData })).toContainEqual({
      tagName: 'link', rel: 'canonical', href: `${LOCAL_ORIGIN}/memory/${MEMORY_ID}/`,
    });

    for (const data of [homeData, articleData, reviewData, memoryData]) {
      const serialized = JSON.stringify(data);
      expect(serialized).not.toMatch(/"releaseId"|"rendererVersion"|"jobPrompt"|"rawPrompt"|"privatePath"/u);
    }
    expect(JSON.stringify(articleData)).not.toContain('블랙스완');
    expect(JSON.stringify(reviewData)).not.toContain('AI 시대에, 나는 왜 책을 읽는가');
    expect(JSON.stringify(memoryData)).not.toContain('reading-desk-cobalt');
  });

  it('renders verified incumbent body, responsive media, and normal no-JS anchors for home/article/review/memory', async () => {
    const home = await candidateModule<any>('app/routes/home.tsx');
    const article = await candidateModule<any>('app/routes/article.tsx');
    const review = await candidateModule<any>('app/routes/review.tsx');
    const memory = await candidateModule<any>('app/routes/memory.tsx');

    const homeData = await home.loader();
    const articleData = await article.loader({ params: { slug: ARTICLE_ID } });
    const reviewData = await review.loader({ params: { slug: REVIEW_ID } });
    const memoryData = await memory.loader({ params: { slug: MEMORY_ID } });
    const homeHtml = renderToStaticMarkup(createElement(home.HomePresentation, { data: homeData }));
    const articleHtml = renderToStaticMarkup(createElement(article.ArticlePresentation, { data: articleData }));
    const reviewHtml = renderToStaticMarkup(createElement(review.ReviewPresentation, { data: reviewData }));
    const memoryHtml = renderToStaticMarkup(createElement(memory.MemoryPresentation, { data: memoryData }));

    expect(homeHtml).toContain(`href="/articles/${ARTICLE_ID}/"`);
    expect(homeHtml).toContain('class="form-home__hero"');
    expect(homeHtml).toContain('이 글 읽기');
    expect(homeHtml).toContain('href="/reviews/black-swan/"');
    expect(homeHtml).toContain('href="/articles/ai-design-references/"');
    expect(homeHtml).toContain('href="/thoughts/why-i-read-in-the-ai-era/"');
    expect(homeHtml).not.toMatch(/data-scene-object|focus=|살펴보기/u);
    expect(articleHtml).toContain('<h1>Graphify는 코드 이해를 정말 더 빠르게 만드는가?</h1>');
    expect(articleHtml).toContain('좋아요 · 준비 중');
    expect(articleHtml).toContain('<h2 id="continue-reading-title">이어서 읽기</h2>');
    expect(articleHtml).toContain('<a class="continue-reading__collection" href="/articles/">아티클 전체 보기</a>');
    expect(articleHtml).toContain('srcSet="/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-hero-1536w.avif 1536w');
    expect(articleHtml).toContain('width="1536" height="1024"');
    expect(articleHtml).toContain('Graphify는 분명 쓸모가 있다.');
    expect(reviewHtml).toContain('<h1>블랙스완</h1>');
    expect(reviewHtml).toContain('판본 확인 · 표지 공개 권리 미확인');
    expect(reviewHtml).toContain('<a class="continue-reading__collection" href="/reviews/">서평 전체 보기</a>');
    expect(reviewHtml).toContain('<a class="context-return" href="/reviews/">서평 목록으로</a>');
    expect(reviewHtml).not.toContain('/assets/content/reviews/black-swan/cover');
    expect(memoryHtml).toContain('href="/articles/lazycodex-agent-harness-analysis/"');
    expect(memoryHtml).toContain('href="/memory/agent-workflows-need-review-gates/"');
    for (const html of [homeHtml]) {
      expect(html).not.toContain('<title>');
      expect(html).not.toContain('<meta name="description"');
      expect(html).not.toContain('<link rel="canonical"');
    }
    expect(articleHtml).toContain(`<link rel="canonical" href="${LOCAL_ORIGIN}/articles/${ARTICLE_ID}/"/>`);
    expect(reviewHtml).toContain(`<link rel="canonical" href="${LOCAL_ORIGIN}/reviews/${REVIEW_ID}/"/>`);
    expect(memoryHtml).toContain(`<link rel="canonical" href="${LOCAL_ORIGIN}/memory/${MEMORY_ID}/"/>`);
    for (const html of [homeHtml, articleHtml, reviewHtml, memoryHtml]) {
      expect(html).not.toContain('data-discover=');
      expect(html).not.toContain('memory/thoughts');
    }
  }, 30_000);

  it('loads and renders the canonical thought index and detail from the verified release', async () => {
    const thought = await candidateModule<any>('app/routes/thought.tsx');
    const thoughtsIndex = await candidateModule<any>('app/routes/thoughts-index.tsx');

    expect(thought.meta({ data: undefined })).toEqual([]);
    const indexData = await thoughtsIndex.loader();
    const detailData = await thought.loader({ params: { slug: THOUGHT_ID } });

    expect(detailData.featuredAsset?.fallback.src).toBe(
      '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png',
    );
    expect(thought.meta({ data: detailData })).toEqual(expect.arrayContaining([
      { title: 'AI 시대에, 나는 왜 책을 읽는가 · FORM & THOUGHT' },
      {
        name: 'description',
        content: '지식에 도달하는 비용이 싸진 시대에, 더 많은 답을 모으기보다 답을 쉽게 믿지 않기 위해 책을 읽고 함께 읽는다.',
      },
      { tagName: 'link', rel: 'canonical', href: `${LOCAL_ORIGIN}/thoughts/${THOUGHT_ID}/` },
      { property: 'og:url', content: `${LOCAL_ORIGIN}/thoughts/${THOUGHT_ID}/` },
      { name: 'twitter:card', content: 'summary' },
    ]));
    await expect(thought.loader({ params: { slug: 'missing-thought' } })).rejects.toMatchObject({ status: 404 });

    const indexHtml = renderToStaticMarkup(createElement(
      thoughtsIndex.ThoughtsIndexPresentation,
      { data: indexData },
    ));
    const detailHtml = renderToStaticMarkup(createElement(thought.ThoughtPresentation, { data: detailData }));

    expect(indexHtml.match(/data-thought-cell=/gu)).toHaveLength(6);
    expect(indexHtml.match(new RegExp(`href="/thoughts/${THOUGHT_ID}/"`, 'gu'))).toHaveLength(1);
    expect(indexHtml.match(/data-thought-cell="empty"[^>]*aria-hidden="true"[^>]*inert=""/gu)).toHaveLength(5);
    expect(indexHtml).toContain('2026.08.16');
    expect(indexHtml).toContain('<picture>');
    expect(detailHtml).toContain('<h1>AI 시대에, 나는 왜 책을 읽는가</h1>');
    expect(detailHtml).toContain('AI 때문에 책을 읽기 시작했다.');
    expect(detailHtml).toContain('<time dateTime="2026-08-16T00:00:00.000Z">2026.08.16</time>');
    expect(detailHtml).toContain('좋아요 · 준비 중');
    expect(detailHtml).toContain('<a class="context-return" href="/thoughts/">생각 목록으로</a>');
    expect(detailHtml).not.toMatch(/article-toc|article-colophon/u);
    expect(detailHtml).toContain(`<link rel="canonical" href="${LOCAL_ORIGIN}/thoughts/${THOUGHT_ID}/"/>`);
    for (const html of [indexHtml, detailHtml]) {
      expect(html).toContain('href="/thoughts/" aria-current="page"');
    }
    for (const html of [indexHtml, detailHtml]) {
      expect(html).not.toContain('data-discover=');
      expect(html).not.toContain('memory/thoughts');
    }
  });

  it('loads one primary-only search corpus with a bounded GET query and fixed lane discovery records', async () => {
    const search = await candidateModule<any>('app/routes/search.tsx');
    const searchPage = await candidateModule<any>('src/ui/search/SearchPage.tsx');
    const keywordModule = await candidateModule<any>('src/ui/search/popularKeywords.ts');
    const data = await search.loader({ request: new Request('https://beyondwin.test/search/?q=%20Graphify%20') });

    expect(data.initialQuery).toBe('Graphify');
    expect(new Set(data.inventory.map((item: { kind: string }) => item.kind))).toEqual(
      new Set(['article', 'review', 'thought']),
    );
    expect(data.discovery.map((item: { kind: string }) => item.kind)).toEqual([
      'review', 'article', 'thought',
    ]);
    expect(data.inventory.every((item: { id: string }) => (
      /^(?:articles|reviews|thoughts)\//u.test(item.id)
    ))).toBe(true);
    const rawTagsByKeyword = new Map([
      ['독서', ['book']],
      ['서평', ['naver-archive']],
      ['AI', ['AI']],
      ['워크플로', ['workflow']],
      ['에이전트', ['agent', 'agents']],
      ['디자인', ['design']],
      ['검색', ['search']],
      ['데이터베이스', ['database']],
    ]);
    for (const keyword of keywordModule.popularKeywords(data.inventory)) {
      const query = new URL(keyword.href, 'https://beyondwin.test').searchParams.get('q');
      const rawTags = rawTagsByKeyword.get(keyword.label);
      expect(rawTags, `raw tags for ${keyword.label}`).toBeDefined();
      const countedRecordIds = data.inventory
        .filter((item: { topics: string[] }) => item.topics.some((tag) => rawTags!.includes(tag)))
        .map((item: { id: string }) => item.id);
      const matchedRecordIds = new Set(
        searchPage.searchMatches(data.inventory, query).map(({ item }: { item: { id: string } }) => item.id),
      );
      expect(countedRecordIds, keyword.label).toHaveLength(keyword.count);
      expect(countedRecordIds.every((id: string) => matchedRecordIds.has(id)), keyword.label).toBe(true);
    }

    const html = renderToStaticMarkup(createElement(search.SearchPresentation, { data }));
    expect(html).toContain('<title>검색 · FORM &amp; THOUGHT</title>');
    expect(html).toContain('content="서평, 아티클, 생각을 검색합니다."');
    expect(html).toContain('href="/search/" aria-current="page"');
    expect(html).not.toMatch(/>찾기<|>글<|>책<|>문장</u);
  });

  it('uses FORM & THOUGHT metadata for established article and review records', async () => {
    const article = await candidateModule<any>('app/routes/article.tsx');
    const review = await candidateModule<any>('app/routes/review.tsx');
    const articleData = await article.loader({ params: { slug: ESTABLISHED_ARTICLE_ID } });
    const reviewData = await review.loader({ params: { slug: REVIEW_ID } });

    expect(article.meta({ data: articleData })).toContainEqual({
      title: 'Graphify는 코드 이해를 정말 더 빠르게 만드는가? · FORM & THOUGHT',
    });
    expect(review.meta({ data: reviewData })).toContainEqual({
      title: '블랙스완 · FORM & THOUGHT',
    });
    expect(renderToStaticMarkup(createElement(article.ArticlePresentation, { data: articleData })))
      .toContain('<title>Graphify는 코드 이해를 정말 더 빠르게 만드는가? · FORM &amp; THOUGHT</title>');
    expect(renderToStaticMarkup(createElement(review.ReviewPresentation, { data: reviewData })))
      .toContain('<title>블랙스완 · FORM &amp; THOUGHT</title>');
  });

  it('uses FORM & THOUGHT metadata for Home', async () => {
    const home = await candidateModule<any>('app/routes/home.tsx');

    expect(home.meta()).toContainEqual({
      tagName: 'link', rel: 'canonical', href: 'https://form-thought.local.invalid/',
    });
    expect(home.meta()).toEqual([
      { title: 'FORM & THOUGHT' },
      { name: 'description', content: '서평과 아티클, 생각을 한 지면에서 골라 읽는 FORM & THOUGHT.' },
      { tagName: 'link', rel: 'canonical', href: `${LOCAL_ORIGIN}/` },
      { property: 'og:title', content: 'FORM & THOUGHT' },
      { property: 'og:description', content: '서평과 아티클, 생각을 한 지면에서 골라 읽는 FORM & THOUGHT.' },
      { property: 'og:url', content: `${LOCAL_ORIGIN}/` },
    ]);
  });

  it('contains no runtime API/client loader/source-private access or file-route convention', async () => {
    const appRoot = join(candidateRoot, 'app');
    const files = (await readdir(appRoot, { recursive: true }))
      .filter((path) => /\.(?:ts|tsx)$/u.test(path));
    expect(files).toEqual(expect.arrayContaining([
      'root.tsx',
      'routes.ts',
      'routes/home.tsx',
      'routes/article.tsx',
      'routes/review.tsx',
      'routes/memory.tsx',
      'routes/thoughts-index.tsx',
      'routes/thought.tsx',
    ]));
    for (const relativePath of files) {
      const source = await readFile(join(appRoot, relativePath), 'utf8');
      const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
      expect(source, relativePath).not.toMatch(/\b(?:action|headers|clientLoader|clientAction)\s*[=(]/u);
      expect(source, relativePath).not.toMatch(/\bfetch\s*\(/u);
      expect(imports.join('\n'), relativePath).not.toMatch(
        /@react-router\/fs-routes|(?:^|\/)src\/content|(?:^|\/)\.\.\/\.\.\/memory(?:\/|$)|memory\.public\.json/u,
      );
    }
  });
});
