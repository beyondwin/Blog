import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { isPublicRecord } from '../../contracts/src/public-release';
import {
  loadPublicMemoryRecords,
  loadSourceRecords,
  parseSourceRecord,
  resolveSourceMedia,
} from '../src/source-records';
import { writeReleaseFixture } from './helpers/release-fixture';
import { readActiveRelease } from '../src/release/read-release';

const expectedPublicIds = [
  'articles/agents-md-vs-agent-skills-evidence',
  'articles/ai-design-references',
  'articles/andrej-karpathy-skills-analysis',
  'articles/aws-static-frontend-serverless-bff',
  'articles/codex-ui-mockup-workflow',
  'articles/context-refinement-system-design',
  'articles/graphify-code-knowledge-graph-deep-dive',
  'articles/hermes-agent-persistent-worker-runtime',
  'articles/karpathy-delete-everything-keep-graph',
  'articles/lazycodex-agent-harness-analysis',
  'articles/oh-my-pi-deep-review',
  'articles/open-design-repo-analysis',
  'articles/pgvector-hybrid-search',
  'articles/ponytail-agent-minimalism-analysis',
  'articles/postgresql-bm25-pg-search',
  'articles/shared-ai-conversation-evidence-boundaries',
  'articles/uncle-bob-ai-code-review-evidence',
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
  'thoughts/why-i-read-in-the-ai-era',
] as const;

const expectedNonPublicIds = [
  'analysis/example-url-analysis',
  'articles/coding-agent-schema-cache-failure',
  'articles/example-article',
  'ideas/example-idea',
  'reviews/example-book-review',
  'travel/example-travel-note',
] as const;

function isoBox(type: string, ...payloads: Buffer[]): Buffer {
  const size = 8 + payloads.reduce((total, payload) => total + payload.length, 0);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, ...payloads]);
}

