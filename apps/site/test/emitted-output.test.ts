import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const candidateRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(candidateRoot, '../..');
const execFileAsync = promisify(execFile);
let homeHtml = '';
let homeData = '';
let articlesIndexHtml = '';
let articleHtml = '';
let reviewsIndexHtml = '';
let reviewHtml = '';
let memoryHtml = '';
let thoughtsIndexHtml = '';
let thoughtHtml = '';
let searchHtml = '';
let searchData = '';
let searchJavascript = '';
let memoryMapHtml = '';

const ARTICLE_IDS = [
  'agents-md-vs-agent-skills-evidence', 'ai-design-references', 'andrej-karpathy-skills-analysis',
  'aws-static-frontend-serverless-bff', 'codex-ui-mockup-workflow', 'context-refinement-system-design',
  'graphify-code-knowledge-graph-deep-dive', 'hermes-agent-persistent-worker-runtime',
  'karpathy-delete-everything-keep-graph', 'lazycodex-agent-harness-analysis', 'oh-my-pi-deep-review',
  'open-design-repo-analysis', 'pgvector-hybrid-search', 'ponytail-agent-minimalism-analysis',
  'postgresql-bm25-pg-search', 'shared-ai-conversation-evidence-boundaries',
  'uncle-bob-ai-code-review-evidence',
] as const;

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'u'))?.[1];
}

function srcSetCandidates(value: string | undefined): string[] {
  return value?.split(',').map((candidate) => candidate.trim().split(/\s+/u)[0] ?? '')
    .filter(Boolean) ?? [];
}

