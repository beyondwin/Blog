import { describe, expect, it } from 'vitest';
import { findArticleMemoryLinks } from './articleLinks.ts';
import { findContentMemoryLinks } from './contentLinks.ts';
import { makeMemory } from './testFixture.mjs';

describe('article memory links compatibility', () => {
  it('delegates article memory matching to the content memory helper', () => {
    const memory = makeMemory();
    const articlePath = 'src/content/articles/context-refinement-system-design.mdx';
    const tags = ['ai-workflow'];

    expect(findArticleMemoryLinks(memory, articlePath, tags)).toEqual(
      findContentMemoryLinks(memory, articlePath, tags),
    );
  });
});
