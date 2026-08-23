import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { isPublicRecord } from '../../contracts/src/public-release';
import {
  loadPublicMemoryRecords,
  loadSourceRecords,
  parseSourceRecord,
  resolveSourceMedia,
} from '../src/source-records';

const expectedPublicIds = [
  'articles/ai-design-references',
  'articles/andrej-karpathy-skills-analysis',
  'articles/codex-ui-mockup-workflow',
  'articles/context-refinement-system-design',
  'articles/graphify-code-knowledge-graph-deep-dive',
  'articles/hermes-agent-persistent-worker-runtime',
  'articles/lazycodex-agent-harness-analysis',
  'articles/oh-my-pi-deep-review',
  'articles/open-design-repo-analysis',
  'articles/pgvector-hybrid-search',
  'articles/ponytail-agent-minimalism-analysis',
  'articles/postgresql-bm25-pg-search',
  'articles/why-i-read-in-the-ai-era',
  'memory/agent-harnesses-are-operating-systems',
  'memory/agent-workflows-need-review-gates',
  'memory/ai-design-tools-need-judgment-loops',
  'memory/context-quality-is-routing-problem',
  'memory/local-agent-products-are-work-shells',
  'memory/memory-needs-retrieval-not-decoration',
  'memory/personal-sites-should-show-records-first',
  'reviews/art-thief',
  'reviews/black-swan',
  'reviews/changing-their-minds',
  'reviews/convenience-store-woman',
  'reviews/devotion-of-suspect-x',
  'reviews/doing-good-better',
  'reviews/factfulness',
  'reviews/future-arrived-first',
  'reviews/goethe-said-everything',
  'reviews/habitus',
  'reviews/how-adam-smith-can-change-your-life',
  'reviews/how-we-crossed-winter',
  'reviews/lolita',
  'reviews/lord-of-the-flies',
  'reviews/miracles-of-namiya-general-store',
  'reviews/nevertheless',
  'reviews/poor-charlies-almanack',
  'reviews/siddhartha',
] as const;

const expectedNonPublicIds = [
  'analysis/example-url-analysis',
  'articles/agents-md-vs-agent-skills-evidence',
  'articles/aws-static-frontend-serverless-bff',
  'articles/example-article',
  'articles/karpathy-delete-everything-keep-graph',
  'articles/shared-ai-conversation-evidence-boundaries',
  'articles/uncle-bob-ai-code-review-evidence',
  'ideas/example-idea',
  'reviews/example-book-review',
  'travel/example-travel-note',
] as const;