beforeAll(async () => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is required for the ordinary emitted-output build');
  await execFileAsync(process.execPath, [
    npmCli,
    'run',
    'build',
    '--workspace',
    '@beyondwin/site',
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  [
    homeHtml, homeData, articlesIndexHtml, articleHtml, reviewsIndexHtml, reviewHtml,
    memoryHtml, thoughtsIndexHtml, thoughtHtml, searchHtml, searchData, memoryMapHtml,
  ] = await Promise.all([
    readFile(join(candidateRoot, 'build/client/index.html'), 'utf8'),
    readFile(join(candidateRoot, 'build/client/_.data'), 'utf8'),
    readFile(join(candidateRoot, 'build/client/articles/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/articles/graphify-code-knowledge-graph-deep-dive/index.html',
    ), 'utf8'),
    readFile(join(candidateRoot, 'build/client/reviews/index.html'), 'utf8'),
    readFile(join(candidateRoot, 'build/client/reviews/black-swan/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/memory/agent-harnesses-are-operating-systems/index.html',
    ), 'utf8'),
    readFile(join(candidateRoot, 'build/client/thoughts/index.html'), 'utf8'),
    readFile(join(
      candidateRoot,
      'build/client/thoughts/why-i-read-in-the-ai-era/index.html',
    ), 'utf8'),
    readFile(join(candidateRoot, 'build/client/search/index.html'), 'utf8'),
    readFile(join(candidateRoot, 'build/client/search/_.data'), 'utf8'),
    readFile(join(candidateRoot, 'build/client/memory/map/index.html'), 'utf8'),
  ]);
  const searchAssets = (await readdir(join(candidateRoot, 'build/client/assets')))
    .filter((name) => /^search-[^.]+\.js$/u.test(name));
  expect(searchAssets).toHaveLength(1);
  searchJavascript = await readFile(join(candidateRoot, 'build/client/assets', searchAssets[0]!), 'utf8');
}, 120_000);

describe('React Router emitted critical output', () => {
  it('emits a bounded Home payload and canonicalizes the compatibility redirect to its destination', () => {
    for (const output of [homeHtml, homeData]) {
      for (const forbidden of ['bodyHtml', 'memoryLinks', 'relationships']) {
        expect(output).not.toContain(forbidden);
      }
      expect(output).not.toContain('Graphify는 분명 쓸모가 있다.');
      expect(output).not.toContain('AI 때문에 책을 읽기 시작했다.');
    }
    expect(homeHtml).toContain('<link rel="canonical" href="https://form-thought.local.invalid/"/>');
    expect(homeHtml).toContain('<meta property="og:url" content="https://form-thought.local.invalid/"/>');
    expect(memoryMapHtml).toContain(
      '<link rel="canonical" href="https://form-thought.local.invalid/memory/">',
    );
    expect(memoryMapHtml).toContain(
      '<meta property="og:url" content="https://form-thought.local.invalid/memory/">',
    );
    expect(memoryMapHtml).not.toContain('form-thought.local.invalid/memory/map/');
  });

  it('keeps the eager Framework bootstrap without dead activation output', () => {
    const moduleScripts = [...homeHtml.matchAll(
      /<script\b(?=[^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/gu,
    )];

    expect(moduleScripts).toHaveLength(1);
    expect(moduleScripts[0]?.[0]).toContain('async=""');
    expect(moduleScripts[0]?.[1]).toContain('window.__reactRouterRouteModules');
    expect(moduleScripts[0]?.[1]).toMatch(/import\("\/assets\/entry\.client-[^"]+\.js"\);/u);
    expect(homeHtml).not.toContain('application/react-router-deferred');
    expect(homeHtml).not.toContain('requestAnimationFrame(() => setTimeout');
  });

  it('emits one route-scoped critical style while preserving eager Framework bootstrap and shared rules', () => {
    const routeHtml = {
      home: homeHtml,
      articlesIndex: articlesIndexHtml,
      articleDetail: articleHtml,
      reviewsIndex: reviewsIndexHtml,
      reviewDetail: reviewHtml,
      memoryDetail: memoryHtml,
      thoughtsIndex: thoughtsIndexHtml,
      thoughtDetail: thoughtHtml,
      search: searchHtml,
    };
    const routeCss = Object.fromEntries(Object.entries(routeHtml).map(([route, html]) => {
      const styles = [...html.matchAll(
        /<style data-critical-css="true">([\s\S]*?)<\/style>/gu,
      )];
      expect(styles).toHaveLength(1);
      const stylesheets = [...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*>/gu)];
      expect(stylesheets).toHaveLength(1);
      expect(stylesheets[0]?.[0]).toMatch(/href="\/assets\/SiteShell-[^"]+\.css"/u);
      expect(html).not.toContain('rel="modulepreload"');
      expect(html).not.toContain('application/react-router-deferred');
      expect(html).not.toContain('requestAnimationFrame(() => setTimeout');
      const modules = [...html.matchAll(
        /<script\b(?=[^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/gu,
      )];
      expect(modules).toHaveLength(1);
      expect(modules[0]?.[0]).toContain('async=""');
      expect(modules[0]?.[1]).toContain('window.__reactRouterRouteModules');
      expect(modules[0]?.[1]).toMatch(/import\("\/assets\/entry\.client-[^"]+\.js"\);/u);
      expect(styles[0]?.[1]).toContain('.site-header__inner');
      expect(styles[0]?.[1]).toContain(':where(a,button,input,select,summary,textarea):focus-visible');
      expect(styles[0]?.[1]).toContain('@media (prefers-reduced-motion:reduce)');
      return [route, styles[0]?.[1] ?? ''];
    })) as Record<keyof typeof routeHtml, string>;

    expect(routeCss.home).toContain('.form-home__hero');
    expect(routeCss.home).not.toMatch(/\.reading-sheet|\.reading-threshold|\.public-scene/u);
    expect(routeCss.articlesIndex).toContain('.article-topic-filter');
    expect(routeCss.articlesIndex).not.toContain('.reading-sheet');
    expect(routeCss.articleDetail).toContain('.article-toc');
    expect(routeCss.articleDetail).not.toMatch(/\.reading-sheet|\.reading-threshold|\.public-scene/u);
    expect(routeCss.reviewsIndex).toContain('.article-topic-filter');
    expect(routeCss.reviewsIndex).toContain('.review-index');
    expect(routeCss.reviewsIndex).not.toContain('.reading-sheet');
    expect(routeCss.reviewDetail).toContain('.review-detail__verdict');
    expect(routeCss.reviewDetail).toContain('.review-detail__cover-stage');
    expect(routeCss.thoughtsIndex).toContain('.thought-index__grid');
    expect(routeCss.thoughtsIndex).not.toMatch(/\.article-topic-filter|\.reading-sheet/u);
    expect(routeCss.thoughtDetail).toContain('.editorial-detail-frame__prose .prose');
    expect(routeCss.thoughtDetail).toContain('.thought-detail__type');
    expect(routeCss.thoughtDetail).not.toContain('.reading-threshold');
    expect(routeCss.memoryDetail).toContain('.memory-thought');
    expect(routeCss.memoryDetail).toContain('.editorial-detail-frame__prose .prose');
    expect(routeCss.memoryDetail).not.toMatch(/\.reading-threshold|\.context-return/u);
    expect(routeCss.search).toContain('.second-brain-search__stage');
    expect(routeCss.search).toContain('.evidence-panel');
    expect(routeCss.search).not.toContain('.search-discovery-card');
    expect(routeCss.search).not.toMatch(/\.article-topic-filter|\.article-colophon/u);
    for (const css of Object.values(routeCss)) expect(css).toContain('.visually-hidden');
    expect(routeCss.home.length).toBeLessThan(10_000);
    expect(routeCss.articleDetail.length).toBeLessThan(12_000);
    for (const [route, css] of Object.entries(routeCss)) {
      if (route !== 'search') expect(css.length).toBeLessThan(18_000);
    }
    expect(routeCss.search.length).toBeLessThan(29_000);
    expect(gzipSync(routeCss.search).byteLength).toBeLessThan(6_500);
    const imagePreload = homeHtml.match(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/u)?.[0];
    expect(imagePreload).toContain('href="/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero-1536w.avif"');
    expect(imagePreload).toContain('imageSizes="(max-width: 767px) 100vw, (max-width: 1179px) 54vw, 710px"');
    expect(imagePreload).toContain('fetchPriority="high"');
  });

  it('copies the approved second-brain avatar without changing its bytes', async () => {
    const avatar = await readFile(join(
      candidateRoot,
      'build/client/images/form-and-thought-agent-avatar-v1.png',
    ));
    expect(avatar).toHaveLength(1_872_261);
    expect(createHash('sha256').update(avatar).digest('hex')).toBe(
      'f29c064b1c0f77e5906a9c02e5b8e0a573ae6c44373b99fb75532c90fd481f20',
    );
    expect(searchHtml).toContain('src="/images/form-and-thought-agent-avatar-v1.png"');
    expect(searchHtml).not.toMatch(/search-avatar-derivative|form-and-thought-agent-avatar-v1\.(?:avif|webp)/u);
    for (const derivative of [
      'form-and-thought-agent-avatar-v1.avif',
      'form-and-thought-agent-avatar-v1.webp',
    ]) {
      await expect(access(join(candidateRoot, 'build/client/images', derivative))).rejects.toThrow();
    }
  });

  it('keeps both emitted search payloads free of private material and rejected agent labels', () => {
    for (const output of [searchHtml, searchData]) {
      expect(output).not.toMatch(
        /bodyHtml|privatePath|sourcePath|memory\/|\/Users\/|src\/content\//u,
      );
      expect(output).not.toMatch(/AI 대리인|AI DELEGATE|MIND 01/u);
    }
    expect(searchJavascript).not.toMatch(
      /publicSecondBrainFixture|fixtureAnswer|rollbackEvidence|OPENAI_API_KEY|api\.openai\.com|\/Users\/|src\/content\/|memory\/\*\*|(?:\.\.\/)+memory\/|privatePath|sourcePath|search-avatar-derivative/iu,
    );
  });

  it('emits one complete no-JS search shell with ID-only provider binding', () => {
    expect(searchHtml.match(/class="site-shell"/gu)).toHaveLength(1);
    expect(searchHtml.match(/class="skip-link" href="#main-content"/gu)).toHaveLength(1);
    expect(searchHtml.match(/class="site-header(?:\s|")/gu)).toHaveLength(1);
    for (const href of ['/reviews/', '/articles/', '/thoughts/', '/search/']) {
      expect(searchHtml).toContain(`href="${href}"`);
    }
    expect(searchHtml).not.toContain('<footer');
    expect(searchHtml).toContain('공개 기록에 무엇을 묻고 싶나요?');
    expect(searchHtml).not.toContain('제 기록에 무엇을 묻고 싶나요?');
    expect(searchHtml).toContain('action="/search/" method="get"');
    expect(searchHtml).toContain('name="q"');
    expect(searchHtml).toMatch(/maxlength="120"/iu);
    expect(searchHtml).toContain('<details class="question-composer__privacy">');
    expect(searchHtml).toContain('현재 질문과 선택된 공개 기록 발췌');
    expect(searchHtml).toContain('원문 질문의 서버 보관 기간은 0일');
    expect(searchHtml).not.toMatch(/production ZDR|ZDR.{0,30}(?:verified|검증)/iu);

    expect(searchData.match(/contentReleaseId/gu)).toHaveLength(1);
    expect(searchData.match(/answerReleaseId/gu)).toHaveLength(1);
    for (const output of [searchHtml, searchData]) {
      expect(output).not.toMatch(
        /publicSecondBrainFixture|fixtureAnswer|rollbackEvidence|providerUrl|apiKey|chunkChecksum|evidenceChecksum|claims\s*[:",]|\/Users\/|src\/content\/|memory\*\*|memory\//iu,
      );
    }
  });

  it('keeps the no-JS article document as a complete ledger with six canonical filter anchors', () => {
    expect(articlesIndexHtml.match(/class="editorial-list-row(?:\s|"|--)/gu)).toHaveLength(17);
    for (const id of ARTICLE_IDS) {
      expect(articlesIndexHtml).toContain(`href="/articles/${id}/"`);
    }
    expect(articlesIndexHtml).toContain('href="/articles/" aria-current="page"');
    for (const topic of ['에이전트', '디자인', '데이터', '아키텍처', '검증']) {
      expect(articlesIndexHtml).toContain(`href="/articles/?topic=${encodeURIComponent(topic)}"`);
    }
    expect(articlesIndexHtml).not.toMatch(/article-index__ledger[^>]*(?:hidden|display:\s*none)/u);
  });

  it('emits canonical thought pages and excludes the removed review compatibility page', async () => {
    expect(thoughtsIndexHtml).toContain('<title>생각 · FORM &amp; THOUGHT</title>');
    expect(thoughtsIndexHtml).toContain('href="/thoughts/why-i-read-in-the-ai-era/"');
    expect(thoughtHtml).toContain('<title>AI 시대에, 나는 왜 책을 읽는가 · FORM &amp; THOUGHT</title>');
    expect(thoughtHtml).toContain('<link rel="canonical" href="https://form-thought.local.invalid/thoughts/why-i-read-in-the-ai-era/"/>');
    expect(thoughtHtml).toContain('AI 때문에 책을 읽기 시작했다.');
    expect(thoughtHtml).toContain('<meta name="theme-color" content="#F2EFE9"/>');
    await expect(access(join(
      candidateRoot,
      'build/client/reviews/the-life-you-can-save/index.html',
    ))).rejects.toThrow();
  });

  it('emits FORM & THOUGHT titles for the established article and review routes', () => {
    expect(articleHtml).toContain('<title>Graphify는 코드 이해를 정말 더 빠르게 만드는가? · FORM &amp; THOUGHT</title>');
    expect(reviewHtml).toContain('<title>블랙스완 · FORM &amp; THOUGHT</title>');
  });

  it('preloads only AVIF candidates declared by the lead picture and present in static output', async () => {
    const imagePreload = homeHtml.match(
      /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/u,
    )?.[0];
    const leadPicture = homeHtml.match(
      /<picture><source\b[^>]*type="image\/avif"[^>]*editorial-home-hero[^>]*>[\s\S]*?<\/picture>/u,
    )?.[0];
    const avifSource = leadPicture?.match(/<source\b[^>]*type="image\/avif"[^>]*>/u)?.[0];

    expect(imagePreload).toBeDefined();
    expect(avifSource).toBeDefined();
    const preloadCandidates = srcSetCandidates(attribute(imagePreload ?? '', 'imageSrcSet'));
    const pictureCandidates = srcSetCandidates(attribute(avifSource ?? '', 'srcSet'));
    expect(preloadCandidates).toEqual(pictureCandidates);
    expect(preloadCandidates).toContain(attribute(imagePreload ?? '', 'href'));

    for (const candidate of preloadCandidates) {
      await expect(access(join(candidateRoot, 'build/client', candidate.replace(/^\//u, ''))))
        .resolves.toBeUndefined();
    }
  });

  it('does not emit or preload warning-state review cover bytes', () => {
    const imagePreload = reviewHtml.match(
      /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/u,
    )?.[0];
    const picture = reviewHtml.match(/<picture>[\s\S]*?<\/picture>/u)?.[0];

    expect(imagePreload).toBeUndefined();
    expect(picture).toBeUndefined();
    expect(reviewHtml).not.toContain('/assets/content/reviews/');
    expect(reviewHtml).toContain('판본 확인 · 표지 공개 권리 미확인');
  });

  it('keeps inlined critical CSS out of the hydration chunks', async () => {
    const assetRoot = join(candidateRoot, 'build/client/assets');
    const javascriptAssets = (await readdir(assetRoot)).filter((file) => file.endsWith('.js'));
    const assets = await Promise.all(javascriptAssets.map(async (file) => ({
      file,
      source: await readFile(join(assetRoot, file), 'utf8'),
    })));
    const rootAssets = assets.filter(({ source }) => source.includes('data-critical-css'));

    expect(rootAssets).toHaveLength(1);
    expect(rootAssets[0]?.source).not.toContain('.site-header__inner{');
    expect(rootAssets[0]?.source).not.toContain('.form-home__hero{');
    expect(rootAssets[0]?.source).not.toContain('.article-toc{');
    expect(rootAssets[0]?.source).not.toContain('.memory-thought');
    expect(rootAssets[0]?.source).not.toContain('.context-return{');

    const bundledCriticalCss = [
      '.site-header__inner{',
      '.form-home__hero{',
      '.article-toc{',
      '.memory-thought{',
      '.context-return{',
    ];
    const bundledJavascript = assets.map(({ source }) => source).join('\n');
    for (const pattern of bundledCriticalCss) {
      expect(bundledJavascript).not.toContain(pattern);
    }
  });
});
