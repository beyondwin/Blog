import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReleaseMediaAsset } from '../src/media/build-responsive-media';
import { renderTrustedMdx } from '../src/mdx/render';

const hero: ReleaseMediaAsset = {
  id: 'hero',
  collection: 'articles',
  recordId: 'safe-record',
  kind: 'illustration',
  alt: 'A safe diagram',
  caption: 'A public caption',
  credit: 'Public credit',
  provenanceUrl: 'https://example.com/source',
  verifiedAt: '2026-08-23',
  rightsNote: 'Approved for this fixture',
  width: 1080,
  height: 720,
  sourceChecksum: `sha256:${'a'.repeat(64)}`,
  sources: [
    {
      type: 'image/avif',
      candidates: [
        { src: '/assets/content/articles/safe-record/hero-720w.avif', width: 720, height: 480, checksum: `sha256:${'b'.repeat(64)}` },
        { src: '/assets/content/articles/safe-record/hero-1080w.avif', width: 1080, height: 720, checksum: `sha256:${'c'.repeat(64)}` },
      ],
    },
    {
      type: 'image/webp',
      candidates: [
        { src: '/assets/content/articles/safe-record/hero-720w.webp', width: 720, height: 480, checksum: `sha256:${'d'.repeat(64)}` },
        { src: '/assets/content/articles/safe-record/hero-1080w.webp', width: 1080, height: 720, checksum: `sha256:${'e'.repeat(64)}` },
      ],
    },
  ],
  fallback: {
    src: '/assets/content/articles/safe-record/hero.png',
    format: 'png',
    checksum: `sha256:${'a'.repeat(64)}`,
    candidates: [
      { src: '/assets/content/articles/safe-record/hero-720w.source.png', width: 720, height: 480, checksum: `sha256:${'f'.repeat(64)}` },
      { src: '/assets/content/articles/safe-record/hero.png', width: 1080, height: 720, checksum: `sha256:${'a'.repeat(64)}` },
    ],
  },
};

const execFileAsync = promisify(execFile);

describe('trusted repository MDX rendering', () => {
  it('renders through the real tsx CLI transform used by the release command', async () => {
    const renderUrl = pathToFileURL(resolve('packages/content/src/mdx/render.tsx')).href;
    const script = [
      '(async () => {',
      `  const { renderTrustedMdx } = await import(${JSON.stringify(renderUrl)});`,
      "  const html = await renderTrustedMdx('CLI transform', { media: new Map() });",
      '  process.stdout.write(html);',
      '})()',
    ].join('\n');
    const { stdout } = await execFileAsync(resolve('node_modules/.bin/tsx'), ['-e', script], {
      cwd: process.cwd(),
    });

    expect(stdout).toBe('<p>CLI transform</p>');
  }, 30_000);

  it('renders GFM headings, a semantic Callout, and a provenance-preserving responsive Figure', async () => {
    const html = await renderTrustedMdx([
      '## Stable heading',
      '',
      '| Contract | State |',
      '| --- | --- |',
      '| Public | Ready |',
      '',
      '<Figure media="hero" />',
      '',
      '<Callout title="Decision">Only public fields.</Callout>',
    ].join('\n'), { media: new Map([['hero', hero]]) });

    expect(html).toContain('<h2 id="stable-heading">Stable heading</h2>');
    expect(html).toContain('<table>');
    expect(html).toContain('<aside class="callout"><strong>Decision</strong><p>Only public fields.</p></aside>');
    expect(html).toContain('<figure class="content-figure"');
    expect(html).toContain('width="1080" height="720"');
    expect(html).toContain('alt="A safe diagram"');
    expect(html).toContain('srcset="/assets/content/articles/safe-record/hero-720w.avif 720w, /assets/content/articles/safe-record/hero-1080w.avif 1080w"');
    expect(html).toContain('sizes="(max-width: 760px) calc(100vw - 40px), min(42em, 100vw - 80px)"');
    expect(html).toContain('href="https://example.com/source"');
    expect(html).toContain('Public credit');
  });

  it.each([
    ['imports', 'import Secret from "./secret"'],
    ['exports', 'export const secret = "no"'],
    ['unknown components', '<Unknown />'],
    ['script tags', '<script>alert(1)</script>'],
    ['style tags', '<style>{`body { display: none }`}</style>'],
    ['JavaScript body expressions', '{globalThis.process.env.SECRET}'],
    ['JavaScript component props', '<Figure media={globalThis.process.env.MEDIA} />'],
  ])('rejects %s before evaluating MDX', async (_case, source) => {
    await expect(renderTrustedMdx(source, { media: new Map([['hero', hero]]) })).rejects.toThrow(/trusted MDX/i);
  });

  const briefTable = [
    '| 질문 | 짧은 판단 |',
    '| --- | --- |',
    '| 무엇을 고르나? | 공개 가능한 것만. |',
  ].join('\n');

  it('folds 질문/짧은 판단 tables only when foldBriefTable is set', async () => {
    const folded = await renderTrustedMdx(briefTable, { media: new Map(), foldBriefTable: true });
    expect(folded).toContain('<details class="article-brief">');
    expect(folded).toContain('<summary>질문과 짧은 판단</summary>');
    expect(folded).toContain('<table>');
    expect(folded).toContain('무엇을 고르나?');

    const plain = await renderTrustedMdx(briefTable, { media: new Map() });
    expect(plain).toContain('<table>');
    expect(plain).not.toContain('article-brief');
  });

  it('leaves ordinary tables unfolded even when foldBriefTable is set', async () => {
    const html = await renderTrustedMdx([
      '| Contract | State |',
      '| --- | --- |',
      '| Public | Ready |',
    ].join('\n'), { media: new Map(), foldBriefTable: true });
    expect(html).toContain('<table>');
    expect(html).not.toContain('article-brief');
  });
});
