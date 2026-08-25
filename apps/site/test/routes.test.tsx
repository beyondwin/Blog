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

const ARTICLE_ID = 'why-i-read-in-the-ai-era';
const REVIEW_ID = 'black-swan';
const MEMORY_ID = 'agent-harnesses-are-operating-systems';
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
      decisionSlicePaths(release: VerifiedActivePublicRelease): string[];
    }>('app/release.server.ts');

    expect(configModule.default.ssr).toBe(false);
    const release = await releaseModule.loadVerifiedRelease();
    expect(await configModule.default.prerender()).toEqual(releaseModule.decisionSlicePaths(release));
    expect(routesModule.default).toEqual([
      expect.objectContaining({ index: true, file: './routes/home.tsx' }),
      expect.objectContaining({ path: 'articles/:slug', file: './routes/article.tsx' }),
      expect.objectContaining({ path: 'reviews/:slug', file: './routes/review.tsx' }),
      expect.objectContaining({ path: 'memory/:slug', file: './routes/memory.tsx' }),
    ]);
  });

  it('resolves the approved Vite pin from the React Router developer tool itself', () => {
    const candidateRequire = createRequire(join(candidateRoot, 'package.json'));
    const devPackagePath = candidateRequire.resolve('@react-router/dev/package.json');
    const devRequire = createRequire(devPackagePath);
    expect(devRequire('@react-router/dev/package.json').version).toBe('8.3.0');
    expect(devRequire('vite/package.json').version).toBe('8.2.2');
  });

  it('inlines route-scoped parity CSS and prioritizes the home LCP image', async () => {
    const root = await candidateModule<any>('app/root.tsx');
    const home = await candidateModule<any>('app/routes/home.tsx');
    const rootSource = await readFile(join(candidateRoot, 'app/root.tsx'), 'utf8');
    const [homeSource, articleSource, reviewSource, memorySource] = await Promise.all([
      readFile(join(candidateRoot, 'app/routes/home.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/article.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/review.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/memory.tsx'), 'utf8'),
    ]);
    const [tokens, shell, scene, reading, articleCss, reviewCss, memoryCss] = await Promise.all([
      readFile(join(candidateRoot, 'src/ui/styles/tokens.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/shell.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-scene.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-reading.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-article.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-review.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-memory.css'), 'utf8'),
    ]);
    const cssSources = {
      tokens,
      shell,
      scene,
      reading,
      article: articleCss,
      review: reviewCss,
      memory: memoryCss,
    };

    expect(rootSource).toContain("import('../src/ui/styles/tokens.css?inline')");
    expect(rootSource).toContain("import('../src/ui/styles/shell.css?inline')");
    expect(rootSource).toContain('import.meta.env.SSR');
    expect(homeSource).toContain("import('../../src/ui/styles/route-scene.css?inline')");
    expect(articleSource).toContain("import('../../src/ui/styles/route-article.css?inline')");
    expect(reviewSource).toContain("import('../../src/ui/styles/route-review.css?inline')");
    expect(memorySource).toContain("import('../../src/ui/styles/route-memory.css?inline')");
    expect(root.criticalCssForPath('/', cssSources)).toContain('.public-scene');
    expect(root.criticalCssForPath('/', cssSources)).not.toContain('.reading-sheet');
    expect(root.criticalCssForPath(`/articles/${ARTICLE_ID}/`, cssSources)).toContain('.reading-sheet');
    expect(root.criticalCssForPath(`/articles/${ARTICLE_ID}/`, cssSources)).toContain('.article-masthead');
    expect(root.criticalCssForPath(`/articles/${ARTICLE_ID}/`, cssSources)).not.toContain('.book-sheet');
    expect(root.criticalCssForPath(`/reviews/${REVIEW_ID}/`, cssSources)).toContain('.book-sheet');
    expect(root.criticalCssForPath(`/reviews/${REVIEW_ID}/`, cssSources)).not.toContain('.memory-thought');
    expect(root.criticalCssForPath(`/memory/${MEMORY_ID}/`, cssSources)).toContain('.memory-thought');
    expect(root.criticalCssForPath(`/memory/${MEMORY_ID}/`, cssSources)).not.toContain('.article-masthead');
    expect(root.criticalCssForPath(`/articles/${ARTICLE_ID}/`, cssSources)).not.toContain('.public-scene');
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
      href: '/assets/content/articles/why-i-read-in-the-ai-era/reading-desk-cobalt-1536w.avif',
      type: 'image/avif',
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
    const memoryData = await memory.loader({ params: { slug: MEMORY_ID } });

    expect(home.meta({ data: homeData })).toEqual([
      { title: '판단 · beyondwin' },
      { name: 'description', content: 'AI 시대에 무엇을 믿을지 판단하기 위해 읽고 연결한 글, 책, 문장.' },
      { tagName: 'link', rel: 'canonical', href: '/' },
    ]);
    expect(article.meta({ data: articleData })).toContainEqual({
      tagName: 'link', rel: 'canonical', href: `/articles/${ARTICLE_ID}/`,
    });
    expect(review.meta({ data: reviewData })).toContainEqual({
      tagName: 'link', rel: 'canonical', href: `/reviews/${REVIEW_ID}/`,
    });
    expect(memory.meta({ data: memoryData })).toContainEqual({
      tagName: 'link', rel: 'canonical', href: `/memory/${MEMORY_ID}/`,
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
    expect(homeHtml).toContain('data-scene-object="reading-desk-cobalt"');
    expect(articleHtml).toContain('<h1>AI 시대에, 나는 왜 책을 읽는가</h1>');
    expect(articleHtml).toContain('srcset="/assets/content/articles/why-i-read-in-the-ai-era/judgment-scale-720w.avif 720w');
    expect(articleHtml).toContain('width="1536" height="1024"');
    expect(articleHtml).toContain('많아진 답과, 그 답을 어떻게 받아들일지에 대한 판단');
    expect(reviewHtml).toContain('<h1 class="book-title">블랙스완</h1>');
    expect(reviewHtml).toContain('width="458" height="671"');
    expect(memoryHtml).toContain('href="/articles/lazycodex-agent-harness-analysis/"');
    expect(memoryHtml).toContain('href="/memory/agent-workflows-need-review-gates/"');
    for (const html of [homeHtml]) {
      expect(html).not.toContain('<title>');
      expect(html).not.toContain('<meta name="description"');
      expect(html).not.toContain('<link rel="canonical"');
    }
    expect(articleHtml).toContain(`<link rel="canonical" href="/articles/${ARTICLE_ID}/"/>`);
    expect(reviewHtml).toContain(`<link rel="canonical" href="/reviews/${REVIEW_ID}/"/>`);
    expect(memoryHtml).toContain(`<link rel="canonical" href="/memory/${MEMORY_ID}/"/>`);
    for (const html of [homeHtml, articleHtml, reviewHtml, memoryHtml]) {
      expect(html).not.toContain('data-discover=');
      expect(html).not.toContain('memory/thoughts');
    }
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
    ]));
    for (const relativePath of files) {
      const source = await readFile(join(appRoot, relativePath), 'utf8');
      const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
      expect(source, relativePath).not.toMatch(/\b(?:action|headers|clientLoader|clientAction)\s*[=(]/u);
      expect(source, relativePath).not.toMatch(/\bfetch\s*\(/u);
      expect(imports.join('\n'), relativePath).not.toMatch(
        /@react-router\/fs-routes|(?:^|\/)src\/content|(?:^|\/)memory(?:\/|$)|memory\.public\.json/u,
      );
    }
  });
});
