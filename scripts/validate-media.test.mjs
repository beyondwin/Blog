import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateMediaRepository } from './validate-media.mjs';

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRepository() {
  const root = await mkdtemp(join(tmpdir(), 'validate-media-'));
  roots.push(root);
  await put(root, 'src/data/memory.public.json', '{"thoughts":[]}\n');
  return root;
}

async function put(root, relativePath, contents) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function png(width, height) {
  const bytes = Buffer.alloc(24);
  bytes.set(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function checksum(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function mediaManifest(items) {
  return `version: 1\nitems:\n${items.map((item) => `  - id: ${item.id}\n    file: ${item.file}\n    kind: ${item.kind}\n    alt: ${item.alt ?? '설명'}\n    credit: ${item.credit ?? '작성자'}\n    ${item.sourcePath ? `sourcePath: ${item.sourcePath}` : `sourceUrl: ${item.sourceUrl ?? 'https://example.com/source'}`}\n${item.isbn13 ? `    isbn13: "${item.isbn13}"\n` : ''}${item.edition ? `    edition: ${item.edition}\n` : ''}    verifiedAt: "${item.verifiedAt ?? '2026-08-12'}"\n    rightsNote: ${item.rightsNote ?? '재배포 권리 별도 확인 필요'}\n    checksum: ${item.checksum}\n`).join('')}`;
}

describe('repository media validation', () => {
  it('reports missing manifest ids, orphan assets, checksum drift, hotlinks, and broken relationships', async () => {
    const root = await makeRepository();
    const cover = jpeg(320, 480);
    await put(root, 'src/content/reviews/book.mdx', `---\ncoverState: verified\ncoverMedia: cover\n---\n`);
    await put(root, 'src/content/articles/note.mdx', `---\nrelationships:\n  - target: articles/missing\n    relation: related\n    reason: 관련 기록\n---\n![remote](https://example.com/hotlink.png)\n`);
    await put(root, 'src/assets/content/reviews/book/cover.jpg', cover);
    await put(root, 'src/assets/content/reviews/book/orphan.jpg', jpeg(320, 480));
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([{ id: 'other', file: 'cover.jpg', kind: 'photo', checksum: `sha256:${'0'.repeat(64)}` }]));

    const result = await validateMediaRepository(root);

    expect(result.errors).toContain('src/content/reviews/book.mdx: coverMedia "cover" has no media manifest item');
    expect(result.errors).toContain('src/assets/content/reviews/book/orphan.jpg: asset is not declared in media.yml');
    expect(result.errors).toContain('src/content/articles/note.mdx: remote image hotlink is not allowed');
    expect(result.errors).toContain('src/assets/content/reviews/book/cover.jpg: checksum does not match media.yml');
    expect(result.errors).toContain('src/content/articles/note.mdx: relationship target "articles/missing" does not exist');
  });

  it('accepts local PNG and JPEG media and public-memory relationships', async () => {
    const root = await makeRepository();
    const diagram = png(800, 600);
    const cover = jpeg(320, 480);
    await put(root, 'docs/source.md', '# Source\n');
    await put(root, 'src/data/memory.public.json', '{"thoughts":[{"slug":"public-thought"}]}\n');
    await put(root, 'src/content/articles/note.md', `---\nfeaturedMedia: diagram\nrelationships:\n  - target: memory/public-thought\n    relation: related\n    reason: 공개 기억\n---\n`);
    await put(root, 'src/assets/content/articles/note/diagram.png', diagram);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([{ id: 'diagram', file: 'diagram.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(diagram) }]));
    await put(root, 'src/content/reviews/book.mdx', `---\ncoverState: verified\ncoverMedia: cover\n---\n`);
    await put(root, 'src/assets/content/reviews/book/cover.jpg', cover);
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([{ id: 'cover', file: 'cover.jpg', kind: 'book-cover', isbn13: '9788934985068', edition: '한국어판', checksum: checksum(cover) }]));

    const result = await validateMediaRepository(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'src/assets/content/reviews/book/cover.jpg: redistribution rights are not independently verified',
    ]);
  });

  it('treats legacy cover URLs as warnings until strict mode', async () => {
    const root = await makeRepository();
    await put(root, 'src/content/reviews/book.mdx', `---\ncoverImage: https://example.com/cover.jpg\n---\n`);

    expect(await validateMediaRepository(root)).toEqual({
      errors: [],
      warnings: ['src/content/reviews/book.mdx: legacy coverImage is deprecated; use coverMedia'],
    });
    expect((await validateMediaRepository(root, { strict: true })).errors).toContain(
      'src/content/reviews/book.mdx: legacy coverImage is not allowed in strict mode',
    );
  });

  it('detects Markdown and HTML remote image hotlinks without rejecting ordinary links', async () => {
    const root = await makeRepository();
    await put(root, 'src/content/articles/note.mdx', `---\ntitle: Note\n---\n[allowed](https://example.com)\n<img alt="remote" src='http://example.com/a.jpg'>\n`);

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/content/articles/note.mdx: remote image hotlink is not allowed',
    ]);
  });

  it('enforces verified and hold cover states', async () => {
    const root = await makeRepository();
    await put(root, 'src/content/reviews/verified.mdx', `---\ncoverState: verified\n---\n`);
    await put(root, 'src/content/reviews/hold.mdx', `---\ncoverState: hold\ncoverMedia: cover\ncoverImage: https://example.com/cover.jpg\n---\n`);

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/content/reviews/hold.mdx: coverState "hold" forbids coverImage',
      'src/content/reviews/hold.mdx: coverState "hold" forbids coverMedia',
      'src/content/reviews/verified.mdx: coverState "verified" requires coverMedia',
    ]);
  });

  it('reports missing manifest metadata and duplicate checksums deterministically', async () => {
    const root = await makeRepository();
    const image = png(640, 480);
    await put(root, 'src/assets/content/articles/note/a.png', image);
    await put(root, 'src/assets/content/articles/note/b.png', image);
    const valid = mediaManifest([
      { id: 'a', file: 'a.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(image) },
      { id: 'b', file: 'b.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(image) },
    ]);
    await put(root, 'src/assets/content/articles/note/media.yml', valid.replace('    alt: 설명\n', ''));

    const result = await validateMediaRepository(root);

    expect(result.errors).toContain('src/assets/content/articles/note/media.yml: media item "a" is missing required field "alt"');
    expect(result.errors).toContain(`src/assets/content/articles/note/media.yml: checksum ${checksum(image)} is declared by multiple media items: "a", "b"`);
    expect(result.errors).toEqual([...result.errors].sort());
  });

  it('validates source paths and raster dimensions from file headers', async () => {
    const root = await makeRepository();
    const smallCover = jpeg(299, 500);
    const huge = png(4001, 3000);
    const zero = png(0, 100);
    await put(root, 'src/assets/content/reviews/book/small.jpg', smallCover);
    await put(root, 'src/assets/content/reviews/book/huge.png', huge);
    await put(root, 'src/assets/content/reviews/book/zero.png', zero);
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([
      { id: 'small', file: 'small.jpg', kind: 'book-cover', isbn13: '9788934985068', edition: '한국어판', checksum: checksum(smallCover) },
      { id: 'huge', file: 'huge.png', kind: 'photo', sourcePath: 'docs/missing.md', checksum: checksum(huge) },
      { id: 'zero', file: 'zero.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(zero) },
    ]));

    const result = await validateMediaRepository(root);

    expect(result.errors).toContain('src/assets/content/reviews/book/small.jpg: book cover width 299px is below 300px');
    expect(result.errors).toContain('src/assets/content/reviews/book/huge.png: raster dimensions 4001x3000 exceed 12 megapixels');
    expect(result.errors).toContain('src/assets/content/reviews/book/zero.png: raster dimensions must be greater than zero');
    expect(result.errors).toContain('src/assets/content/reviews/book/media.yml: sourcePath "docs/missing.md" does not exist');
  });
});
