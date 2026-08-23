import { describe, expect, it } from 'vitest';
import { isPublicRecord, parsePublicRecord } from '../src/public-release';

describe('public release selection', () => {
  it('publishes only published and non-draft records', () => {
    expect(isPublicRecord({ status: 'published', draft: false })).toBe(true);
    expect(isPublicRecord({ status: 'review', draft: false })).toBe(false);
    expect(isPublicRecord({ status: 'archived', draft: false })).toBe(false);
    expect(isPublicRecord({ status: 'published', draft: true })).toBe(false);
    expect(isPublicRecord({ status: 'published' })).toBe(false);
  });

  it('removes private path, prompt, embedding, raw source, and job fields from JSON', () => {
    const publicRecord = parsePublicRecord({
      collection: 'articles',
      id: 'malicious-fixture',
      href: '/articles/malicious-fixture/',
      title: 'Safe',
      description: 'Safe',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
      tags: [],
      media: [],
      relationships: [],
      memoryLinks: [],
      bodyHtml: '<p>Safe body.</p>',
      privatePath: '/Users/user/private/source.mdx',
      jobPrompt: 'secret',
      embedding: [0.1, 0.2],
      rawSource: '<private bytes>',
      jobPayload: { locator: 'memory/thoughts/private.md' },
      memoryLocator: 'memory/thoughts/private.md',
    });
    const serialized = JSON.stringify(publicRecord);

    expect(serialized).not.toMatch(/privatePath|jobPrompt|embedding|rawSource|jobPayload|memoryLocator/);
    expect(serialized).not.toContain('/Users/user');
    expect(serialized).not.toContain('memory/');
  });

  it('rejects private paths placed directly in allowlisted nested href fields', () => {
    const common = {
      id: 'allowlisted-path-bypass',
      title: 'Safe',
      description: 'Safe',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
      tags: [],
      relationships: [],
      memoryLinks: [],
      bodyHtml: '<p>Safe body.</p>',
    };
    const maliciousMedia = {
      id: 'cover',
      kind: 'illustration',
      src: '/Users/user/private/cover.png',
      alt: 'Safe alt',
      credit: 'Safe credit',
      verifiedAt: '2026-08-22',
      rightsNote: 'Safe rights',
      width: 1,
      height: 1,
      format: 'png',
      checksum: `sha256:${'a'.repeat(64)}`,
    };

    expect(() => parsePublicRecord({
      ...common,
      collection: 'articles',
      href: '/articles/allowlisted-path-bypass/',
      media: [maliciousMedia],
    })).toThrow();
    expect(() => parsePublicRecord({
      ...common,
      collection: 'memory',
      href: '/memory/allowlisted-path-bypass/',
      media: [],
      claimKo: 'Safe claim',
      body: 'Safe body',
      memoryType: 'semantic',
      origin: 'author',
      topics: [],
      theses: [],
      sources: [{ title: 'Private path', href: '/etc/passwd' }],
      companions: [],
    })).toThrow();
  });
});
