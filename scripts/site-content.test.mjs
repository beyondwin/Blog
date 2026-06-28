import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const importedReviews = [
  ['그들의 생각을 바꾸는 방법', '2026-06-16'],
  ['파리대왕', '2026-06-02'],
  ['블랙스완', '2026-05-27'],
  ['그럼에도 불구하고', '2026-05-19'],
  ['괴테는 모든 것을 말했다', '2026-05-12'],
  ['용의자 X의 헌신', '2026-04-21'],
  ['가난한 찰리의 연감', '2026-04-16'],
  ['예술 도둑', '2026-04-06'],
  ['싯다르타', '2026-03-24'],
  ['아비투스', '2026-03-10'],
  ['내 안에서 나를 만드는 것들', '2026-02-20'],
  ['롤리타', '2026-02-10'],
  ['먼저 온 미래', '2026-01-26'],
  ['우리가 겨울을 지나온 방식', '2026-01-15'],
  ['편의점 인간', '2026-01-06'],
  ['나미야 잡화점의 기적', '2025-12-29'],
  ['냉정한 이타주의자', '2025-12-10'],
  ['팩트풀니스', '2025-11-17'],
];

async function readReviewEntries() {
  const directory = join(root, 'src', 'content', 'reviews');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.mdx') || file.endsWith('.md'));
  const entries = await Promise.all(files.map(async (file) => {
    const parsed = matter(await readFile(join(directory, file), 'utf8'));
    return { file, data: parsed.data, content: parsed.content };
  }));
  return entries.filter((entry) => entry.data.draft !== true);
}

describe('site content contract', () => {
  it('uses beyondwin as the public brand in shell and header', async () => {
    const shell = await readFile(join(root, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');
    const header = await readFile(join(root, 'src', 'components', 'SiteHeader.astro'), 'utf8');

    expect(`${shell}\n${header}`).toContain('beyondwin');
    expect(header).not.toContain('moveattack');
  });

  it('imports the 18 Naver book reviews with original dates', async () => {
    const reviews = await readReviewEntries();
    const byTitle = new Map(reviews.map((entry) => [entry.data.itemTitle, entry]));

    expect(reviews).toHaveLength(importedReviews.length);

    for (const [title, date] of importedReviews) {
      const entry = byTitle.get(title);
      expect(entry, `${title} review exists`).toBeDefined();
      expect(entry.data.itemType).toBe('book');
      expect(entry.data.completedAt).toBe(date);
      expect(entry.data.createdAt).toBe(date);
      expect(entry.data.updatedAt).toBe(date);
      expect(entry.data.sourceUrl).toMatch(/^https:\/\/blog\.naver\.com\/moveattack\//);
      expect(entry.data.coverImage).toMatch(/^https:\/\//);
      expect(entry.content).not.toContain('원문 보기');
    }
  });

  it('does not render original-post links in the review layout', async () => {
    const layout = await readFile(join(root, 'src', 'layouts', 'ReviewLayout.astro'), 'utf8');

    expect(layout).not.toContain('원문 보기');
    expect(layout).toContain('coverImage');
  });

  it('keeps review detail pages focused on the article body', async () => {
    const layout = await readFile(join(root, 'src', 'layouts', 'ReviewLayout.astro'), 'utf8');

    expect(layout).not.toContain('side-panel');
    expect(layout).not.toContain('article-shell--with-sidebars');
    expect(layout).not.toContain('class="description"');
    expect(layout).not.toContain('StatusBadge');
  });
});
