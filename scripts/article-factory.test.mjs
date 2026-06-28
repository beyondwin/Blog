import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildArticleMarkdown,
  buildPacketMarkdown,
  classifyInput,
  createArticleFactoryFiles,
  slugifyTitle,
} from './create-article-packet.mjs';

describe('article factory scaffolder', () => {
  it('creates stable slugs for Korean and English titles', () => {
    expect(slugifyTitle('LazyCodex는 Codex를 어떻게 바꾸는가')).toBe('lazycodex-codex');
    expect(slugifyTitle('Open Design Repo Analysis')).toBe('open-design-repo-analysis');
  });

  it('classifies common article inputs', () => {
    expect(classifyInput('https://github.com/code-yeongyu/lazycodex')).toEqual({
      type: 'github',
      value: 'https://github.com/code-yeongyu/lazycodex',
    });
    expect(classifyInput('https://www.threads.com/search?q=LazyCodex')).toEqual({
      type: 'social',
      value: 'https://www.threads.com/search?q=LazyCodex',
    });
    expect(classifyInput('LazyCodex')).toEqual({ type: 'keyword', value: 'LazyCodex' });
  });

  it('builds a packet with the required evidence sections', () => {
    const markdown = buildPacketMarkdown({
      title: 'LazyCodex',
      slug: 'lazycodex',
      input: 'LazyCodex',
      inputType: 'keyword',
      date: '2026-06-25',
    });

    expect(markdown).toContain('# LazyCodex Research Packet');
    expect(markdown).toContain('## Source Inventory');
    expect(markdown).toContain('## Evidence Ledger');
    expect(markdown).toContain('| Claim | Evidence | Strength | Article Section |');
    expect(markdown).toContain('## Junior Explanation Notes');
    expect(markdown).toContain('## Quality Gate Notes');
  });

  it('builds an article draft with the standard source-grounded shape', () => {
    const markdown = buildArticleMarkdown({
      title: 'LazyCodex',
      slug: 'lazycodex',
      input: 'LazyCodex',
      inputType: 'keyword',
      date: '2026-06-25',
    });

    expect(markdown).toContain('tags: ["AI", "tooling", "workflow", "source-grounded"]');
    expect(markdown).toContain('## 먼저 알아야 할 개념');
    expect(markdown).toContain('## 실제 구조');
    expect(markdown).toContain('## 주니어 개발자가 배울 점');
    expect(markdown).toContain('## 확인한 자료');
  });

  it('writes paired packet and article draft files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'article-factory-'));

    try {
      const result = await createArticleFactoryFiles(
        {
          title: 'LazyCodex',
          slug: 'lazycodex',
          input: 'LazyCodex',
          inputType: 'keyword',
          date: '2026-06-25',
        },
        { root },
      );

      expect(result.slug).toBe('lazycodex');
      expect(result.packetPath).toBe('docs/notes/article-factory/lazycodex.md');
      expect(result.articlePath).toBe('src/content/articles/lazycodex.mdx');
      expect(await readFile(join(root, result.packetPath), 'utf8')).toContain('Evidence Ledger');
      expect(await readFile(join(root, result.articlePath), 'utf8')).toContain('status: "review"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
