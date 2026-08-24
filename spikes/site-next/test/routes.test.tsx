import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  loadVerifiedRelease,
  staticParamsForCollection,
  type CandidateRelease,
} from '../app/layout';
import HomePage, { HOME_METADATA } from '../app/page';
import ArticlePage, {
  ArticlePresentation,
  generateMetadata as generateArticleMetadata,
  generateStaticParams as generateArticleStaticParams,
} from '../app/articles/[slug]/page';
import ReviewPage, {
  ReviewPresentation,
  generateMetadata as generateReviewMetadata,
  generateStaticParams as generateReviewStaticParams,
} from '../app/reviews/[slug]/page';
import MemoryPage, {
  MemoryPresentation,
  generateMetadata as generateMemoryMetadata,
  generateStaticParams as generateMemoryStaticParams,
} from '../app/memory/[slug]/page';
import nextConfig from '../next.config';

const ARTICLE_ID = 'why-i-read-in-the-ai-era';
const REVIEW_ID = 'black-swan';
const MEMORY_ID = 'agent-harnesses-are-operating-systems';

describe('Next current-behavior route adapters', () => {
  it('keeps static export and clean-build identity deterministic', async () => {
    expect(nextConfig.output).toBe('export');
    expect(nextConfig.trailingSlash).toBe(true);
    expect(nextConfig.images).toEqual({ unoptimized: true });
    expect(await nextConfig.generateBuildId?.()).toBe('public-reading-continuity-next-v1');
  });

  it('reads the verified active immutable release and derives deterministic family params', async () => {
    const releasePromise = loadVerifiedRelease();
    expect(loadVerifiedRelease()).toBe(releasePromise);
    const release = await releasePromise;
    const expected = (collection: 'articles' | 'reviews' | 'memory') => Object.values(release.manifest.records)
      .filter((record) => record.collection === collection)
      .map((record) => ({ slug: record.id }))
      .sort((left, right) => left.slug.localeCompare(right.slug));

    expect(await generateArticleStaticParams()).toEqual(expected('articles'));
    expect(await generateReviewStaticParams()).toEqual(expected('reviews'));
    expect(await generateMemoryStaticParams()).toEqual(expected('memory'));
  });

  it('excludes draft, nonpublic, and mismatched-family records from params', () => {
    const fixture = {
      manifest: {
        records: {
          'articles/public': {
            collection: 'articles', id: 'public', href: '/articles/public/', status: 'published', draft: false,
          },
          'articles/draft': {
            collection: 'articles', id: 'draft', href: '/articles/draft/', status: 'published', draft: true,
          },
          'articles/review': {
            collection: 'articles', id: 'review', href: '/articles/review/', status: 'review', draft: false,
          },
          'reviews/wrong-family': {
            collection: 'reviews', id: 'wrong-family', href: '/reviews/wrong-family/', status: 'published', draft: false,
          },
        },
      },
    } as unknown as CandidateRelease;

    expect(staticParamsForCollection(fixture, 'articles')).toEqual([{ slug: 'public' }]);
  });

  it('emits exact incumbent metadata without candidate-only Open Graph fields', async () => {
    expect(HOME_METADATA).toEqual({
      title: '판단 · beyondwin',
      description: 'AI 시대에 무엇을 믿을지 판단하기 위해 읽고 연결한 글, 책, 문장.',
      alternates: { canonical: '/' },
    });
    expect(await generateArticleMetadata({ params: Promise.resolve({ slug: ARTICLE_ID }) })).toEqual({
      title: 'AI 시대에, 나는 왜 책을 읽는가 · beyondwin',
      description: '지식에 도달하는 비용이 싸진 시대에, 더 많은 답을 모으기보다 답을 쉽게 믿지 않기 위해 책을 읽고 함께 읽는다.',
      alternates: { canonical: `/articles/${ARTICLE_ID}/` },
    });
    expect(await generateReviewMetadata({ params: Promise.resolve({ slug: REVIEW_ID }) })).toEqual({
      title: '블랙스완 · beyondwin',
      description: '우리는 현실을 보는가, 현실에 대해 만든 이야기를 보는가.',
      alternates: { canonical: `/reviews/${REVIEW_ID}/` },
    });
    expect(await generateMemoryMetadata({ params: Promise.resolve({ slug: MEMORY_ID }) })).toEqual({
      title: '코딩 에이전트 하네스의 가치는 모델 성능보다 작업 순서와 검증 습관을 강제하는 데 있다. · beyondwin',
      description: 'The value of a coding-agent harness is less about model intelligence and more about enforcing work order and verification habits.',
      alternates: { canonical: `/memory/${MEMORY_ID}/` },
    });
  });

  it('hands verified records to pure candidate-local presentations with incumbent links and media contracts', async () => {
    const release = await loadVerifiedRelease();
    const article = release.manifest.records[`articles/${ARTICLE_ID}`];
    const review = release.manifest.records[`reviews/${REVIEW_ID}`];
    const memory = release.manifest.records[`memory/${MEMORY_ID}`];
    if (article?.collection !== 'articles' || review?.collection !== 'reviews' || memory?.collection !== 'memory') {
      throw new Error('Decision records are absent from the verified public release');
    }

    const articleHtml = renderToStaticMarkup(createElement(ArticlePresentation, { record: article, release }));
    const reviewHtml = renderToStaticMarkup(createElement(ReviewPresentation, { record: review, release }));
    const memoryHtml = renderToStaticMarkup(createElement(MemoryPresentation, { record: memory }));

    expect(articleHtml).toContain('<h1>AI 시대에, 나는 왜 책을 읽는가</h1>');
    expect(articleHtml).toContain('srcset="/assets/content/articles/why-i-read-in-the-ai-era/judgment-scale-720w.avif 720w');
    expect(articleHtml).toContain('width="1536" height="1024"');
    expect(articleHtml).toContain('많아진 답과, 그 답을 어떻게 받아들일지에 대한 판단');
    expect(articleHtml).not.toContain('href="/articles/why-i-read-in-the-ai-era/"');
    expect(reviewHtml).toContain('<h1 class="book-title">블랙스완</h1>');
    expect(reviewHtml).toContain('width="458" height="671"');
    expect(memoryHtml).toContain('href="/articles/lazycodex-agent-harness-analysis/"');
    expect(memoryHtml).toContain('href="/memory/agent-workflows-need-review-gates/"');
  });

  it('keeps page entry points server-only and returns candidate-local presentation output', async () => {
    for (const page of [HomePage, ArticlePage, ReviewPage, MemoryPage]) expect(page).toBeTypeOf('function');
    expect(renderToStaticMarkup(await HomePage())).toContain('href="/articles/why-i-read-in-the-ai-era/"');
    expect(renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ slug: ARTICLE_ID }) })))
      .toContain('<h1>AI 시대에, 나는 왜 책을 읽는가</h1>');
    expect(renderToStaticMarkup(await ReviewPage({ params: Promise.resolve({ slug: REVIEW_ID }) })))
      .toContain('<h1 class="book-title">블랙스완</h1>');
    expect(renderToStaticMarkup(await MemoryPage({ params: Promise.resolve({ slug: MEMORY_ID }) })))
      .toContain('이 문장이 나온 글');
  });

  it('has no client runtime directives or direct source/private imports in the candidate', async () => {
    const appRoot = join(process.cwd(), 'spikes/site-next/app');
    const files = (await readdir(appRoot, { recursive: true }))
      .filter((path) => /\.(?:ts|tsx)$/u.test(path));
    expect(files.some((path) => /(?:^|\/)route\.tsx?$/u.test(path))).toBe(false);
    expect(files.some((path) => /(?:^|\/)middleware\.tsx?$/u.test(path))).toBe(false);
    for (const relativePath of files) {
      const source = await readFile(join(appRoot, relativePath), 'utf8');
      const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
      expect(source, relativePath).not.toMatch(/^\s*['"]use client['"]/mu);
      expect(source, relativePath).not.toMatch(/^\s*['"]use server['"]/mu);
      expect(source, relativePath).not.toMatch(/\b(?:revalidate|runtime)\s*=/u);
      expect(source, relativePath).not.toMatch(/\bfetch\s*\(/u);
      expect(imports, relativePath).not.toContain('next/image');
      expect(imports, relativePath).not.toContain('next/headers');
      expect(imports, relativePath).not.toContain('next/cookies');
      expect(imports.join('\n'), relativePath).not.toMatch(/(?:^|\/)src\/content|(?:^|\/)memory(?:\/|$)|memory\.public\.json/u);
    }
  });
});
