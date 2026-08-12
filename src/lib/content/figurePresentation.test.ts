import { describe, expect, it } from 'vitest';
import type { MediaItem } from './mediaManifest.mjs';
import { buildFigurePresentation } from './figurePresentation';

const base = {
  id: 'architecture',
  file: 'architecture.png',
  kind: 'diagram',
  alt: 'PostgreSQL 내부 구조',
  credit: 'beyondwin',
  verifiedAt: '2026-08-13',
  rightsNote: 'repository-authored asset',
  checksum: `sha256:${'a'.repeat(64)}`,
} as const;

describe('Figure presentation', () => {
  it('uses a manifest caption and exposes external provenance as a real link target', () => {
    const item = {
      ...base,
      caption: '거래 데이터와 벡터를 함께 관리하는 구조',
      sourceUrl: 'https://example.com/original-diagram',
    } satisfies MediaItem;

    expect(buildFigurePresentation(item)).toEqual({
      caption: '거래 데이터와 벡터를 함께 관리하는 구조',
      credit: 'beyondwin',
      provenanceLabel: '외부 출처 · 2026-08-13',
      provenanceHref: 'https://example.com/original-diagram',
    });
  });

  it('falls back to alt and keeps repository provenance as non-remote text', () => {
    const item = {
      ...base,
      sourcePath: 'src/content/articles/pgvector-hybrid-search.mdx',
    } satisfies MediaItem;

    expect(buildFigurePresentation(item)).toEqual({
      caption: 'PostgreSQL 내부 구조',
      credit: 'beyondwin',
      provenanceLabel: '저장소 원본 · src/content/articles/pgvector-hybrid-search.mdx',
    });
  });
});
