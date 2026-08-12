import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
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

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(width = 1, height = 1) {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

function withoutPngChunk(bytes, type) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (bytes.toString('ascii', offset + 4, offset + 8) === type) {
      return Buffer.concat([bytes.subarray(0, offset), bytes.subarray(chunkEnd)]);
    }
    offset = chunkEnd;
  }
  throw new Error(`missing PNG chunk ${type}`);
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
    const diagram = validPng();
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

  it('rejects unsupported media extensions while parsing before reading the declared asset', async () => {
    const root = await makeRepository();
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      {
        id: 'diagram',
        file: 'diagram.svg',
        kind: 'diagram',
        sourcePath: 'docs/source.md',
        checksum: `sha256:${'0'.repeat(64)}`,
      },
    ]));

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/assets/content/articles/note/media.yml: file must use a lowercase .jpg, .jpeg, .png, .webp or .avif extension',
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
    const image = validPng(640, 480);
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
    const huge = validPng(4001, 3000);
    const zero = validPng(0, 100);
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

  it('does not follow content symlinks into private memory or outside the repository', async () => {
    const root = await makeRepository();
    const outside = await mkdtemp(join(tmpdir(), 'validate-media-outside-'));
    roots.push(outside);
    await put(root, 'memory/private.mdx', `---\n---\n![secret](https://example.com/private.png)\n`);
    await put(outside, 'outside.mdx', `---\n---\n![outside](https://example.com/outside.png)\n`);
    await mkdir(join(root, 'src/content/articles'), { recursive: true });
    await symlink(join(root, 'memory/private.mdx'), join(root, 'src/content/articles/private.mdx'));
    await symlink(join(outside, 'outside.mdx'), join(root, 'src/content/articles/outside.mdx'));

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/content/articles/outside.mdx: symbolic link is not allowed',
      'src/content/articles/private.mdx: symbolic link is not allowed',
    ]);
  });

  it('does not follow a media manifest symlink outside the asset subtree', async () => {
    const root = await makeRepository();
    await put(root, 'docs/external-media.yml', 'version: 1\nitems: []\n');
    await mkdir(join(root, 'src/assets/content/articles/note'), { recursive: true });
    await symlink(join(root, 'docs/external-media.yml'), join(root, 'src/assets/content/articles/note/media.yml'));

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/assets/content/articles/note/media.yml: symbolic link is not allowed',
    ]);
  });

  it('does not follow declared asset symlinks outside their manifest directory', async () => {
    const root = await makeRepository();
    const privateImage = validPng();
    await put(root, 'docs/source.md', '# Source\n');
    await put(root, 'memory/private.png', privateImage);
    await put(root, 'src/assets/content/reviews/other/outside.png', privateImage);
    await mkdir(join(root, 'src/assets/content/reviews/book'), { recursive: true });
    await symlink(join(root, 'memory/private.png'), join(root, 'src/assets/content/reviews/book/private.png'));
    await symlink(
      join(root, 'src/assets/content/reviews/other/outside.png'),
      join(root, 'src/assets/content/reviews/book/outside.png'),
    );
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([
      { id: 'private', file: 'private.png', kind: 'photo', sourcePath: 'docs/source.md', checksum: checksum(privateImage) },
      { id: 'outside', file: 'outside.png', kind: 'photo', sourcePath: 'docs/source.md', checksum: checksum(privateImage) },
    ]));

    expect((await validateMediaRepository(root)).errors).toEqual([
      `src/assets/content/reviews/book/media.yml: checksum ${checksum(privateImage)} is declared by multiple media items: "outside", "private"`,
      'src/assets/content/reviews/book/outside.png: symbolic link is not allowed',
      'src/assets/content/reviews/book/private.png: symbolic link is not allowed',
      'src/assets/content/reviews/other/outside.png: asset is not declared in media.yml',
    ]);
  });

  it('rejects a truncated PNG that contains only signature and partial IHDR data', async () => {
    const root = await makeRepository();
    const truncated = validPng(640, 480).subarray(0, 24);
    await put(root, 'src/assets/content/articles/note/truncated.png', truncated);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'truncated', file: 'truncated.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(truncated) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/truncated.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG with a bad IHDR CRC', async () => {
    const root = await makeRepository();
    const invalid = validPng(640, 480);
    invalid[29] ^= 0xff;
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG without an IDAT chunk', async () => {
    const root = await makeRepository();
    const invalid = withoutPngChunk(validPng(640, 480), 'IDAT');
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG without a terminal IEND chunk', async () => {
    const root = await makeRepository();
    const invalid = withoutPngChunk(validPng(640, 480), 'IEND');
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG truncated inside a chunk', async () => {
    const root = await makeRepository();
    const complete = validPng(640, 480);
    const invalid = complete.subarray(0, complete.length - 3);
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a JPEG truncated after its SOF dimensions without an EOI marker', async () => {
    const root = await makeRepository();
    const truncated = jpeg(640, 480).subarray(0, -2);
    await put(root, 'src/assets/content/articles/note/truncated.jpg', truncated);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'truncated', file: 'truncated.jpg', kind: 'photo', sourcePath: 'docs/missing.md', checksum: checksum(truncated) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/truncated.jpg: cannot read JPG dimensions from file header',
    );
  });
});
