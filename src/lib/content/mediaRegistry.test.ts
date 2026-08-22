import { describe, expect, expectTypeOf, it } from 'vitest';
import { buildMediaRegistry, resolveContentMedia } from './mediaRegistry';

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

const manifestPath = '/src/assets/content/reviews/factfulness/media.yml';
const assetPath = '/src/assets/content/reviews/factfulness/cover.jpg';
const imageMetadata = { src: '/_astro/cover.hash.jpg', width: 451, height: 687, format: 'jpg' } as const;

describe('media registry', () => {
  it('resolves the approved cobalt Public Atlas lead with immutable provenance', () => {
    const media = resolveContentMedia(
      'articles',
      'why-i-read-in-the-ai-era',
      'reading-desk-cobalt',
    );

    expect(media.item).toMatchObject({
      id: 'reading-desk-cobalt',
      width: 1536,
      height: 1024,
      sourcePath: 'src/content/articles/why-i-read-in-the-ai-era.mdx',
      verifiedAt: '2026-08-22',
      checksum: 'sha256:aafdd214e2586dd5622aaa1c49d90d5b84dd6b5223a5500d915248a62327ca56',
    });
  });

  it('joins a manifest id to image metadata without a remote URL', () => {
    const registry = buildMediaRegistry(
      { [manifestPath]: validMediaManifest },
      { [assetPath]: imageMetadata },
    );

    const resolved = registry.resolve('reviews', 'factfulness', 'cover');
    expect(resolved).toMatchObject({
      item: { id: 'cover', kind: 'book-cover' },
      asset: { src: '/_astro/cover.hash.jpg', width: 451, height: 687 },
    });
    expectTypeOf(resolved.item.caption).toEqualTypeOf<string | undefined>();
  });

  it('normalizes Vite-relative glob keys', () => {
    const registry = buildMediaRegistry(
      { '../../assets/content/reviews/factfulness/media.yml': validMediaManifest },
      { '../../assets/content/reviews/factfulness/cover.jpg': imageMetadata },
    );

    expect(registry.resolve('reviews', 'factfulness', 'cover').asset.width).toBe(451);
  });

  it('throws a manifest-specific error for an unknown id', () => {
    const registry = buildMediaRegistry(
      { [manifestPath]: validMediaManifest },
      { [assetPath]: imageMetadata },
    );

    expect(() => registry.resolve('reviews', 'factfulness', 'missing')).toThrow(manifestPath);
  });

  it('rejects a manifest item whose file was not discovered', () => {
    expect(() => buildMediaRegistry({ [manifestPath]: validMediaManifest }, {})).toThrow('cover.jpg');
  });

  it('rejects duplicate media ids in one manifest', () => {
    const duplicate = validMediaManifest.replace('items:\n', `items:\n${validMediaManifest.split('items:\n')[1]}`);

    expect(() => buildMediaRegistry({ [manifestPath]: duplicate }, { [assetPath]: imageMetadata })).toThrow(
      'duplicate media id cover',
    );
  });
});