function ambiguousAvifFixture(...dimensions: Array<{ width: number; height: number }>): Buffer {
  const fileType = Buffer.alloc(12);
  fileType.write('avif', 0, 4, 'ascii');
  fileType.writeUInt32BE(0, 4);
  fileType.write('avif', 8, 4, 'ascii');

  const imageSpatialExtents = dimensions.map(({ width, height }) => {
    const payload = Buffer.alloc(12);
    payload.writeUInt32BE(0, 0);
    payload.writeUInt32BE(width, 4);
    payload.writeUInt32BE(height, 8);
    return isoBox('ispe', payload);
  });

  const metaHeader = Buffer.alloc(4);
  return Buffer.concat([
    isoBox('ftyp', fileType),
    isoBox('meta', metaHeader, isoBox('iprp', isoBox('ipco', ...imageSpatialExtents))),
  ]);
}

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

  it('accepts a thought source record with optional featured media', () => {
    const thought = parseSourceRecord({
      collection: 'thoughts',
      id: 'why-i-read-in-the-ai-era',
      title: 'AI 시대에, 나는 왜 책을 읽는가',
      description: '빠른 답이 넘칠수록 읽는 시간은 판단의 근육이 된다.',
      createdAt: '2026-08-16',
      updatedAt: '2026-08-26',
      tags: ['reading'],
      status: 'published',
      draft: false,
      featuredMedia: 'editorial-reading',
    });

    expect(thought).toMatchObject({
      collection: 'thoughts',
      href: '/thoughts/why-i-read-in-the-ai-era/',
      featuredMedia: 'editorial-reading',
    });
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
      publicationYear: 2018,
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
      publicationYear: 2018,
      coverState: 'verified',
      coverMedia: 'cover',
      verdict: 'A public verdict',
      rating: 4.5,
      completedAt: '2026-08-20T00:00:00.000Z',
      sourceUrl: 'https://example.com/book',
    });
    expect('embedding' in parsed).toBe(false);
  });

  it('keeps publicationYear optional and never infers it from editionLabel', () => {
    const parsed = parseSourceRecord({
      collection: 'reviews',
      id: 'review-without-publication-year',
      title: 'Review without structured year',
      description: 'The edition label contains a year but the structured field is absent.',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      itemType: 'book',
      itemTitle: 'Public book title',
      itemAuthor: ['Author One', 'Author Two'],
      isbn13: '9788990247674',
      editionLabel: 'Publisher 2018 edition',
      publisher: 'Publisher',
    });

    expect(parsed.collection).toBe('reviews');
    if (parsed.collection !== 'reviews') throw new Error('expected review fixture');
    expect(parsed.editionLabel).toBe('Publisher 2018 edition');
    expect(parsed).not.toHaveProperty('publicationYear');
  });

  it.each([999, 10000, 2026.5])('rejects invalid structured publicationYear %s', (publicationYear) => {
    expect(() => parseSourceRecord({
      collection: 'reviews',
      id: 'review-invalid-publication-year',
      title: 'Review with invalid structured year',
      description: 'Invalid year fixture.',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      itemType: 'book',
      itemTitle: 'Public book title',
      publicationYear,
    })).toThrow();
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

  it.each([
    ['review', {
      collection: 'reviews',
      id: 'draft-review',
      title: 'Draft review',
      description: 'Incomplete review scaffold',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      status: 'review',
      draft: true,
      itemType: 'book',
      itemTitle: 'Unreviewed book',
    }],
    ['travel', {
      collection: 'travel',
      id: 'draft-travel',
      title: 'Draft travel',
      description: 'Incomplete travel scaffold',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      status: 'review',
      draft: true,
      location: 'Unreviewed place',
    }],
  ])('keeps incomplete %s review-state drafts valid', (_collection, input) => {
    expect(parseSourceRecord(input)).toMatchObject({ status: 'review', draft: true });
  });

  it.each([
    {
      coverState: 'verified',
      coverMedia: undefined,
      error: 'coverState verified requires coverMedia',
    },
    {
      coverState: 'hold',
      coverMedia: 'unreleased-cover',
      error: 'coverState hold forbids coverMedia',
    },
  ] as const)('applies $coverState cover coherence only when the review is published', ({
    coverState,
    coverMedia,
    error,
  }) => {
    const fixture = {
      collection: 'reviews',
      id: `${coverState}-draft-review`,
      title: `${coverState} draft review`,
      description: 'Unpublished review fixture',
      createdAt: '2026-08-21',
      updatedAt: '2026-08-23',
      status: 'review',
      draft: true,
      itemType: 'book',
      itemTitle: 'Unpublished review item',
      coverState,
      ...(coverMedia ? { coverMedia } : {}),
    } as const;

    expect(parseSourceRecord(fixture)).toMatchObject({ status: 'review', draft: true, coverState });
    expect(() => parseSourceRecord({ ...fixture, status: 'published', draft: false })).toThrow(error);
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
  let releaseRoutes: Set<string>;

  beforeAll(async () => {
    records = await loadSourceRecords(root);
    memoryRecords = await loadPublicMemoryRecords(root);
    const activeRelease = await readActiveRelease(join(root, 'build/public-releases'));
    const releaseModule = await import(/* @vite-ignore */ pathToFileURL(
      resolve(root, 'apps/site/app/release.server.ts'),
    ).href) as { fullPublicPaths(release: typeof activeRelease): string[] };
    releaseRoutes = new Set(releaseModule.fullPublicPaths(activeRelease));
  });

  it('parses all 42 MDX records without Astro imports and preserves authored bodies', () => {
    expect(records).toHaveLength(42);
    expect(records.find((record) => record.id === 'why-i-read-in-the-ai-era')).toMatchObject({
      collection: 'thoughts',
      status: 'published',
      draft: false,
      featuredMedia: 'editorial-reading',
    });
    expect(records.find((record) => record.id === 'why-i-read-in-the-ai-era')?.body).toContain('나는 AI 때문에 책을 읽기 시작했다.');
  });

  it('reconciles the complete public ID set against the verified React release inventory', () => {
    const publicContent = records.filter(isPublicRecord);
    const actualPublicIds = [
      ...publicContent.map((record) => `${record.collection}/${record.id}`),
      ...memoryRecords.map((record) => `${record.collection}/${record.id}`),
    ].sort();

    expect(actualPublicIds).toEqual(expectedPublicIds);
    for (const record of publicContent) {
      expect(releaseRoutes.has(record.href), `${record.collection}/${record.id} missing from React release`).toBe(true);
    }
    for (const record of memoryRecords) {
      expect(releaseRoutes.has(record.href), `memory/${record.id} missing from React release`).toBe(true);
    }
  });

  it('enumerates every non-public or draft source ID and proves its route is absent', () => {
    const nonPublic = records.filter((record) => !isPublicRecord(record));

    expect(nonPublic.map((record) => `${record.collection}/${record.id}`).sort()).toEqual(expectedNonPublicIds);
    for (const record of nonPublic) {
      expect(releaseRoutes.has(record.href), `${record.collection}/${record.id} leaked into React release`).toBe(false);
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
    const lead = await resolveSourceMedia(root, 'thoughts', 'why-i-read-in-the-ai-era', 'reading-desk-cobalt');
    const cover = await resolveSourceMedia(root, 'reviews', 'black-swan', 'cover');

    expect(lead).toMatchObject({
      src: '/assets/content/thoughts/why-i-read-in-the-ai-era/reading-desk-cobalt.png',
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
    expectTypeOf(lead.format).toEqualTypeOf<'jpg' | 'jpeg' | 'png' | 'webp'>();
    expect(JSON.stringify([lead, cover])).not.toMatch(/sourcePath|privatePath|\/Users\/user/);
  });

  it('rejects ambiguous AVIF source input before dimension resolution', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-avif-source-'));
    const directory = join(fixtureRoot, 'src', 'assets', 'content', 'articles', 'avif-source');
    const asset = ambiguousAvifFixture(
      { width: 160, height: 90 },
      { width: 640, height: 480 },
    );
    const checksum = `sha256:${createHash('sha256').update(asset).digest('hex')}`;

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'lead.avif'), asset);
      const manifest = [
        'version: 1',
        'items:',
        '  - id: lead',
        '    file: lead.avif',
        '    kind: illustration',
        '    alt: A generated AVIF fixture',
        '    credit: Test fixture',
        '    sourcePath: src/content/articles/avif-source.mdx',
        '    verifiedAt: 2026-08-23',
        '    rightsNote: Generated in the test',
        '    width: 160',
        '    height: 90',
        `    checksum: ${checksum}`,
        '',
      ].join('\n');
      await writeFile(join(directory, 'media.yml'), manifest);

      await expect(resolveSourceMedia(fixtureRoot, 'articles', 'avif-source', 'lead')).rejects.toThrow(
        'source media input must use a verifiable PNG, JPEG, or WebP file',
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a media lookup that attempts to leave the public asset collections', async () => {
    await expect(resolveSourceMedia(root, '../../memory' as never, 'private', 'record')).rejects.toThrow(
      'unsupported public collection',
    );
  });
});

describe('allowlisted source file containment', () => {
  it('rejects a symlinked repository root before reading public content', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-repository-root-link-'));
    const fixtureRoot = join(sandbox, 'source');
    const linkedRoot = join(sandbox, 'source-link');

    try {
      await writeReleaseFixture(fixtureRoot);
      await symlink(fixtureRoot, linkedRoot, 'dir');

      await expect(loadSourceRecords(linkedRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked src ancestor before reading public content', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-content-src-link-'));
    const srcPath = join(fixtureRoot, 'src');
    const externalPath = join(fixtureRoot, 'external-src');

    try {
      await writeReleaseFixture(fixtureRoot);
      await rename(srcPath, externalPath);
      await symlink(externalPath, srcPath, 'dir');

      await expect(loadSourceRecords(fixtureRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked src ancestor before reading the public-memory projection', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-memory-src-link-'));
    const srcPath = join(fixtureRoot, 'src');
    const externalPath = join(fixtureRoot, 'external-src');

    try {
      await writeReleaseFixture(fixtureRoot);
      await rename(srcPath, externalPath);
      await symlink(externalPath, srcPath, 'dir');

      await expect(loadPublicMemoryRecords(fixtureRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked src/data directory before reading the public-memory projection', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-memory-data-link-'));
    const dataPath = join(fixtureRoot, 'src', 'data');
    const externalPath = join(fixtureRoot, 'external-data');

    try {
      await writeReleaseFixture(fixtureRoot);
      await rename(dataPath, externalPath);
      await symlink(externalPath, dataPath, 'dir');

      await expect(loadPublicMemoryRecords(fixtureRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked content leaf even when its target is a valid MDX record', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-content-leaf-link-'));
    const sourcePath = join(fixtureRoot, 'src', 'content', 'articles', 'public-fixture.mdx');
    const externalPath = join(fixtureRoot, 'external-public-fixture.mdx');

    try {
      await writeReleaseFixture(fixtureRoot);
      await rename(sourcePath, externalPath);
      await symlink(externalPath, sourcePath, 'file');

      await expect(loadSourceRecords(fixtureRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked content collection directory', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-content-directory-link-'));
    const collectionPath = join(fixtureRoot, 'src', 'content', 'articles');
    const externalPath = join(fixtureRoot, 'external-articles');

    try {
      await writeReleaseFixture(fixtureRoot);
      await rename(collectionPath, externalPath);
      await symlink(externalPath, collectionPath, 'dir');

      await expect(loadSourceRecords(fixtureRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked public-memory projection leaf', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-memory-leaf-link-'));
    const projectionPath = join(fixtureRoot, 'src', 'data', 'memory.public.json');
    const externalPath = join(fixtureRoot, 'external-memory.public.json');

    try {
      await writeReleaseFixture(fixtureRoot);
      await rename(projectionPath, externalPath);
      await symlink(externalPath, projectionPath, 'file');

      await expect(loadPublicMemoryRecords(fixtureRoot)).rejects.toThrow(/symbolic link/iu);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
