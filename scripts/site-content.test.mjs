import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
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

async function writeFetchFixture(directory, options = {}) {
  const fixturePath = join(directory, options.name ?? 'fetch-fixture.mjs');
  const html = `
    <script>{"thumbnail":"https:\\/\\/example.com\\/discovered-cover.jpg"}</script>
    <div class="se-main-container">
      <p class="se-text-paragraph">첫 문단은 원문 리뷰 본문을 그대로 보존합니다.</p>
      <p class="se-text-paragraph">두 번째 문단도 함께 남습니다.</p>
    <div class="post_footer_contents"></div>
  `;
  const imports = options.failReport
    ? `import { promises as fs } from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nconst originalWriteFile = fs.writeFile;\nfs.writeFile = async (path, ...args) => {\n  if (String(path).endsWith('naver-review-intake.json')) throw new Error('injected intake report failure');\n  return originalWriteFile(path, ...args);\n};\nsyncBuiltinESMExports();\n`
    : '';
  const swap = options.swap
    ? `import { rename, symlink } from 'node:fs/promises';\nlet swapped = false;\nasync function swapParent() {\n  if (swapped) return;\n  swapped = true;\n  await rename(${JSON.stringify(options.swap.parent)}, ${JSON.stringify(options.swap.moved)});\n  await symlink(${JSON.stringify(options.swap.trap)}, ${JSON.stringify(options.swap.parent)}, 'dir');\n}\n`
    : '';
  const fetchImplementation = options.fetchFailure
    ? `globalThis.setTimeout = (callback) => { callback(); return 0; };\nglobalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });\n`
    : `globalThis.fetch = async () => {${options.swap ? '\n  await swapParent();' : ''}\n  return { ok: true, text: async () => ${JSON.stringify(html)} };\n};\n`;
  await writeFile(fixturePath, `${imports}${swap}${fetchImplementation}`);
  return fixturePath;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('site content contract', () => {
  it('preserves the three approved Public Atlas visual references at durable paths', async () => {
    const references = [
      ['public-atlas-desktop-approved.png', '216b35e3fbd55592a7ca8309aaf591e715ba6aed558387e00ea2430440bfa711'],
      ['public-atlas-mobile-approved.png', '04ad8dafce9b57e1321c25654e5eaabbc7c4d82ad8a415ca4ef4b6a1c0b1b9ae'],
      ['public-atlas-focus-approved.png', 'a4f7c15891ee6d6e90865354cf7782058d0354060ac3edc145a45a2bb84d4128'],
    ];

    for (const [file, checksum] of references) {
      const asset = await readFile(join(root, 'docs', 'notes', 'project', 'assets', 'public-atlas', file));
      expect(createHash('sha256').update(asset).digest('hex'), `${file} checksum`).toBe(checksum);
    }
  });

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

  it('leaves no destination or staging directory when fetching fails', async () => {
    const directory = await temporaryRoot();
    const fixturePath = await writeFetchFixture(directory, { fetchFailure: true });
    const parentDirectory = join(directory, 'docs/_inbox');
    const outputDirectory = join(parentDirectory, 'review-intake');

    await expect(execFileAsync(
      process.execPath,
      ['--import', fixturePath, importerPath, '--output', 'docs/_inbox/review-intake'],
      { cwd: directory },
    )).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('503') });

    expect(await exists(outputDirectory)).toBe(false);
    expect(await exists(parentDirectory)).toBe(false);
  });

  it('cleans a failed staged bundle and permits an atomic retry', async () => {
    const directory = await temporaryRoot();
    const parentDirectory = join(directory, 'docs/_inbox');
    const outputDirectory = join(parentDirectory, 'review-intake');
    await mkdir(parentDirectory, { recursive: true });
    const failingFixture = await writeFetchFixture(directory, {
      failReport: true,
      name: 'failing-report-fixture.mjs',
    });

    await expect(execFileAsync(
      process.execPath,
      ['--import', failingFixture, importerPath, '--output', 'docs/_inbox/review-intake'],
      { cwd: directory },
    )).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('injected intake report failure'),
    });
    expect(await exists(outputDirectory)).toBe(false);
    expect(await readdir(parentDirectory)).toEqual([]);

    const successfulFixture = await writeFetchFixture(directory, { name: 'retry-fixture.mjs' });
    await execFileAsync(
      process.execPath,
      ['--import', successfulFixture, importerPath, '--output', 'docs/_inbox/review-intake'],
      { cwd: directory },
    );
    expect((await readdir(outputDirectory)).filter((file) => file.endsWith('.mdx'))).toHaveLength(18);
  });

  it('rejects a destination whose parent becomes a symlink while reviews are fetched', async () => {
    const directory = await temporaryRoot();
    const parentDirectory = join(directory, 'safe-parent');
    const movedParent = join(directory, 'safe-parent-before-swap');
    const trapDirectory = join(directory, 'trap');
    await mkdir(parentDirectory);
    await mkdir(trapDirectory);
    const fixturePath = await writeFetchFixture(directory, {
      swap: { parent: parentDirectory, moved: movedParent, trap: trapDirectory },
    });

    await expect(execFileAsync(
      process.execPath,
      ['--import', fixturePath, importerPath, '--output', 'safe-parent/review-intake'],
      { cwd: directory },
    )).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('symbolic link'),
    });
    expect(await exists(join(trapDirectory, 'review-intake'))).toBe(false);
    expect(await exists(join(movedParent, 'review-intake'))).toBe(false);
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
    expect(layout).not.toContain('coverImage');
    expect(layout).toContain('detail.media');
    expect(layout).toContain('detail.authors.join');
  });

  it('renders Public Atlas links without private data or modal chrome', async () => {
    const home = await readFile(join(root, 'src', 'pages', 'index.astro'), 'utf8');
    const scene = await readFile(join(root, 'src', 'components', 'PublicScene.astro'), 'utf8');
    const object = await readFile(join(root, 'src', 'components', 'PublicSceneObject.astro'), 'utf8');
    const layout = await readFile(join(root, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');

    expect(home).toContain('loadJudgmentScene');
    expect(home).toContain('PublicScene');
    expect(home).toContain('storyworld-page');
    expect(scene).toContain('data-public-scene');
    expect(scene).toContain('data-scene-overview');
    expect(scene).toContain('data-scene-read');
    expect(object).toContain('href={decorative ? undefined : object.href}');
    expect(object).toContain('data-scene-object');
    expect(home + scene + object).not.toContain("from '../../memory");
    expect(home + scene + object).not.toContain('<dialog');
    expect(home + scene + object).not.toContain('similarity');
    expect(layout).toContain('rel="canonical"');
  });

  it('keeps overview actions as canonical no-JavaScript links with one enhanced focus path', async () => {
    const scene = await readFile(join(root, 'src', 'components', 'PublicScene.astro'), 'utf8');

    expect(scene).toContain('const leadFocusHref = withFocusUrl(Astro.url, scene.lead.id);');
    expect(scene).toMatch(/data-scene-overview-read\s+href=\{scene\.lead\.href\}/);
    expect(scene).toMatch(/data-scene-enter-focus\s+href=\{leadFocusHref\}/);
    expect(scene).toContain("const overviewFocusLink = scene.querySelector<HTMLAnchorElement>('[data-scene-enter-focus]');");
    expect(scene).toContain("overviewFocusLink.addEventListener('click', (event) => requestFocus(event, leadObject));");
    expect(scene).toContain("object.addEventListener('click', (event) => requestFocus(event, object));");
  });

  it('renders the authored excerpt before focus actions and quiet provenance', async () => {
    const scene = await readFile(join(root, 'src', 'components', 'PublicScene.astro'), 'utf8');

    expect(scene).toContain("object.kind === 'article-excerpt'");
    expect(scene).toContain('const leadExcerpt =');
    expect(scene).toContain('<blockquote data-focus-description');
    expect(scene.indexOf('<blockquote data-focus-description'))
      .toBeLessThan(scene.indexOf('data-scene-read'));
    expect(scene.indexOf('data-scene-read'))
      .toBeLessThan(scene.indexOf('<dl class="scene-focus__provenance">'));
    expect(scene).toContain('data-focus-revealed');
  });

  it('keeps mobile edge echoes inert and action arrows authored as SVG', async () => {
    const scene = await readFile(join(root, 'src', 'components', 'PublicScene.astro'), 'utf8');
    const object = await readFile(join(root, 'src', 'components', 'PublicSceneObject.astro'), 'utf8');
    const css = await readFile(join(root, 'src/styles/storyworld.css'), 'utf8');

    expect(scene).toMatch(/data-scene-edge-echoes\s+aria-hidden="true"/);
    expect(scene).toContain('<PublicSceneObject object={judgmentEcho} decorative />');
    expect(scene).toContain('<PublicSceneObject object={blackSwanEcho} decorative />');
    expect(object).toContain('decorative?: boolean');
    expect(object).toContain('data-scene-object={decorative ? undefined : object.id}');
    expect(object).toContain("aria-hidden={decorative ? 'true' : undefined}");
    expect(scene.match(/data-scene-action-arrow/g)).toHaveLength(3);
    expect(css).not.toContain('content: "→"');
  });

  it('centers a seventy-percent mobile lead while keeping the desktop overview action text-only', async () => {
    const css = await readFile(join(root, 'src/styles/storyworld.css'), 'utf8');

    expect(css).toMatch(/\.scene-overview-actions \[data-scene-action-arrow\]\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.scene-stage__objects\s*\{[^}]*padding:\s*0 15vw 26px/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\[data-scene-object="reading-desk-cobalt"\]\s*\{[^}]*flex-basis:\s*70vw[^}]*margin-right:\s*15vw/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.scene-overview-actions \[data-scene-action-arrow\]\s*\{[^}]*display:\s*block/);
  });

  it('keeps the storyworld bounded and accessible', async () => {
    const css = await readFile(join(root, 'src/styles/storyworld.css'), 'utf8');

    expect(css).toContain('--scene-ground: #f2f4f7');
    expect(css).toContain('--scene-selection: #2b63e8');
    expect(css).toContain('scroll-snap-type: x mandatory');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(':focus-visible');
    expect(css).not.toContain('backdrop-filter');
    expect(css).not.toContain('perspective(');
    expect(css).not.toContain('animation-iteration-count: infinite');
  });

  it('preserves the cobalt lead aspect ratio in the desktop focus band', async () => {
    const css = await readFile(join(root, 'src/styles/storyworld.css'), 'utf8');

    expect(css).not.toContain('object-fit: fill');
    expect(css).toMatch(/\[data-scene-object="reading-desk-cobalt"\]\[data-selected\]\s+img\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2[^}]*width:\s*auto[^}]*height:\s*84%[^}]*object-fit:\s*contain/);
  });

  it('turns the desktop cobalt remainder into a non-redundant public media folio', async () => {
    const object = await readFile(join(root, 'src', 'components', 'PublicSceneObject.astro'), 'utf8');
    const css = await readFile(join(root, 'src/styles/storyworld.css'), 'utf8');

    expect(object).toContain("object.id === 'reading-desk-cobalt' && object.media");
    expect(object).toMatch(/data-scene-folio\s+aria-hidden="true"/);
    expect(object).toContain('{object.media.item.credit}');
    expect(object).toContain('{object.media.item.verifiedAt.replaceAll(\'-\', \'.\')}');
    expect(object).toContain('{object.media.asset.width} × {object.media.asset.height}');
    expect(object).toContain('{object.media.asset.format.toUpperCase()}');
    expect(css).toMatch(/\.scene-object__folio\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\[data-scene-object="reading-desk-cobalt"\]\[data-selected\]\s+\.scene-object__folio\s*\{[^}]*display:\s*grid/);
  });

  it('keeps the approved storyworld contract route-specific', async () => {
    const home = await readFile(join(root, 'src/pages/index.astro'), 'utf8');
    const layout = await readFile(join(root, 'src/layouts/BaseLayout.astro'), 'utf8');

    expect(home).toContain('approved-staged-aperture-2026-08-22');
    expect(home).toContain('unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance');
    expect(home).toContain('designContract={storyworldDesignContract}');
    expect(layout).toContain('designContract?: string');
    expect(layout).toContain('The route supplies its public product surface inside this shared site shell.');
  });

  it('renders Figure external provenance as a no-JavaScript link', async () => {
    const figure = await readFile(join(root, 'src', 'components', 'Figure.astro'), 'utf8');

    expect(figure).toContain('buildFigurePresentation');
    expect(figure).toContain('<a href={presentation.provenanceHref}');
    expect(figure).toContain('rel="noreferrer"');
  });

  it('keeps review detail pages focused on the article body', async () => {
    const layout = await readFile(join(root, 'src', 'layouts', 'ReviewLayout.astro'), 'utf8');

    expect(layout).not.toContain('side-panel');
    expect(layout).not.toContain('article-shell--with-sidebars');
    expect(layout).not.toContain('class="description"');
    expect(layout).not.toContain('StatusBadge');
  });

  it('does not ship the retired memory workbench', async () => {
    const source = await readFile(join(root, 'src', 'pages', 'memory.astro'), 'utf8');

    expect(source).not.toContain('memory-workbench');
    expect(source).toContain('sortMemoryReading');
    expect(source).toContain('memory-detail');
    await expect(readFile(join(root, 'public', 'scripts', 'memory-workbench.js'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('lets a thought page be read without JavaScript', async () => {
    const page = await readFile(join(root, 'src', 'pages', 'memory', '[slug].astro'), 'utf8');

    expect(page).toContain('buildMemoryThoughtPage');
    expect(page).toContain('이 문장이 나온 글');
    expect(page).toContain('같이 붙는 문장');
    expect(page).not.toContain('memory-workbench');
    expect(page).not.toContain('<script');
  });

  it('retires leftover literary chrome from visitor pages', async () => {
    const files = [
      'src/layouts/BaseLayout.astro',
      'src/layouts/AnalysisLayout.astro',
      'src/pages/tags/[tag].astro',
      'src/pages/index.astro',
      'src/components/SiteHeader.astro',
      'src/components/SiteFooter.astro',
    ];

    for (const path of files) {
      const source = await readFile(join(root, path), 'utf8');
      expect(source, path).not.toContain('headerVariant');
      expect(source, path).not.toContain('LiteraryFooter');
      expect(source, path).not.toContain('literary.css');
      expect(source, path).not.toMatch(/-literary\.css/);
    }

    const tagPage = await readFile(join(root, 'src', 'pages', 'tags', '[tag].astro'), 'utf8');
    expect(tagPage).toContain('SiteFooter');
    expect(tagPage).toContain('press-sheet');
    expect(tagPage).not.toContain('전체 색인');
    expect(tagPage).not.toContain('공개 기록');

    const globalCss = await readFile(join(root, 'src', 'styles', 'global.css'), 'utf8');
    expect(globalCss).not.toContain('.home-hero');
    expect(globalCss).not.toContain('.article-kicker');
    expect(globalCss).not.toContain('--font-serif');
    expect(globalCss).not.toContain('text-transform: uppercase');
  });

  it('ships search as a public inventory grouped by writing, books, and sentences', async () => {
    const page = await readFile(join(root, 'src', 'pages', 'search', 'index.astro'), 'utf8');

    expect(page).toContain('buildSearchInventory');
    expect(page).toContain('searchGroupLabel');
    expect(page).toContain('matchLiterarySearchFields');
    expect(page).toContain('SiteFooter');
    expect(page).not.toContain('JavaScript 없이도');
    expect(page).not.toContain('일치 색인');
    expect(page).not.toContain('headerVariant');
    expect(page).not.toContain('표지 확인 중');
  });

  it('keeps a visible keyboard focus ring on the search input', async () => {
    const css = await readFile(join(root, 'src', 'styles', 'press.css'), 'utf8');

    expect(css).not.toMatch(/search-box input:focus(?:-visible)?\s*\{[^}]*outline:\s*0/);
    expect(css).toMatch(/:where\(a, button, input, textarea, select, summary\):focus-visible\s*\{[^}]*outline:\s*2px/);
  });
});
