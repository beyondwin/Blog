import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('press tokens', () => {
  it('does not carry the literary paper world', async () => {
    const css = await readFile(new URL('./press.css', import.meta.url), 'utf8');
    expect(css).toContain('--booth');
    expect(css).toContain('--sheet');
    expect(css).toContain('--proof');
    expect(css.toLowerCase()).not.toContain('#f2ede2');
    expect(css).not.toContain('AppleMyungjo');
    expect(css).not.toContain('--literary');
  });

  it('keeps article markdown tables inside the reading column on narrow viewports', async () => {
    const css = await readFile(new URL('./press.css', import.meta.url), 'utf8');
    const start = css.indexOf('.article-prose table {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('}', start) + 1);
    expect(block).toContain('overflow-x: auto');
    expect(block).toContain('max-width: 100%');
    expect(css).toContain('.article-prose pre {\n  max-width: 100%;\n}');
    expect(css).toContain('.article-sheet {\n  overflow-x: clip;\n}');
  });

  it('does not retain the retired home composition', async () => {
    const css = await readFile(new URL('./press.css', import.meta.url), 'utf8');

    for (const selector of [
      '.home-sheet',
      '.home-lead',
      '.home-writing',
      '.home-book',
      '.home-book__plate',
      '.home-more-writing',
      '.home-more-books',
      '.home-proof',
    ]) {
      expect(css, selector).not.toContain(selector);
    }
  });
});
