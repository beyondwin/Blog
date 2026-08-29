import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import { ThoughtReadingPage } from '../../src/ui/thoughts/ThoughtReadingPage';

type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;

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
  bodyHtml: '<p>AI 때문에 책을 읽기 시작했다.</p><p>그래서 책을 읽는다.</p>',
  featuredMedia: 'editorial-reading',
};

describe('thought reference-03 detail', () => {
  it('uses the split detail frame, T01 media, action rail, and real short-form body', () => {
    const html = renderToStaticMarkup(createElement(ThoughtReadingPage, {
      record: thought,
      media: createElement('img', {
        src: '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png',
        alt: '따뜻한 흙빛 벽과 나무 탁자 위에 펼친 책',
        width: 1536,
        height: 1024,
      }),
    }));

    expect(html).toContain('editorial-detail-frame editorial-detail-frame--split');
    expect(html).toContain('<h1>AI 시대에, 나는 왜 책을 읽는가</h1>');
    expect(html).toContain('답을 쉽게 믿지 않기 위해 책을 읽고 함께 읽는다.');
    expect(html).toContain('>생각</span>');
    expect(html).toContain('<time dateTime="2026-08-16T00:00:00.000Z">2026.08.16</time>');
    expect(html).toContain('editorial-reading.png');
    expect(html).toContain('좋아요 · 준비 중');
    expect(html).toContain('댓글 · 준비 중');
    expect(html).toContain('링크 복사');
    expect(html).toContain('<a class="context-return" href="/thoughts/">생각 목록으로</a>');
    expect(html).toContain('AI 때문에 책을 읽기 시작했다.');
    expect(html).toContain('그래서 책을 읽는다.');
    expect(html).not.toMatch(/aria-label="절"|article-toc|article-colophon|source-panel|확인한 자료/iu);
    expect(html).not.toMatch(/placeholder|skeleton/iu);
  });

  it('uses the approved text-led detail variant without an empty media box', () => {
    const html = renderToStaticMarkup(createElement(ThoughtReadingPage, { record: thought }));
    expect(html).toContain('editorial-detail-frame editorial-detail-frame--text-led');
    expect(html).not.toContain('editorial-detail-frame__media');
    expect(html).toContain('AI 때문에 책을 읽기 시작했다.');
  });
});
