import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export const fixtureChecksum = `sha256:${createHash('sha256').update(transparentPng).digest('hex')}`;

export async function writeReleaseFixture(
  root: string,
  options: {
    title?: string;
    privateFrontmatter?: string;
    featuredMedia?: boolean;
    figureMarkup?: string;
  } = {},
): Promise<void> {
  const title = options.title ?? 'Public fixture';
  const contentRoot = join(root, 'src', 'content');
  const mediaRoot = join(root, 'src', 'assets', 'content', 'articles', 'public-fixture');

  await Promise.all([
    ...['analysis', 'articles', 'ideas', 'reviews', 'travel'].map((collection) => (
      mkdir(join(contentRoot, collection), { recursive: true })
    )),
    mkdir(join(root, 'src', 'data'), { recursive: true }),
    mkdir(mediaRoot, { recursive: true }),
  ]);

  await writeFile(join(contentRoot, 'articles', 'public-fixture.mdx'), [
    '---',
    `title: "${title}"`,
    'description: "A renderer-neutral public fixture."',
    'createdAt: "2026-08-23"',
    'updatedAt: "2026-08-23"',
    'tags: ["fixture"]',
    'status: "published"',
    'draft: false',
    'recordKind: "essay"',
    ...(options.featuredMedia === false ? [] : ['featuredMedia: "hero"']),
    ...(options.privateFrontmatter ? [options.privateFrontmatter] : []),
    '---',
    '',
    '## Stable heading',
    '',
    '| Contract | State |',
    '| --- | --- |',
    '| Public | Ready |',
    '',
    options.figureMarkup ?? '<Figure media="hero" />',
    '',
    '<Callout title="Decision">Only allowlisted output is released.</Callout>',
    '',
  ].join('\n'));

  await writeFile(join(mediaRoot, 'hero.png'), transparentPng);
  await writeFile(join(mediaRoot, 'media.yml'), [
    'version: 1',
    'items:',
    '  - id: hero',
    '    file: hero.png',
    '    kind: illustration',
    '    alt: A one-pixel public fixture',
    '    caption: Deterministic fixture media',
    '    credit: beyondwin test',
    '    sourceUrl: https://example.com/public-fixture',
    '    verifiedAt: "2026-08-23"',
    '    rightsNote: Generated test fixture',
    '    width: 1',
    '    height: 1',
    `    checksum: ${fixtureChecksum}`,
    '',
  ].join('\n'));

  await writeFile(join(root, 'src', 'data', 'memory.public.json'), JSON.stringify({
    generatedAt: null,
    thoughts: [],
    sources: [],
    edges: [],
  }));
}
