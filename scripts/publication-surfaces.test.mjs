import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPublicRecord } from '../packages/contracts/src/public-release.ts';
import {
  loadPublicMemoryRecords,
  loadSourceRecords,
} from '../packages/content/src/source-records.ts';
import {
  findPublicBoundaryHits,
  readActiveRelease,
} from '../packages/content/src/release/read-release.ts';
import { renderTrustedMdx } from '../packages/content/src/mdx/render.tsx';
import { fullPublicPaths } from '../apps/site/app/release.server.ts';

const root = process.cwd();
const release = await readActiveRelease(join(root, 'build', 'public-releases'));
const sourceRecords = await loadSourceRecords(root);
const memoryRecords = await loadPublicMemoryRecords(root);
const publicPaths = new Set(fullPublicPaths(release));

describe('public route publication guard', () => {
  it('derives every public route from the verified release and excludes every non-public source', () => {
    const publicRecords = sourceRecords.filter(isPublicRecord);
    const nonPublicRecords = sourceRecords.filter((record) => !isPublicRecord(record));

    expect(publicPaths.size).toBe(93);
    for (const record of [...publicRecords, ...memoryRecords]) {
      expect(publicPaths.has(record.href), `${record.collection}/${record.id} missing`).toBe(true);
    }
    for (const record of nonPublicRecords) {
      expect(publicPaths.has(record.href), `${record.collection}/${record.id} leaked`).toBe(false);
    }
    expect(publicPaths).toEqual(new Set([...publicPaths].sort((left, right) => left.localeCompare(right))));
  });

  it('keeps the complete fixed discovery surface alongside release and tag routes', () => {
    for (const path of [
      '/',
      '/analysis/',
      '/articles/',
      '/ideas/',
      '/memory/',
      '/memory/map/',
      '/reviews/',
      '/search/',
      '/tags/',
      '/thoughts/',
      '/travel/',
    ]) {
      expect(publicPaths).toContain(path);
    }
    expect(publicPaths).toContain('/tags/AI-agent/');
    expect(publicPaths).toContain('/articles/graphify-code-knowledge-graph-deep-dive/');
    expect(publicPaths).toContain('/reviews/black-swan/');
    expect(publicPaths).toContain('/thoughts/why-i-read-in-the-ai-era/');
  });

  it('accepts the verified public manifest and detects representative private-boundary leaks', () => {
    expect(release.boundaryHits).toEqual([]);
    expect(findPublicBoundaryHits(release.manifest)).toEqual([]);
    expect(findPublicBoundaryHits({
      privatePath: '/Users/example/private-note.md',
      bodyHtml: '<p>safe</p>',
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'forbidden-key', marker: 'privatePath' }),
      expect.objectContaining({ kind: 'private-locator', marker: 'private filesystem locator' }),
    ]));
    expect(findPublicBoundaryHits({
      bodyHtml: '<p>{"rawPrompt":"private instruction"}</p>',
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'serialized-private-field' }),
    ]));
  });

  it('renders only the trusted repository MDX grammar', async () => {
    await expect(renderTrustedMdx([
      '## Public heading',
      '',
      '<Callout title="Decision">Only public fields.</Callout>',
    ].join('\n'), { media: new Map() })).resolves.toContain(
      '<aside class="callout"><strong>Decision</strong><p>Only public fields.</p></aside>',
    );

    for (const source of [
      'import Secret from "./private"',
      '{globalThis.process.env.SECRET}',
      '<Unknown />',
    ]) {
      await expect(renderTrustedMdx(source, { media: new Map() })).rejects.toThrow(/trusted MDX/iu);
    }
  });
});
