import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { criticalCssForPath } from '../app/root';

const candidateRoot = resolve(import.meta.dirname, '..');

describe('route-scoped critical CSS source accounting', () => {
  it('emits shared tokens and shell exactly once with only the matching route styles', async () => {
    const [tokens, shell, scene, reading, readingSurface, article, review, memory] = await Promise.all([
      readFile(join(candidateRoot, 'src/ui/styles/tokens.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/shell.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-scene.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-reading.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/reading.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-article.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-review.css'), 'utf8'),
      readFile(join(candidateRoot, 'src/ui/styles/route-memory.css'), 'utf8'),
    ]);
    const sources = { tokens, shell, scene, reading, readingSurface, article, review, memory };
    const home = criticalCssForPath('/', sources);
    const articleDetail = criticalCssForPath('/articles/example/', sources);
    const reviewDetail = criticalCssForPath('/reviews/example/', sources);
    const memoryDetail = criticalCssForPath('/memory/example/', sources);

    for (const css of [home, articleDetail, reviewDetail, memoryDetail]) {
      expect(css.match(/--bw-mineral: #F2F4F7;/gu)).toHaveLength(1);
      expect(css).toContain('.site-header__inner');
      expect(Buffer.byteLength(css)).toBeGreaterThan(0);
    }
    expect(home).toContain('.public-scene');
    expect(home).not.toContain('.reading-sheet');
    expect(articleDetail).toContain('.reading-threshold');
    expect(articleDetail).not.toContain('.review-reading-page .content-figure');
    expect(reviewDetail).toContain('.reading-threshold');
    expect(reviewDetail).toContain('.review-reading-page .content-figure');
    expect(reviewDetail).not.toContain('.memory-thought');
    expect(memoryDetail).toContain('.memory-thought');
    expect(memoryDetail).toContain('.reading-threshold');
    expect(memoryDetail).toContain('.context-return');
  });
});