describe('source record parsing', () => {
  it('normalizes shared defaults and strips private fields', () => {
    const parsed = parseSourceRecord({
      collection: 'articles',
      id: 'safe',
      title: 'Safe',
      description: 'Safe',
      createdAt: '2026-08-23',
      updatedAt: '2026-08-23',
      status: 'published',
      privatePath: '/Users/user/private/source.md',
      jobPrompt: 'secret',
    });

    expect(parsed).toMatchObject({
      collection: 'articles',
      id: 'safe',
      href: '/articles/safe/',
      status: 'published',
      draft: false,
      tags: [],
      relationships: [],
    });
    expect('privatePath' in parsed).toBe(false);
    expect('jobPrompt' in parsed).toBe(false);
  });

  it('preserves the current analysis source-colophon fields', () => {
    const parsed = parseSourceRecord({
      collection: 'analysis',
      id: 'source-review',
      title: 'Source review',
      description: 'A source-backed analysis',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      sourceTitle: 'Primary source',
      sourceUrl: 'https://example.com/source',
      comment: 'Public analysis context',
      format: 'research-report',
      rawSource: '<private bytes>',
    });

    expect(parsed).toMatchObject({
      collection: 'analysis',
      href: '/analysis/source-review/',
      sourceTitle: 'Primary source',
      sourceUrl: 'https://example.com/source',
      comment: 'Public analysis context',
      format: 'research-report',
      status: 'review',
      draft: false,
      tags: [],
      relationships: [],
    });
    expect('rawSource' in parsed).toBe(false);
  });

  it('reproduces article fields and ISO date normalization', () => {
    const parsed = parseSourceRecord({
      collection: 'articles',
      id: 'article-fields',
      title: 'Article',
      description: 'Article fields',
      createdAt: '2026-08-21',
      updatedAt: new Date('2026-08-23T00:00:00.000Z'),
      dek: 'A public deck',
      relationships: [{
        target: 'memory/context-quality-is-routing-problem',
        relation: 'supports',
        reason: 'The current public relation explains the article.',
      }],
      recordKind: 'essay',
      evidenceState: 'verified',
      featuredMedia: 'lead',
    });

    expect(parsed).toMatchObject({
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
      dek: 'A public deck',
      relationships: [{
        target: 'memory/context-quality-is-routing-problem',
        relation: 'supports',
        reason: 'The current public relation explains the article.',
      }],
      recordKind: 'essay',
      evidenceState: 'verified',
      featuredMedia: 'lead',
    });
  });

  it('defaults idea maturity and keeps only the authored prompt field', () => {
    const parsed = parseSourceRecord({
      collection: 'ideas',
      id: 'idea-fields',
      title: 'Idea',
      description: 'Idea fields',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      prompt: 'An authored idea prompt',
      jobPrompt: 'An ingestion prompt',
    });

    expect(parsed).toMatchObject({
      collection: 'ideas',
      href: '/ideas/idea-fields/',
      maturity: 'sketch',
      prompt: 'An authored idea prompt',
    });
    expect('jobPrompt' in parsed).toBe(false);
  });

  it('preserves the review fields and defaults edition verification', () => {
    const parsed = parseSourceRecord({
      collection: 'reviews',
      id: 'review-fields',
      title: 'Internal review title',
      description: 'Review fields',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      itemType: 'book',
      itemTitle: 'Public book title',
      itemAuthor: ['Author One', 'Author Two'],
      isbn13: '9788990247674',
      editionLabel: '2018 edition',
      publisher: 'Publisher',
      coverState: 'verified',
      coverMedia: 'cover',
      verdict: 'A public verdict',
      rating: 4.5,
      completedAt: '2026-08-20',
      sourceUrl: 'https://example.com/book',
      embedding: [0.1, 0.2],
    });

    expect(parsed).toMatchObject({
      collection: 'reviews',
      href: '/reviews/review-fields/',
      itemType: 'book',
      itemTitle: 'Public book title',
      itemAuthor: ['Author One', 'Author Two'],
      isbn13: '9788990247674',
      editionLabel: '2018 edition',
      readEditionVerified: false,
      publisher: 'Publisher',
      coverState: 'verified',
      coverMedia: 'cover',
      verdict: 'A public verdict',
      rating: 4.5,
      completedAt: '2026-08-20T00:00:00.000Z',
      sourceUrl: 'https://example.com/book',
    });
    expect('embedding' in parsed).toBe(false);
  });

  it('preserves travel fields while defaulting the privacy review', () => {
    const parsed = parseSourceRecord({
      collection: 'travel',
      id: 'travel-fields',
      title: 'Travel',
      description: 'Travel fields',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      location: 'Tokyo',
      visitedAt: '2026-08-20',
      coordinates: { latitude: 35.6764, longitude: 139.65 },
      leadMedia: 'lead',
      jobPayload: { destination: 'private' },
    });

    expect(parsed).toMatchObject({
      collection: 'travel',
      href: '/travel/travel-fields/',
      location: 'Tokyo',
      visitedAt: '2026-08-20T00:00:00.000Z',
      coordinates: { latitude: 35.6764, longitude: 139.65 },
      leadMedia: 'lead',
      privacyReviewed: false,
    });
    expect('jobPayload' in parsed).toBe(false);
  });

  it('rejects an update date before its creation date', () => {
    expect(() => parseSourceRecord({
      collection: 'articles',
      id: 'backwards-date',
      title: 'Backwards date',
      description: 'Invalid chronology',
      createdAt: '2026-08-23',
      updatedAt: '2026-08-21',
    })).toThrow('updatedAt must be on or after createdAt');
  });
});

