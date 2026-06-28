import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateArticleDirectory, validateArticleMarkdown } from './article-quality.mjs';

const validArticle = `---
title: "LazyCodex"
description: "Source-grounded article."
createdAt: "2026-06-25"
updatedAt: "2026-06-25"
tags: ["AI", "source-grounded"]
status: "published"
---

LazyCodex를 한 문장으로 줄이면 출처 기반 분석이 먼저 필요하다는 것이다.

## 먼저 알아야 할 개념

개념 설명입니다.

## 실제 구조

구조 설명입니다.

## 핵심 기능

기능 설명입니다.

## 좋은 점

장점 설명입니다.

## 조심해야 할 점

리스크 설명입니다.

## 언제 쓰면 좋은가

도입 기준입니다.

## 주니어 개발자가 배울 점

학습 포인트입니다.

## 내 결론

결론입니다.

## 확인한 자료

- https://example.com
`;

describe('article quality gate', () => {
  it('accepts a complete source-grounded article', () => {
    expect(validateArticleMarkdown('src/content/articles/lazycodex.mdx', validArticle)).toEqual([]);
  });

  it('ignores ordinary articles without the source-grounded tag', () => {
    const markdown = validArticle.replace('tags: ["AI", "source-grounded"]', 'tags: ["AI"]');
    expect(validateArticleMarkdown('src/content/articles/ordinary.mdx', markdown)).toEqual([]);
  });

  it('requires the core source-grounded sections', () => {
    const markdown = validArticle.replace('## 확인한 자료', '## Sources');
    expect(validateArticleMarkdown('src/content/articles/bad.mdx', markdown)).toContain(
      'src/content/articles/bad.mdx: source-grounded article must include heading "## 확인한 자료"',
    );
  });

  it('rejects placeholder markers and repeated headings', () => {
    const marker = `TO${'DO'}`;
    const markdown = `${validArticle}\n## 내 결론\n\n${marker}`;
    const errors = validateArticleMarkdown('src/content/articles/bad.mdx', markdown);

    expect(errors).toContain(`src/content/articles/bad.mdx: source-grounded article contains placeholder marker "${marker}"`);
    expect(errors).toContain('src/content/articles/bad.mdx: duplicate heading "## 내 결론"');
  });

  it('validates a directory of articles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'article-quality-'));

    try {
      await mkdir(join(root, 'src/content/articles'), { recursive: true });
      await writeFile(join(root, 'src/content/articles/good.mdx'), validArticle);
      await writeFile(join(root, 'src/content/articles/bad.mdx'), validArticle.replace('## 좋은 점', '## 장점'));

      const errors = await validateArticleDirectory(root);

      expect(errors).toEqual([
        'src/content/articles/bad.mdx: source-grounded article must include heading "## 좋은 점"',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
