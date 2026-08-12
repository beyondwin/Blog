import { parseMediaManifest, type MediaItem } from './mediaManifest.mjs';

declare const source: string;

const manifest = parseMediaManifest(source, 'media.yml');
const item: MediaItem = manifest.items[0]!;

if (item.kind === 'book-cover') {
  item.sourceUrl satisfies string;
  item.isbn13 satisfies string;
  item.edition satisfies string;
}

// @ts-expect-error book covers cannot use repository-only provenance
const invalidBookCover: MediaItem = {
  id: 'cover',
  file: 'cover.jpg',
  kind: 'book-cover',
  alt: 'Cover',
  credit: 'Publisher',
  sourcePath: 'docs/cover.md',
  isbn13: '9788934985068',
  edition: '2019 edition',
  verifiedAt: '2026-08-12',
  rightsNote: 'Bibliographic identification only.',
  checksum: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

void invalidBookCover;
