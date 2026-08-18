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
});
