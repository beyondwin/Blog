import { describe, expect, expectTypeOf, it } from 'vitest';
import { parsePublicRecord } from '../src/public-release';
import type { PublicRecord } from '../src/content';

const publicMediaFixture = {
  id: 'reading-desk-cobalt',
  kind: 'illustration',
  src: '/assets/content/articles/article-render/reading-desk-cobalt.png',
  alt: '밝은 회백색 책상 위에 펼친 책과 은색 노트북',
  caption: '판단을 위해 천천히 읽는 장면',
  credit: 'beyondwin',
  verifiedAt: '2026-08-22',
  rightsNote: 'Repository-authored public illustration.',
  width: 1536,
  height: 1024,
  format: 'png',
  checksum: 'sha256:aafdd214e2586dd5622aaa1c49d90d5b84dd6b5223a5500d915248a62327ca56',
  file: '/Users/user/private/reading-desk-cobalt.png',
  sourcePath: 'memory/private-source.md',
};

function commonFields(collection: string, id: string) {
  return {
    collection,
    id,
    href: `/${collection}/${id}/`,
    title: 'Public title',
    description: 'Public description',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    tags: ['public'],
    media: [publicMediaFixture],
    relationships: [{
      target: 'memory/context-quality-is-routing-problem',
      relation: 'supports',
      reason: 'This approved relation is rendered as continued discovery.',
    }],
    memoryLinks: [{
      slug: 'context-quality-is-routing-problem',
      claimKo: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
      href: '/memory/context-quality-is-routing-problem/',
      kind: 'direct',
    }],
    bodyHtml: '<p>Rendered public body.</p>',
    privatePath: '/Users/user/private/source.mdx',
    jobPrompt: 'secret',
    embedding: [0.1, 0.2],
    rawSource: '<private bytes>',
    jobPayload: { internal: true },
  };
}

function articleWithMediaSrc(src: string) {
  return {
    ...commonFields('articles', 'media-path-boundary'),
    media: [{ ...publicMediaFixture, src }],
  };
}

function memoryWithSourceHref(href: string) {
  return {
    ...commonFields('memory', 'source-href-boundary'),
    media: [],
    relationships: [],
    memoryLinks: [],
    claimKo: 'Safe public claim',
    body: 'Safe public body',
    memoryType: 'semantic',
    origin: 'author',
    topics: [],
    theses: [],
    sources: [{ title: 'Public source', href }],
    companions: [],
  };
}

function publicReviewEvidence() {
  return {
    state: 'approved' as const,
    decision: 'approve-public-redistribution' as const,
    decisionDocument: 'docs/notes/project/assets/review-cover-rights/review-render/redistribution-decision.yml',
    decisionChecksum: `sha256:${'1'.repeat(64)}`,
    sourceAsset: '/assets/content/reviews/review-render/cover.png',
    sourceChecksum: `sha256:${'2'.repeat(64)}`,
    width: 320,
    height: 480,
    bibliographicIdentity: {
      title: 'The Black Swan',
      authors: ['Nassim Nicholas Taleb'],
      publisher: 'Dongnyeok Science',
      isbn13: '9788990247674',
      editionLabel: '2018 edition',
      publicationYear: 2018,
    },
  };
}

