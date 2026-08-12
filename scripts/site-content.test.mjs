import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const importerPath = fileURLToPath(new URL('./import-naver-reviews.mjs', import.meta.url));
const execFileAsync = promisify(execFile);
const temporaryRoots = [];

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

async function temporaryRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'naver-review-import-'));
  temporaryRoots.push(directory);
  return directory;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeFetchFixture(directory) {
  const fixturePath = join(directory, 'fetch-fixture.mjs');
  const html = `
    <script>{"thumbnail":"https:\\/\\/example.com\\/discovered-cover.jpg"}</script>
    <div class="se-main-container">
      <p class="se-text-paragraph">첫 문단은 원문 리뷰 본문을 그대로 보존합니다.</p>
      <p class="se-text-paragraph">두 번째 문단도 함께 남습니다.</p>
    <div class="post_footer_contents"></div>
  `;
  await writeFile(fixturePath, `globalThis.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`);
  return fixturePath;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('site content contract', () => {
  it('uses beyondwin as the public brand in shell and header', async () => {
    const shell = await readFile(join(root, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');
    const header = await readFile(join(root, 'src', 'components', 'SiteHeader.astro'), 'utf8');

    expect(`${shell}\n${header}`).toContain('beyondwin');
    expect(header).not.toContain('example');
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
      expect(entry.data.sourceUrl).toMatch(/^https:\/\/blog\.naver\.com\/example\//);
      expect(entry.content).not.toContain('원문 보기');
    }
  });

  it('requires an explicit new output directory before fetching or writing', async () => {
    const directory = await temporaryRoot();
    const fixturePath = await writeFetchFixture(directory);

    await expect(execFileAsync(
      process.execPath,
      ['--import', fixturePath, importerPath],
      { cwd: directory },
    )).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('--output'),
    });
    expect(await exists(join(directory, 'src'))).toBe(false);
  });

  it('writes review drafts and keeps discovered cover URLs only in the local intake report', async () => {
    const directory = await temporaryRoot();
    const fixturePath = await writeFetchFixture(directory);
    const outputDirectory = join(directory, 'docs/_inbox/review-intake');

    await execFileAsync(
      process.execPath,
      ['--import', fixturePath, importerPath, '--output', outputDirectory],
      { cwd: directory },
    );

    const files = await readdir(outputDirectory);
    expect(files.filter((file) => file.endsWith('.mdx'))).toHaveLength(18);
    const parsed = matter(await readFile(join(outputDirectory, 'doing-good-better.mdx'), 'utf8'));
    expect(parsed.data).toMatchObject({
      title: '냉정한 이타주의자',
      itemTitle: '냉정한 이타주의자',
      itemType: 'book',
      completedAt: '2025-12-10',
      createdAt: '2025-12-10',
      updatedAt: '2025-12-10',
      sourceUrl: 'https://blog.naver.com/example/224104661846',
      status: 'review',
      draft: true,
    });
    expect(parsed.data.coverImage).toBeUndefined();
    expect(parsed.content).toContain('첫 문단은 원문 리뷰 본문을 그대로 보존합니다.');
    expect(parsed.content).toContain('두 번째 문단도 함께 남습니다.');

    const report = JSON.parse(await readFile(join(outputDirectory, 'naver-review-intake.json'), 'utf8'));
    expect(report).toHaveLength(18);
    expect(report.find((entry) => entry.slug === 'doing-good-better')).toEqual({
      slug: 'doing-good-better',
      sourceUrl: 'https://blog.naver.com/example/224104661846',
      discoveredCoverUrl: 'https://example.com/discovered-cover.jpg',
    });
  });

  it('rejects an output directory inside a public source tree', async () => {
    const directory = await temporaryRoot();
    const fixturePath = await writeFetchFixture(directory);

    await expect(execFileAsync(
      process.execPath,
      ['--import', fixturePath, importerPath, '--output', join(directory, 'src/content/reviews/intake')],
      { cwd: directory },
    )).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('local intake'),
    });
  });

  it('refuses to rewrite a previously generated intake directory', async () => {
    const directory = await temporaryRoot();
    const fixturePath = await writeFetchFixture(directory);
    const outputDirectory = join(directory, 'review-intake');
    const command = ['--import', fixturePath, importerPath, '--output', outputDirectory];

    await execFileAsync(process.execPath, command, { cwd: directory });
    const reviewPath = join(outputDirectory, 'doing-good-better.mdx');
    const original = await readFile(reviewPath, 'utf8');

    await expect(execFileAsync(process.execPath, command, { cwd: directory })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('already exists'),
    });
    expect(await readFile(reviewPath, 'utf8')).toBe(original);
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

  it('loads the memory workbench script from the public scripts directory', async () => {
    const source = await readFile(join(root, 'src', 'pages', 'memory.astro'), 'utf8');

    expect(source).toContain('<script is:inline src="/scripts/memory-workbench.js" defer></script>');
  });
});
