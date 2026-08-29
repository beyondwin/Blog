import { describe, expect, it } from 'vitest';
import { findMediaItem, parseMediaManifest } from '../src/media/media-manifest.mjs';

const validMediaManifest = `version: 1
items:
  - id: cover
    file: cover.jpg
    kind: book-cover
    alt: 팩트풀니스 한국어판 표지
    caption: 팩트풀니스 한국어판 표지 자료
    credit: 김영사
    sourceUrl: https://example.com/book
    isbn13: "9788934985068"
    edition: 2019 한국어판
    verifiedAt: "2026-08-12"
    rightsNote: 서지 식별용 표지. 재배포 권리 별도 검토.
    checksum: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`;

describe('package-owned media manifest', () => {
  it('parses and resolves the complete valid contract without Astro', () => {
    const manifest = parseMediaManifest(validMediaManifest, 'media.yml');
    expect(findMediaItem(manifest, 'cover')).toMatchObject({
      caption: '팩트풀니스 한국어판 표지 자료',
      isbn13: '9788934985068',
    });
  });

  it.each(['../cover.jpg', './cover.jpg', 'images//cover.jpg', 'cover.gif', 'cover.JPG'])(
    'rejects unsafe or unsupported media path %s',
    (file) => expect(() => parseMediaManifest(
      validMediaManifest.replace('cover.jpg', file),
      'content/reviews/book/media.yml',
    )).toThrow('content/reviews/book/media.yml: file'),
  );

  it('requires exactly one provenance locator', () => {
    const invalid = validMediaManifest.replace(
      '    sourceUrl: https://example.com/book\n',
      '    sourceUrl: https://example.com/book\n    sourcePath: docs/book.md\n',
    );
    expect(() => parseMediaManifest(invalid, 'media.yml')).toThrow('exactly one');
  });

  it('rejects missing lookups instead of returning undefined', () => {
    expect(() => findMediaItem(parseMediaManifest(validMediaManifest, 'media.yml'), 'missing'))
      .toThrow('unknown media id missing');
  });
});