describe('public record allowlists', () => {
  it('keeps the common render contract and strips nested filesystem locators', () => {
    const parsed = parsePublicRecord({
      ...commonFields('articles', 'article-render'),
      recordKind: 'essay',
      evidenceState: 'verified',
      featuredMedia: 'reading-desk-cobalt',
    });

    expect(parsed).toMatchObject({
      collection: 'articles',
      id: 'article-render',
      href: '/articles/article-render/',
      title: 'Public title',
      description: 'Public description',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
      tags: ['public'],
      relationships: [{
        target: 'memory/context-quality-is-routing-problem',
        relation: 'supports',
        reason: 'This approved relation is rendered as continued discovery.',
      }],
      memoryLinks: [{
        slug: 'context-quality-is-routing-problem',
        claimKo: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
        href: '/memory/context-quality-is-routing-problem/',
        kind: 'direct',
      }],
      bodyHtml: '<p>Rendered public body.</p>',
      recordKind: 'essay',
      evidenceState: 'verified',
      featuredMedia: 'reading-desk-cobalt',
    });
    expect(parsed.media[0]).toEqual({
      id: 'reading-desk-cobalt',
      kind: 'illustration',
      src: '/assets/content/articles/article-render/reading-desk-cobalt.png',
      alt: '밝은 회백색 책상 위에 펼친 책과 은색 노트북',
      caption: '판단을 위해 천천히 읽는 장면',
      credit: 'beyondwin',
      verifiedAt: '2026-08-22',
      rightsNote: 'Repository-authored public illustration.',
      width: 1536,
      height: 1024,
      format: 'png',
      checksum: 'sha256:aafdd214e2586dd5622aaa1c49d90d5b84dd6b5223a5500d915248a62327ca56',
    });
    expectTypeOf(parsed).toEqualTypeOf<PublicRecord>();
  });

  it.each([
    '/Users/user/private/cover.png',
    '/etc/passwd',
    '/assets/content/articles/safe/../private.png',
    '/assets/content/articles/safe/%2e%2e/private.png',
    '/assets/content/articles/safe/%252e%252e/private.png',
  ])('rejects a non-canonical allowlisted media src: %s', (src) => {
    expect(() => parsePublicRecord(articleWithMediaSrc(src))).toThrow();
  });

  it.each([
    '/assets/content/articles/article-render/reading-desk-cobalt.png',
    '/assets/content/reviews/black-swan/cover.avif',
    '/assets/content/thoughts/why-i-read-in-the-ai-era/reading-desk-cobalt.png',
  ])('accepts a canonical public media src: %s', (src) => {
    expect(parsePublicRecord(articleWithMediaSrc(src)).media[0].src).toBe(src);
  });

  it.each([
    '/Users/user/private/source.mdx',
    '/etc/passwd',
    '/articles/safe/../private/',
    '/articles/safe/%2e%2e/private/',
    '/articles/safe/%252e%252e/private/',
    '/memory/private-source/',
  ])('rejects a non-approved allowlisted memory source href: %s', (href) => {
    expect(() => parsePublicRecord(memoryWithSourceHref(href))).toThrow();
  });

  it.each([
    '/articles/context-refinement-system-design/',
    '/analysis/source-review/',
    '/ideas/public-idea/',
    '/reviews/black-swan/',
    '/travel/tokyo/',
    '/thoughts/why-i-read-in-the-ai-era/',
    'https://example.com/public-source',
  ])('accepts an approved public memory source href: %s', (href) => {
    const parsed = parsePublicRecord(memoryWithSourceHref(href));
    expect(parsed.collection).toBe('memory');
    if (parsed.collection === 'memory') expect(parsed.sources[0].href).toBe(href);
  });

  it('preserves analysis colophon fields and strips sibling collection fields', () => {
    const parsed = parsePublicRecord({
      ...commonFields('analysis', 'analysis-render'),
      media: [],
      sourceTitle: 'Primary source',
      sourceUrl: 'https://example.com/source',
      comment: 'Public source context',
      format: 'research-report',
      prompt: 'not rendered',
      coordinates: { latitude: 1, longitude: 2 },
    });

    expect(parsed).toMatchObject({
      collection: 'analysis',
      sourceTitle: 'Primary source',
      sourceUrl: 'https://example.com/source',
      comment: 'Public source context',
      format: 'research-report',
    });
    expect('prompt' in parsed).toBe(false);
    expect('coordinates' in parsed).toBe(false);
  });

  it('keeps only current public article subtype fields', () => {
    const parsed = parsePublicRecord({
      ...commonFields('articles', 'article-fields'),
      recordKind: 'research',
      evidenceState: 'source-grounded',
      featuredMedia: 'reading-desk-cobalt',
      sourceTitle: 'wrong collection',
    });

    expect(parsed).toMatchObject({
      recordKind: 'research',
      evidenceState: 'source-grounded',
      featuredMedia: 'reading-desk-cobalt',
    });
    expect('sourceTitle' in parsed).toBe(false);
  });

  it('parses a public thought at its canonical route', () => {
    const thought = parsePublicRecord({
      collection: 'thoughts',
      id: 'why-i-read-in-the-ai-era',
      href: '/thoughts/why-i-read-in-the-ai-era/',
      title: 'AI 시대에, 나는 왜 책을 읽는가',
      description: '빠른 답이 넘칠수록 읽는 시간은 판단의 근육이 된다.',
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
      tags: ['reading'],
      media: [],
      relationships: [],
      memoryLinks: [],
      bodyHtml: '<p>읽기는 판단을 늦추는 일이다.</p>',
    });

    expect(thought.href).toBe('/thoughts/why-i-read-in-the-ai-era/');
  });

  it('normalizes a review author to the public author list and keeps render fields', () => {
    const parsed = parsePublicRecord({
      ...commonFields('reviews', 'review-render'),
      title: 'Black Swan',
      itemType: 'book',
      itemTitle: 'The Black Swan',
      authors: ['Nassim Nicholas Taleb'],
      isbn13: '9788990247674',
      editionLabel: '2018 edition',
      readEditionVerified: true,
      publisher: 'Dongnyeok Science',
      publicationYear: 2018,
      coverState: 'verified',
      coverMedia: 'cover',
      verdict: 'A public verdict',
      rating: 4.5,
      completedAt: '2026-08-20T00:00:00.000Z',
      sourceUrl: 'https://example.com/book',
      itemAuthor: 'private source shape',
    });

    expect(parsed).toMatchObject({
      itemType: 'book',
      itemTitle: 'The Black Swan',
      authors: ['Nassim Nicholas Taleb'],
      isbn13: '9788990247674',
      editionLabel: '2018 edition',
      readEditionVerified: true,
      publisher: 'Dongnyeok Science',
      publicationYear: 2018,
      coverState: 'verified',
      coverMedia: 'cover',
      verdict: 'A public verdict',
      rating: 4.5,
      completedAt: '2026-08-20T00:00:00.000Z',
      sourceUrl: 'https://example.com/book',
    });
    expect('itemAuthor' in parsed).toBe(false);
  });

  it('preserves only the canonical checksum-bound public cover redistribution evidence', () => {
    const evidence = publicReviewEvidence();
    const parsed = parsePublicRecord({
      ...commonFields('reviews', 'review-render'),
      media: [{
        ...publicMediaFixture,
        id: 'cover',
        kind: 'book-cover',
        src: '/assets/content/reviews/review-render/cover.png',
        checksum: evidence.sourceChecksum,
        width: evidence.width,
        height: evidence.height,
        redistributionEvidence: evidence,
      }],
      itemType: 'book',
      itemTitle: evidence.bibliographicIdentity.title,
      authors: ['Nassim Nicholas Taleb'],
      isbn13: evidence.bibliographicIdentity.isbn13,
      editionLabel: evidence.bibliographicIdentity.editionLabel,
      readEditionVerified: true,
      publisher: 'Dongnyeok Science',
      publicationYear: 2018,
      coverState: 'verified',
      coverMedia: 'cover',
      verdict: 'A public verdict',
    });

    expect(parsed.media[0]).toMatchObject({ redistributionEvidence: evidence });
    expect(JSON.stringify(parsed)).not.toMatch(/rightsEvidence|evidencePath|evidenceUrl|evidenceChecksum|retrievedAt|scope/u);
  });

  it.each([
    ['rightsEvidence', { type: 'written-permission' }],
    ['evidencePath', 'docs/notes/project/assets/review-cover-rights/review-render/rights-evidence.txt'],
    ['evidenceUrl', 'https://example.com/private-license'],
    ['evidenceChecksum', `sha256:${'3'.repeat(64)}`],
    ['retrievedAt', '2026-08-29'],
    ['scope', 'public website redistribution of the exact cover asset'],
  ])('rejects private review rights field %s at the public record top level', (field, value) => {
    expect(() => parsePublicRecord({
      ...commonFields('reviews', 'review-private-field'),
      itemType: 'book',
      itemTitle: 'Private field fixture',
      authors: ['Author'],
      readEditionVerified: false,
      [field]: value,
    })).toThrow();
  });

  it.each(['rightsEvidence', 'evidencePath', 'evidenceUrl', 'evidenceChecksum', 'retrievedAt', 'scope'])(
    'rejects private review rights field %s nested in public media',
    (field) => {
      expect(() => parsePublicRecord({
        ...commonFields('reviews', 'review-private-media-field'),
        media: [{
          ...publicMediaFixture,
          id: 'cover',
          kind: 'book-cover',
          src: '/assets/content/reviews/review-private-media-field/cover.png',
          [field]: field === 'rightsEvidence' ? { type: 'written-permission' } : 'private',
        }],
        itemType: 'book',
        itemTitle: 'Private nested field fixture',
        authors: ['Author'],
        readEditionVerified: false,
      })).toThrow();
    },
  );

  it.each(['rightsEvidence', 'evidencePath', 'evidenceUrl', 'evidenceChecksum', 'retrievedAt', 'scope'])(
    'rejects private review rights field %s nested in public redistribution evidence',
    (field) => {
      const evidence = { ...publicReviewEvidence(), [field]: field === 'rightsEvidence' ? { type: 'written-permission' } : 'private' };
      expect(() => parsePublicRecord({
        ...commonFields('reviews', 'review-private-evidence-field'),
        media: [{
          ...publicMediaFixture,
          id: 'cover',
          kind: 'book-cover',
          src: evidence.sourceAsset,
          checksum: evidence.sourceChecksum,
          width: evidence.width,
          height: evidence.height,
          redistributionEvidence: evidence,
        }],
        itemType: 'book',
        itemTitle: evidence.bibliographicIdentity.title,
        authors: evidence.bibliographicIdentity.authors,
        isbn13: evidence.bibliographicIdentity.isbn13,
        editionLabel: evidence.bibliographicIdentity.editionLabel,
        readEditionVerified: true,
        publisher: evidence.bibliographicIdentity.publisher,
        publicationYear: evidence.bibliographicIdentity.publicationYear,
        coverState: 'verified',
        coverMedia: 'cover',
      })).toThrow();
    },
  );

  it('keeps idea maturity but omits prompts because the current route does not render them', () => {
    const parsed = parsePublicRecord({
      ...commonFields('ideas', 'idea-render'),
      media: [],
      maturity: 'proposal',
      prompt: 'private until a public route consumes it',
    });

    expect(parsed).toMatchObject({ collection: 'ideas', maturity: 'proposal' });
    expect('prompt' in parsed).toBe(false);
  });

  it('keeps public travel fields while omitting coordinates by default', () => {
    const parsed = parsePublicRecord({
      ...commonFields('travel', 'travel-render'),
      location: 'Tokyo',
      visitedAt: '2026-08-20T00:00:00.000Z',
      leadMedia: 'reading-desk-cobalt',
      coordinates: { latitude: 35.6764, longitude: 139.65 },
    });

    expect(parsed).toMatchObject({
      collection: 'travel',
      location: 'Tokyo',
      visitedAt: '2026-08-20T00:00:00.000Z',
      leadMedia: 'reading-desk-cobalt',
    });
    expect('coordinates' in parsed).toBe(false);
  });

  it('keeps only projection-backed memory claims, safe sources, and companions', () => {
    const parsed = parsePublicRecord({
      ...commonFields('memory', 'context-quality-is-routing-problem'),
      title: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
      description: 'Context quality is a routing and verification problem.',
      media: [],
      relationships: [],
      memoryLinks: [],
      claimKo: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
      claimEn: 'Context quality is a routing and verification problem.',
      body: 'This public thought anchors routing and verification.',
      memoryType: 'semantic',
      origin: 'author',
      topics: ['ai-workflow'],
      theses: ['ai-workflow-quality'],
      sources: [{ title: 'Context Refinement System 설계 요약', href: '/articles/context-refinement-system-design/' }],
      companions: [{
        slug: 'agent-workflows-need-review-gates',
        claimKo: '에이전트 워크플로우는 검토 게이트가 필요하다.',
        href: '/memory/agent-workflows-need-review-gates/',
      }],
      privateMemoryRecord: { confidentiality: 'private' },
      sourcePath: 'memory/thoughts/private.md',
    });

    expect(parsed).toMatchObject({
      collection: 'memory',
      claimKo: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
      claimEn: 'Context quality is a routing and verification problem.',
      body: 'This public thought anchors routing and verification.',
      memoryType: 'semantic',
      origin: 'author',
      topics: ['ai-workflow'],
      theses: ['ai-workflow-quality'],
      sources: [{ title: 'Context Refinement System 설계 요약', href: '/articles/context-refinement-system-design/' }],
      companions: [{
        slug: 'agent-workflows-need-review-gates',
        claimKo: '에이전트 워크플로우는 검토 게이트가 필요하다.',
        href: '/memory/agent-workflows-need-review-gates/',
      }],
    });
    expect('privateMemoryRecord' in parsed).toBe(false);
    expect('sourcePath' in parsed).toBe(false);
  });
});
