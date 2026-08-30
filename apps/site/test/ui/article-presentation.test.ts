import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import {
  PREFERRED_PUBLIC_ARTICLE_LEAD_ID,
  articleReadingMinutes,
  articleReadingPresentation,
  articleSpecies,
  articleStake,
  buildArticleIndex,
  splitArticleBody,
} from '../../src/ui/articles/articlePresentation';

const base = {
  collection: 'articles' as const,
  description: '설명 문장.',
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  tags: [] as string[],
  media: [],
  relationships: [],
  memoryLinks: [],
  bodyHtml: '<p>본문</p>',
  includeInAnswers: false,
};

function article(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    id,
    href: `/articles/${id}/`,
    title: id,
    ...overrides,
  } as ArticleRecord;
}

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

describe('article presentation', () => {
  it('marks source-grounded work as 조사 without exposing field names', () => {
    expect(articleSpecies(article('g', { tags: ['source-grounded'] }))).toBe('조사');
    expect(articleSpecies(article('e', { evidenceState: 'source-grounded' }))).toBe('조사');
    expect(articleSpecies(article('n', { tags: ['AI'] }))).toBe('에세이');
  });

  it('uses the first strong in the first paragraph as the stake', () => {
    const record = article('g', {
      bodyHtml: '<p>Intro. <strong>단독 진실 공급원으로 쓰기에는 아직 위험하다.</strong></p><p>다음</p>',
    });
    expect(articleStake(record)).toBe('단독 진실 공급원으로 쓰기에는 아직 위험하다.');
  });

  it('falls back to description when the first paragraph has no strong', () => {
    expect(articleStake(article('g'))).toBe('설명 문장.');
  });

  it('counts reading minutes from stripped HTML words', () => {
    expect(articleReadingMinutes('<p>one</p>')).toBe(1);
    expect(articleReadingMinutes(`<p>${'word '.repeat(390)}</p>`)).toBe(2);
  });

  it('splits 확인한 자료 out of prose and keeps other h2s for TOC', () => {
    const split = splitArticleBody([
      '<h2 id="실제-구조">실제 구조</h2><p>A</p>',
      '<h2 id="내-결론">내 결론</h2><p>B</p>',
      '<h2 id="확인한-자료">확인한 자료</h2><ul><li>Source</li></ul>',
    ].join(''));
    expect(split.toc.map((item) => item.label)).toEqual(['실제 구조', '내 결론']);
    expect(split.proseHtml).not.toContain('확인한 자료');
    expect(split.colophonHtml).toContain('확인한 자료');
    expect(split.colophonHtml).toContain('Source');
  });

  it('builds a preferred lead plus a ledger in input order', () => {
    const lead = article(PREFERRED_PUBLIC_ARTICLE_LEAD_ID, {
      tags: ['source-grounded'],
      updatedAt: '2026-01-01T00:00:00.000Z',
      bodyHtml: '<p><strong>그래프가 중심이다.</strong></p>',
    });
    const newer = article('why-i-read-in-the-ai-era', { updatedAt: '2026-08-01T00:00:00.000Z' });
    const result = buildArticleIndex([newer, lead]);
    expect(result.lead?.id).toBe(PREFERRED_PUBLIC_ARTICLE_LEAD_ID);
    expect(result.lead?.species).toBe('조사');
    expect(result.lead?.hasEvidence).toBe(true);
    expect(result.lead?.monthLabel).toBe('1월');
    expect(result.lead?.stake).toBe('그래프가 중심이다.');
    expect(result.ledger.map((item) => item.id)).toEqual(['why-i-read-in-the-ai-era']);
  });

  it('falls back to newest updatedAt when the preferred lead is absent', () => {
    const older = article('old', { updatedAt: '2026-01-01T00:00:00.000Z' });
    const newest = article('new', { updatedAt: '2026-08-01T00:00:00.000Z' });
    expect(buildArticleIndex([older, newest]).lead?.id).toBe('new');
  });

  it('shows 조사 TOC only when two or more non-colophon headings exist', () => {
    const investigation = article('g', {
      tags: ['source-grounded'],
      bodyHtml: [
        '<p>Intro</p>',
        '<h2 id="실제-구조">실제 구조</h2><p>A</p>',
        '<h2 id="내-결론">내 결론</h2><p>B</p>',
        '<h2 id="확인한-자료">확인한 자료</h2><p>C</p>',
      ].join(''),
    });
    const reading = articleReadingPresentation(investigation);
    expect(reading.kicker).toMatch(/^조사 · \d+분$/);
    expect(reading.toc).toEqual([
      { href: '#실제-구조', label: '실제 구조' },
      { href: '#내-결론', label: '내 결론' },
    ]);
    expect(reading.proseHtml).not.toContain('확인한 자료');
    expect(reading.colophonHtml).toContain('확인한 자료');

    const essay = articleReadingPresentation(article('e', {
      bodyHtml: '<h2 id="하나">하나</h2><h2 id="둘">둘</h2>',
    }));
    expect(essay.kicker).toBe('에세이');
    expect(essay.toc).toEqual([]);
  });
});
