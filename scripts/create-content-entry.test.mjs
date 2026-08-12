import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createContentEntry } from './create-content-entry.mjs';

const roots = [];
const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('./create-content-entry.mjs', import.meta.url));

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'content-entry-'));
  roots.push(root);
  return root;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('structured content scaffolder', () => {
  it('creates a draft review and empty manifest', async () => {
    const root = await tempRoot();
    const result = await createContentEntry(
      {
        kind: 'review',
        slug: 'factfulness',
        title: '팩트풀니스',
        isbn: '9788934985068',
        date: '2026-08-12',
      },
      { root },
    );

    const content = await readFile(join(root, result.contentPath), 'utf8');
    expect(result.contentPath).toBe('src/content/reviews/factfulness.mdx');
    expect(result.manifestPath).toBe('src/assets/content/reviews/factfulness/media.yml');
    expect(content).toContain('status: "review"');
    expect(content).toContain('draft: true');
    expect(content).toContain('itemType: "book"');
    expect(content).toContain('itemTitle: "팩트풀니스"');
    expect(content).toContain('isbn13: "9788934985068"');
    expect(await readFile(join(root, result.manifestPath), 'utf8')).toBe('version: 1\nitems: []\n');
  });

  it.each([
    ['article', 'articles', 'recordKind: "technical-note"\nevidenceState: "personal"'],
    ['idea', 'ideas', 'maturity: "sketch"'],
  ])('routes %s entries to %s with its required fields', async (kind, collection, requiredFields) => {
    const root = await tempRoot();
    const result = await createContentEntry(
      { kind, slug: `${kind}-entry`, title: `${kind} title`, date: '2026-08-12' },
      { root },
    );

    expect(result.contentPath).toBe(`src/content/${collection}/${kind}-entry.mdx`);
    expect(await readFile(join(root, result.contentPath), 'utf8')).toContain(requiredFields);
    expect(await readFile(join(root, result.manifestPath), 'utf8')).toBe('version: 1\nitems: []\n');
  });

  it('requires a location for scenes and emits the travel privacy fields', async () => {
    const root = await tempRoot();

    await expect(
      createContentEntry(
        { kind: 'scene', slug: 'lisbon-afternoon', title: '리스본의 오후', date: '2026-08-12' },
        { root },
      ),
    ).rejects.toThrow('location');
    expect(await exists(join(root, 'src'))).toBe(false);

    const result = await createContentEntry(
      {
        kind: 'scene',
        slug: 'lisbon-afternoon',
        title: '리스본의 오후',
        location: 'Lisbon, Portugal',
        date: '2026-08-12',
      },
      { root },
    );
    const content = await readFile(join(root, result.contentPath), 'utf8');
    expect(result.contentPath).toBe('src/content/travel/lisbon-afternoon.mdx');
    expect(content).toContain('location: "Lisbon, Portugal"');
    expect(content).toContain('privacyReviewed: false');
  });

  it('refuses an existing slug without modifying files', async () => {
    const root = await tempRoot();
    const input = { kind: 'idea', slug: 'quiet-search', title: '조용한 검색', date: '2026-08-12' };
    const first = await createContentEntry(input, { root });
    const originalContent = await readFile(join(root, first.contentPath), 'utf8');
    const originalManifest = await readFile(join(root, first.manifestPath), 'utf8');

    await expect(createContentEntry({ ...input, title: '덮어쓰면 안 됨' }, { root })).rejects.toThrow('already exists');
    expect(await readFile(join(root, first.contentPath), 'utf8')).toBe(originalContent);
    expect(await readFile(join(root, first.manifestPath), 'utf8')).toBe(originalManifest);
  });

  it('rolls back only the content file when an existing manifest wins the collision', async () => {
    const root = await tempRoot();
    const manifestPath = join(root, 'src/assets/content/articles/collision/media.yml');
    await mkdir(join(root, 'src/assets/content/articles/collision'), { recursive: true });
    await writeFile(manifestPath, 'preserve me\n');

    await expect(
      createContentEntry(
        { kind: 'article', slug: 'collision', title: 'Collision', date: '2026-08-12' },
        { root },
      ),
    ).rejects.toThrow('already exists');

    expect(await exists(join(root, 'src/content/articles/collision.mdx'))).toBe(false);
    expect(await readFile(manifestPath, 'utf8')).toBe('preserve me\n');
  });

  it('refuses to write through a symbolic-link directory', async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await mkdir(join(root, 'src/content'), { recursive: true });
    await symlink(outside, join(root, 'src/content/articles'));

    await expect(
      createContentEntry(
        { kind: 'article', slug: 'escaped', title: 'Escaped', date: '2026-08-12' },
        { root },
      ),
    ).rejects.toThrow('symbolic link');

    expect(await exists(join(outside, 'escaped.mdx'))).toBe(false);
    expect(await exists(join(root, 'src/assets'))).toBe(false);
  });

  it.each([
    [{ kind: 'idea', slug: '../escape', title: 'Escape', date: '2026-08-12' }, 'slug'],
    [{ kind: 'idea', slug: 'future-note', title: 'Future', date: '2026-02-30' }, 'date'],
    [{ kind: 'review', slug: 'bad-isbn', title: 'Book', isbn: '9788934985069', date: '2026-08-12' }, 'ISBN'],
  ])('validates %s before creating any directories', async (input, message) => {
    const root = await tempRoot();

    await expect(createContentEntry(input, { root })).rejects.toThrow(message);
    expect(await exists(join(root, 'src'))).toBe(false);
  });

  it('returns paths in dry-run mode without creating files or directories', async () => {
    const root = await tempRoot();
    const result = await createContentEntry(
      { kind: 'idea', slug: 'quiet-search', title: '조용한 검색', date: '2026-08-12' },
      { root, dryRun: true },
    );

    expect(result.contentPath).toBe('src/content/ideas/quiet-search.mdx');
    expect(result.manifestPath).toBe('src/assets/content/ideas/quiet-search/media.yml');
    expect(await exists(join(root, 'src'))).toBe(false);
  });

  it.each([
    ['omitted', []],
    ['blank', ['--date', '']],
  ])('defaults an %s CLI date to the local calendar date without writing in dry-run', async (_label, dateArgs) => {
    const root = await tempRoot();
    const expectedDate = new Intl.DateTimeFormat('en-CA').format(new Date());
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliPath, 'idea', '--slug', 'quiet-search', '--title', '조용한 검색', ...dateArgs, '--dry-run'],
      { cwd: root },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain(`createdAt: "${expectedDate}"`);
    expect(stdout).toContain(`updatedAt: "${expectedDate}"`);
    expect(await exists(join(root, 'src'))).toBe(false);
  });

  it('rejects an explicitly invalid CLI date before writes', async () => {
    const root = await tempRoot();

    await expect(execFileAsync(
      process.execPath,
      [cliPath, 'idea', '--slug', 'bad-date', '--title', 'Bad date', '--date', '2026-02-30'],
      { cwd: root },
    )).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('valid calendar date') });
    expect(await exists(join(root, 'src'))).toBe(false);
  });
});