describe('framework-neutral corpus loading', () => {
  const root = process.cwd();
  let records: Awaited<ReturnType<typeof loadSourceRecords>>;
  let memoryRecords: Awaited<ReturnType<typeof loadPublicMemoryRecords>>;
  let baselineRoutes: Set<string>;

  beforeAll(async () => {
    records = await loadSourceRecords(root);
    memoryRecords = await loadPublicMemoryRecords(root);
    const baseline = JSON.parse(await readFile(
      new URL('../../../tests/fixtures/parity/astro-public-baseline.json', import.meta.url),
      'utf8',
    )) as { routes: Array<{ path: string }> };
    baselineRoutes = new Set(baseline.routes.map((route) => route.path));
  });

  it('parses all 41 MDX records without Astro imports and preserves authored bodies', () => {
    expect(records).toHaveLength(41);
    expect(records.find((record) => record.id === 'why-i-read-in-the-ai-era')).toMatchObject({
      collection: 'articles',
      status: 'published',
      draft: false,
      recordKind: 'essay',
      evidenceState: 'personal',
      featuredMedia: 'reading-desk-cobalt',
    });
    expect(records.find((record) => record.id === 'why-i-read-in-the-ai-era')?.body).toContain('나는 AI 때문에 책을 읽기 시작했다.');
  });

  it('reconciles the complete public ID set against the frozen Astro baseline', () => {
    const publicContent = records.filter(isPublicRecord);
    const actualPublicIds = [
      ...publicContent.map((record) => `${record.collection}/${record.id}`),
      ...memoryRecords.map((record) => `${record.collection}/${record.id}`),
    ].sort();

    expect(actualPublicIds).toEqual(expectedPublicIds);
    for (const record of publicContent) {
      expect(baselineRoutes.has(record.href), `${record.collection}/${record.id} missing from baseline`).toBe(true);
    }
    for (const record of memoryRecords) {
      expect(baselineRoutes.has(record.href), `memory/${record.id} missing from baseline`).toBe(true);
    }
  });

  it('enumerates every non-public or draft source ID and proves its route is absent', () => {
    const nonPublic = records.filter((record) => !isPublicRecord(record));

    expect(nonPublic.map((record) => `${record.collection}/${record.id}`).sort()).toEqual(expectedNonPublicIds);
    for (const record of nonPublic) {
      expect(baselineRoutes.has(record.href), `${record.collection}/${record.id} leaked into baseline`).toBe(false);
    }
  });

  it('converts only projection-backed memory data to path-free public records', () => {
    expect(memoryRecords).toHaveLength(7);
    const context = memoryRecords.find((record) => record.id === 'context-quality-is-routing-problem');

    expect(context).toMatchObject({
      collection: 'memory',
      href: '/memory/context-quality-is-routing-problem/',
      claimKo: '컨텍스트 품질은 프롬프트 문장력이 아니라 라우팅과 검증 구조의 문제다.',
      sources: [{
        title: 'Context Refinement System 설계 요약',
        href: '/articles/context-refinement-system-design/',
      }],
    });
    expect(context?.bodyHtml).toContain('<p>This thought is the first public memory seed');
    expect(context?.companions.map((companion) => companion.slug).sort()).toEqual([
      'agent-harnesses-are-operating-systems',
      'agent-workflows-need-review-gates',
    ]);
    expect(JSON.stringify(memoryRecords)).not.toMatch(/sourcePath|privatePath|memory\/thoughts\//);
  });

  it('resolves current public media with dimensions and immutable provenance but no source path', async () => {
    const lead = await resolveSourceMedia(root, 'articles', 'why-i-read-in-the-ai-era', 'reading-desk-cobalt');
    const cover = await resolveSourceMedia(root, 'reviews', 'black-swan', 'cover');

    expect(lead).toMatchObject({
      src: '/assets/content/articles/why-i-read-in-the-ai-era/reading-desk-cobalt.png',
      width: 1536,
      height: 1024,
      format: 'png',
      checksum: 'sha256:aafdd214e2586dd5622aaa1c49d90d5b84dd6b5223a5500d915248a62327ca56',
    });
    expect(cover).toMatchObject({
      src: '/assets/content/reviews/black-swan/cover.jpg',
      width: 458,
      height: 671,
      format: 'jpg',
      checksum: 'sha256:2b59925c7925d38b5460450f070be24a22ee34a69dfb7ded04d269998b7d0ebd',
    });
    expect(JSON.stringify([lead, cover])).not.toMatch(/sourcePath|privatePath|\/Users\/user/);
  });

  it('rejects a media lookup that attempts to leave the public asset collections', async () => {
    await expect(resolveSourceMedia(root, '../../memory' as never, 'private', 'record')).rejects.toThrow(
      'unsupported public collection',
    );
  });
});
