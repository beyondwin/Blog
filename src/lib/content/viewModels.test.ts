import { describe, expect, it } from 'vitest';
import type { SiteEntry } from '../content';
import type { ContentMemoryLinks } from '../memory/contentLinks';
import type { ResolvedMedia } from './mediaRegistry';
import { toRecordDetail, toRecordSummary } from './viewModels';

const cover = {
  item: {
    id: 'cover',
    file: 'cover.jpg',
    kind: 'book-cover',
    alt: '검증된 책 표지',
    credit: '출판사',
    sourceUrl: 'https://example.com/book',
    isbn13: '9788934985068',
    edition: '한국어판',
    verifiedAt: '2026-08-12',
    rightsNote: '서지 식별용',
    checksum: `sha256:${'a'.repeat(64)}`,
  },
  asset: { src: '/_astro/cover.jpg', width: 451, height: 687, format: 'jpg' },
} as ResolvedMedia;

function reviewEntry(overrides: Record<string, unknown> = {}): SiteEntry {
  return {
    collection: 'reviews',
    id: 'factfulness',
    data: {
      title: '팩트풀니스',
      description: '세상을 사실로 읽는 법',
      createdAt: new Date('2020-01-01'),
      updatedAt: new Date('2026-08-12'),
      completedAt: new Date('2020-05-05'),
      tags: ['판단'],
      status: 'published',
      draft: false,
      itemType: 'book',
      itemTitle: '팩트풀니스',
      itemAuthor: ['한스 로슬링', '올라 로슬링'],
      isbn13: '9788934985068',
      publisher: '김영사',
      editionLabel: '2019 한국어판',
      readEditionVerified: false,
      verdict: '공포보다 비율을 먼저 보게 한다.',
      coverState: 'verified',
      coverMedia: 'cover',
      relationships: [
        { target: 'articles/calibration', relation: 'extends', reason: '판단 교정을 확장한다.' },
      ],
      ...overrides,
    },
  } as unknown as SiteEntry;
}

describe('content view models', () => {
  it('normalizes a record summary and resolves its optional media through an injected resolver', () => {
    const calls: string[] = [];
    const result = toRecordSummary(reviewEntry(), (collection, slug, id) => {
      calls.push(`${collection}/${slug}/${id}`);
      return cover;
    });

    expect(calls).toEqual(['reviews/factfulness/cover']);
    expect(result).toMatchObject({
      id: 'factfulness',
      href: '/reviews/factfulness/',
      collection: 'reviews',
      typeLabel: 'Review',
      title: '팩트풀니스',
      description: '세상을 사실로 읽는 법',
      primaryDate: new Date('2020-05-05'),
      tags: ['판단'],
      authors: ['한스 로슬링', '올라 로슬링'],
      coverState: 'verified',
      verdict: '공포보다 비율을 먼저 보게 한다.',
      media: cover,
    });
    expect(result).not.toHaveProperty('evidenceState');
  });

  it('leaves media undefined when a media id cannot be resolved', () => {
    const result = toRecordSummary(reviewEntry(), () => {
      throw new Error('unknown media id');
    });

    expect(result.media).toBeUndefined();
    expect(result.coverState).toBe('verified');
  });

  it('preserves an explicit cover hold without attempting remote fallback', () => {
    const result = toRecordSummary(reviewEntry({ coverState: 'hold', coverMedia: undefined }), () => {
      throw new Error('a hold must not resolve media');
    });

    expect(result.coverState).toBe('hold');
    expect(result.media).toBeUndefined();
    expect(result.authors).toEqual(['한스 로슬링', '올라 로슬링']);
  });

  it('normalizes a single review author and only exposes exact-source memory', () => {
    const memoryLinks = {
      linked: [
        {
          slug: 'routing-problem',
          claimKo: '컨텍스트 품질은 라우팅 문제다.',
          memoryHref: '/memory/?node=thought%3Arouting-problem',
        },
      ],
      related: [
        {
          slug: 'tag-only',
          claimKo: '태그만 같은 기억',
          memoryHref: '/memory/?node=thought%3Atag-only',
        },
      ],
      total: 2,
    } as ContentMemoryLinks;

    const detail = toRecordDetail(
      reviewEntry({ itemAuthor: '한스 로슬링', dek: '숫자를 읽는 태도를 바꾸는 책.' }),
      memoryLinks,
      () => cover,
    );

    expect(detail.authors).toEqual(['한스 로슬링']);
    expect(detail.dek).toBe('숫자를 읽는 태도를 바꾸는 책.');
    expect(detail.readEditionVerified).toBe(false);
    expect(detail.relationships).toEqual([
      { target: 'articles/calibration', relation: 'extends', reason: '판단 교정을 확장한다.' },
    ]);
    expect(detail.directMemory).toEqual([
      {
        slug: 'routing-problem',
        claimKo: '컨텍스트 품질은 라우팅 문제다.',
        href: '/memory/?node=thought%3Arouting-problem',
      },
    ]);
    expect(detail.directMemory.map((item) => item.slug)).not.toContain('tag-only');
  });

  it('exposes article evidence state without review-only fields', () => {
    const article = {
      collection: 'articles',
      id: 'agent-harness',
      data: {
        title: '에이전트 하네스',
        description: '실행 순서와 검증을 강제한다.',
        createdAt: new Date('2026-08-01'),
        updatedAt: new Date('2026-08-12'),
        tags: ['agents'],
        status: 'published',
        draft: false,
        evidenceState: 'verified',
        relationships: [],
      },
    } as unknown as SiteEntry;

    const summary = toRecordSummary(article, () => undefined);
    const detail = toRecordDetail(article, { linked: [] }, () => undefined);

    expect(summary.evidenceState).toBe('verified');
    expect(summary).not.toHaveProperty('verdict');
    expect(detail.authors).toEqual([]);
    expect(detail.readEditionVerified).toBe(false);
  });
});
