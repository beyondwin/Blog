import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const candidateRoot = resolve(import.meta.dirname, '..');

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('route-scoped critical CSS source accounting', () => {
  it('defines the approved FORM & THOUGHT palette, selected font roles, and temporary legacy aliases', async () => {
    const tokens = await readFile(join(candidateRoot, 'src/ui/styles/tokens.css'), 'utf8');

    for (const declaration of [
      '--ft-canvas: #E8E1D8;',
      '--ft-paper: #F2EFE9;',
      '--ft-paper-bright: #F7F3ED;',
      '--ft-ink: #11100F;',
      '--ft-ink-soft: #5E554E;',
      '--ft-rule: #D3C9BF;',
      '--ft-terracotta: #AF6047;',
      '--ft-terracotta-dark: #7D3F30;',
      '--ft-brown: #241712;',
      '--ft-blush: #DDB4A5;',
      '--ft-on-terracotta: #FFFFFF;',
      '--ft-font-display:',
      '--ft-font-wordmark:',
      '--ft-font-ui:',
      '--bw-mineral: var(--ft-canvas);',
      '--bw-white: var(--ft-paper-bright);',
      '--bw-ink: var(--ft-ink);',
      '--bw-font: var(--ft-font-ui);',
    ]) {
      expect(tokens).toContain(declaration);
    }
    expect(tokens.match(/@font-face/gu)).toHaveLength(3);
    expect(tokens).toContain('url("/fonts/form-thought-display-ko.woff2") format("woff2")');
    expect(tokens).toContain('url("/fonts/form-thought-wordmark.woff2") format("woff2")');
    expect(tokens).toContain('url("/fonts/form-thought-ui-ko.woff2") format("woff2")');
    expect(tokens.match(/font-display: swap;/gu)).toHaveLength(3);
  });

  it('keeps every approved normal-text color pair at WCAG AA contrast', () => {
    for (const [foreground, background] of [
      ['#11100F', '#F2EFE9'],
      ['#5E554E', '#F2EFE9'],
      ['#FFFFFF', '#AF6047'],
      ['#F7F3ED', '#11100F'],
      ['#F7F3ED', '#241712'],
      ['#7D3F30', '#F2EFE9'],
    ]) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps a two-color focus indicator perceivable on every approved surface', async () => {
    const surfaces = ['#F2EFE9', '#AF6047', '#11100F', '#241712'];
    const focusLight = '#FFFFFF';
    const focusDark = '#11100F';

    for (const surface of surfaces) {
      expect(Math.max(
        contrastRatio(focusLight, surface),
        contrastRatio(focusDark, surface),
      )).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(focusLight, focusDark)).toBeGreaterThanOrEqual(3);

    const shell = await readFile(join(candidateRoot, 'src/ui/styles/shell.css'), 'utf8');
    expect(shell).toContain('outline: 2px solid var(--ft-on-terracotta);');
    expect(shell).toContain('box-shadow: 0 0 0 2px var(--ft-ink);');
  });

  it('accounts for the three semantic WOFF2 subsets and their critical preloads', async () => {
    const fontPaths = [
      join(candidateRoot, 'public/fonts/form-thought-display-ko.woff2'),
      join(candidateRoot, 'public/fonts/form-thought-wordmark.woff2'),
      join(candidateRoot, 'public/fonts/form-thought-ui-ko.woff2'),
    ];
    const present = await Promise.all(fontPaths.map((path) => stat(path).then(() => true, () => false)));
    expect(present).toEqual([true, true, true]);
    if (present.some((value) => !value)) return;

    const fonts = await Promise.all(fontPaths.map(async (path) => ({
      bytes: (await stat(path)).size,
      header: (await readFile(path)).subarray(0, 4).toString('ascii'),
    })));
    expect(fonts.map((font) => font.header)).toEqual(['wOF2', 'wOF2', 'wOF2']);
    expect(fonts.every((font) => font.bytes > 1_000)).toBe(true);
    expect(fonts.reduce((total, font) => total + font.bytes, 0)).toBeLessThanOrEqual(500_000);

    const root = await readFile(join(candidateRoot, 'app/root.tsx'), 'utf8');
    for (const file of [
      'form-thought-display-ko.woff2',
      'form-thought-wordmark.woff2',
      'form-thought-ui-ko.woff2',
    ]) {
      expect(root).toContain(`<link rel="preload" as="font" type="font/woff2" href="/fonts/${file}" crossOrigin="anonymous" />`);
    }
  });

  it('uses the warm canvas and the single allowed outer paper-shell elevation', async () => {
    const shell = await readFile(join(candidateRoot, 'src/ui/styles/shell.css'), 'utf8');

    expect(shell).toContain('background: var(--ft-canvas);');
    expect(shell).toContain('background: var(--ft-paper);');
    expect(shell).toContain('font-family: var(--ft-font-ui);');
    expect(shell).toContain('box-shadow: 0 18px 44px rgb(36 23 18 / 14%);');
    expect(shell).toContain('border-radius: 8px;');
    expect(shell).toContain('.site-shell[data-surface-mode] { background: var(--ft-paper); }');
    expect(shell).toContain('outline: 2px solid var(--ft-on-terracotta);');
    expect(shell).toMatch(/\.site-brand \{[^}]*font-family: var\(--ft-font-wordmark\);[^}]*font-size: 20px;[^}]*font-weight: 400;[^}]*letter-spacing: -\.04em;/u);
  });

  it('binds the planned index and detail CSS to the actual primary route handles', async () => {
    const [root, reviewIndex, thoughtIndex, reviewDetail, thoughtDetail, search] = await Promise.all([
      readFile(join(candidateRoot, 'app/root.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/reviews-index.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/thoughts-index.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/review.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/thought.tsx'), 'utf8'),
      readFile(join(candidateRoot, 'app/routes/search.tsx'), 'utf8'),
    ]);
    expect(root).not.toContain('criticalCssForPath');
    expect(reviewIndex).toContain("import('../../src/ui/styles/route-index.css?inline')");
    expect(reviewIndex).toContain('criticalCss: `${indexCss}${reviewCss}`');
    expect(thoughtIndex).toContain("import('../../src/ui/styles/route-thought.css?inline')");
    expect(thoughtIndex).toContain('criticalCss: thoughtCss');
    expect(thoughtIndex).not.toMatch(/route-reading\.css\?inline|reading\.css\?inline/u);
    expect(reviewDetail).toContain("import('../../src/ui/styles/route-detail.css?inline')");
    expect(reviewDetail).toContain('criticalCss: `${detailCss}${routeReadingCss}${readingCss}${reviewCss}`');
    expect(thoughtDetail).toContain("import('../../src/ui/styles/route-detail.css?inline')");
    expect(thoughtDetail).toContain("import('../../src/ui/styles/route-thought.css?inline')");
    expect(thoughtDetail).toContain('criticalCss: `${detailCss}${thoughtCss}`');
    expect(thoughtDetail).not.toMatch(/route-reading\.css\?inline|reading\.css\?inline/u);
    expect(search).toContain('criticalCss: `${readingCss}${collectionsCss}`');
    expect(search).not.toMatch(/route-(?:index|detail|search)\.css\?inline/u);
  });
});
