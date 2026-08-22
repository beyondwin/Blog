import { describe, expect, it } from 'vitest';
import type { SiteEntry } from '../content';
import type { ResolvedMedia } from '../content/mediaRegistry';
import type { MemoryThought } from '../memory/publicData';
import { judgmentSceneDefinition } from './judgmentScene';
import { resolvePublicScene, type PublicSceneDefinition } from './publicScene';

function articleEntry(status: 'published' | 'review' = 'published'): SiteEntry {
  return {
    collection: 'articles',
    id: 'why-i-read-in-the-ai-era',
    data: {
      title: 'AI 시대에, 나는 왜 책을 읽는가',
      description: '답을 쉽게 믿지 않기 위해 읽는다.',
      createdAt: new Date('2026-08-16'),
      updatedAt: new Date('2026-08-16'),
      tags: ['judgment'],
      status,
      draft: false,
      recordKind: 'essay',
      featuredMedia: 'reading-desk-cobalt',
      relationships: [],
    },
  } as SiteEntry;
}

const reviewEntry = {
  collection: 'reviews',
  id: 'black-swan',
  data: {
    title: '블랙스완', itemTitle: '블랙스완', itemType: 'book',
    description: '우리는 현실을 보는가.', verdict: '우리는 현실을 보는가.',
    itemAuthor: '나심 니콜라스 탈레브', publisher: '동녘사이언스',
    isbn13: '9788990247674', readEditionVerified: true,
    coverState: 'verified', coverMedia: 'cover',
    createdAt: new Date('2026-05-27'), updatedAt: new Date('2026-05-27'),
    completedAt: new Date('2026-05-27'), tags: ['book'],
    status: 'published', draft: false, relationships: [],
  },
} as SiteEntry;

const publicThought = {
  slug: 'public-thought', claimKo: '공개 문장', claimEn: '', body: '공개 본문',
  memoryType: 'reflective', origin: 'author', topics: [], theses: [], sources: ['source'],
  position: { x: 0, y: 0 },
} satisfies MemoryThought;

const resolveMedia = (_collection: string, _slug: string, id: string) => ({
  item: {
    id, file: id + '.png', kind: 'illustration', alt: id, credit: 'beyondwin',
    sourcePath: 'src/content/articles/why-i-read-in-the-ai-era.mdx',
    verifiedAt: '2026-08-22', rightsNote: 'test fixture',
    checksum: 'sha256:' + 'a'.repeat(64),
  },
  asset: { src: '/_astro/' + id + '.png', width: 1536, height: 1024, format: 'png' },
}) as ResolvedMedia;

const dependencies = {
  entries: [articleEntry(), reviewEntry],
  thoughts: [publicThought],
  resolveMedia,
};
const unpublishedDependencies = { ...dependencies, entries: [articleEntry('review'), reviewEntry] };
const duplicateDefinition = {
  ...judgmentSceneDefinition,
  support: [{ ...judgmentSceneDefinition.lead, id: 'duplicate-lead', role: 'support' as const }],
};
const missingSupportMedia = {
  ...dependencies,
  resolveMedia: (collection: string, slug: string, id: string) => {
    if (id === 'judgment-scale') throw new Error('unknown media id');
    return resolveMedia(collection, slug, id);
  },
};
const memoryDefinition: PublicSceneDefinition = {
  id: 'memory-test', slug: 'memory-test', title: '문장', atmosphere: '#F2F4F7',
  lead: {
    id: 'public-thought', kind: 'memory-thought', role: 'lead', slug: 'public-thought',
    relationReason: '승인된 공개 문장',
  },
  support: [], context: [], approvedAt: '2026-08-22', approvedBy: 'author', version: 1,
};
const noProjectedThoughts = { ...dependencies, thoughts: [] };

describe('public scene resolution', () => {
  it('resolves the approved judgment scene in authored order', () => {
    const result = resolvePublicScene(judgmentSceneDefinition, dependencies);

    expect(result.scene.id).toBe('judgment');
    expect(result.scene.lead.id).toBe('reading-desk-cobalt');
    expect(result.scene.objects.map((object) => object.id)).toEqual([
      'reading-desk-cobalt',
      'judgment-scale',
      'black-swan',
      'reading-excerpt',
      'shared-reading-table',
    ]);
    const book = result.scene.objects.find((object) => object.id === 'black-swan');
    expect(book).toMatchObject({
      kind: 'review',
      title: '블랙스완',
      href: '/reviews/black-swan/',
    });
    expect(book).not.toHaveProperty('media');
    expect(result.issues).toEqual([]);
  });

  it('fails when the lead record is not public', () => {
    expect(() => resolvePublicScene(judgmentSceneDefinition, unpublishedDependencies))
      .toThrow('reading-desk-cobalt: record is not public');
  });

  it('rejects duplicate canonical object references', () => {
    expect(() => resolvePublicScene(duplicateDefinition, dependencies))
      .toThrow('duplicate canonical object');
  });

  it('reports invalid optional support with object id and reason', () => {
    const result = resolvePublicScene(judgmentSceneDefinition, missingSupportMedia);
    expect(result.issues).toContainEqual(expect.objectContaining({
      objectId: 'judgment-scale',
      code: 'missing-media',
    }));
  });

  it('resolves memory-thought only from projected public thoughts', () => {
    expect(resolvePublicScene(memoryDefinition, dependencies).scene.lead.href)
      .toBe('/memory/public-thought/');
    expect(() => resolvePublicScene(memoryDefinition, noProjectedThoughts))
      .toThrow('public-thought: thought is not in the public projection');
  });
});
