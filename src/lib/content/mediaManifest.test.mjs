import { describe, expect, it } from 'vitest';
import { findMediaItem, parseMediaManifest } from './mediaManifest.mjs';

export const validMediaManifest = `version: 1
items:
  - id: cover
    file: cover.jpg
    kind: book-cover
    alt: 팩트풀니스 한국어판 표지
    credit: 김영사
    sourceUrl: https://example.com/book
    isbn13: "9788934985068"
    edition: 2019 한국어판
    verifiedAt: "2026-08-12"
    rightsNote: 서지 식별용 표지. 재배포 권리 별도 검토.
    checksum: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`;

describe('media manifest', () => {
  it('parses and resolves a valid item', () => {
    const manifest = parseMediaManifest(validMediaManifest, 'media.yml');

    expect(findMediaItem(manifest, 'cover').isbn13).toBe('9788934985068');
  });

  it('rejects path traversal', () => {
    expect(() => parseMediaManifest(validMediaManifest.replace('cover.jpg', '../cover.jpg'), 'media.yml')).toThrow(
      'file',
    );
  });

  it('rejects book covers without edition metadata', () => {
    expect(() =>
      parseMediaManifest(validMediaManifest.replace('    edition: 2019 한국어판\n', ''), 'media.yml'),
    ).toThrow('edition');
  });

  it('requires exactly one provenance locator', () => {
    const withTwoLocators = validMediaManifest.replace(
      '    sourceUrl: https://example.com/book\n',
      '    sourceUrl: https://example.com/book\n    sourcePath: docs/book.md\n',
    );

    expect(() => parseMediaManifest(withTwoLocators, 'content/reviews/factfulness/media.yml')).toThrow(
      'content/reviews/factfulness/media.yml',
    );
  });

  it('allows a safe repository source path for a diagram', () => {
    const diagram = validMediaManifest
      .replace('kind: book-cover', 'kind: diagram')
      .replace('    sourceUrl: https://example.com/book\n', '    sourcePath: docs/diagrams/factfulness.md\n')
      .replace('    isbn13: "9788934985068"\n', '')
      .replace('    edition: 2019 한국어판\n', '');

    expect(parseMediaManifest(diagram, 'media.yml').items[0].sourcePath).toBe('docs/diagrams/factfulness.md');
  });
});
