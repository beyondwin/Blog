import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ThoughtIndexPage } from '../../src/ui/thoughts/ThoughtIndexPage';

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const thought: ThoughtRecord = {
  collection: 'thoughts',
  id: 'why-i-read-in-the-ai-era',
  href: '/thoughts/why-i-read-in-the-ai-era/',
  title: 'AI 시대에, 나는 왜 책을 읽는가',
  description: '답을 쉽게 믿지 않기 위해 책을 읽고 함께 읽는다.',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
  tags: ['reading'],
  media: [],
  relationships: [],
  memoryLinks: [],
  bodyHtml: '<p>AI 때문에 책을 읽기 시작했다.</p>',
  featuredMedia: 'editorial-reading',
};

const editorialReading = {
  id: 'editorial-reading',
  kind: 'illustration',
  alt: '따뜻한 흙빛 벽과 나무 탁자 위에 글자 없는 책 한 권이 펼쳐진 장면',
  width: 1536,
  height: 1024,
  sources: [{
    type: 'image/avif',
    candidates: [{
      src: '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading-1536w.avif',
      width: 1536,
    }],
  }],
  fallback: {
    src: '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png',
    candidates: [{
      src: '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png',
      width: 1536,
    }],
  },
} as ReleaseAsset;

describe('thought index empty-space contract', () => {
  it('renders one canonical T01 thought card and five completely inert cells', () => {
    const html = renderToStaticMarkup(createElement(ThoughtIndexPage, {
      records: [thought],
      assets: new Map([['thoughts/why-i-read-in-the-ai-era/editorial-reading', editorialReading]]),
    }));

    expect(html).toContain('<h1>생각</h1>');
    expect(html.match(/data-thought-cell=/gu)).toHaveLength(6);
    expect(html.match(/href="\/thoughts\//gu)).toHaveLength(1);
    expect(html).toContain('editorial-reading.png');
    expect(html).toContain('AI 시대에, 나는 왜 책을 읽는가');
    expect(html).toContain('<time dateTime="2026-08-16T00:00:00.000Z">2026.08.16</time>');

    const emptyCells = [...html.matchAll(/<li data-thought-cell="empty"[^>]*><\/li>/gu)]
      .map(([cell]) => cell);
    expect(emptyCells).toHaveLength(5);
    for (const cell of emptyCells) {
      expect(cell).toContain('aria-hidden="true"');
      expect(cell).toContain('inert=""');
      expect(cell).not.toMatch(/(?:aria-label|aria-labelledby|role|href|<a|<button|<img|<picture|<svg|>[^<\s])/u);
    }
    expect(html).not.toMatch(/준비 중|곧 공개|placeholder|skeleton/iu);
  });

  it('fails closed instead of inventing or silently dropping thought records', () => {
    expect(() => renderToStaticMarkup(createElement(ThoughtIndexPage, {
      records: [],
      assets: new Map(),
    }))).toThrow(/exactly one public thought/iu);
    expect(() => renderToStaticMarkup(createElement(ThoughtIndexPage, {
      records: [thought, { ...thought, id: 'second', href: '/thoughts/second/' }],
      assets: new Map(),
    }))).toThrow(/exactly one public thought/iu);
  });

  it('defines the approved 3x2, 2x3, and one-real-plus-five-short mobile geometry', async () => {
    const css = await readFile(new URL('../../src/ui/styles/route-thought.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.thought-index__grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/su);
    expect(css).toMatch(/\.thought-index__card\s*>\s*a\s*\{[^}]*grid-template-rows:\s*44%\s+56%/su);
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1179px\)[\s\S]*?\.thought-index__grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/u);
    expect(css).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?\.thought-index__grid\s*\{[^}]*grid-template-columns:\s*1fr/u);
    expect(css).toMatch(/\.thought-index__cell--empty\s*\{[^}]*height:\s*calc\(var\(--thought-real-card-height\)\s*\/\s*5\)/su);
  });
});
