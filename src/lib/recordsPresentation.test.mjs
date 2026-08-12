import { describe, expect, it } from 'vitest';
import {
  buildArticlePresentation,
  buildRecordsPresentation,
  resolveTocTargetId,
} from './recordsPresentation';

function article(id, title, date, options = {}) {
  return {
    id,
    collection: 'articles',
    body: options.body ?? '',
    data: {
      title,
      description: `${title} 설명`,
      createdAt: new Date(date),
      updatedAt: new Date(date),
      tags: options.tags ?? ['AI'],
      status: options.status ?? 'published',
      draft: false,
    },
  };
}

describe('records presentation', () => {
  it('selects the approved evidence dossier and never duplicates it in the editorial sequence', () => {
    const ordinary = article('ordinary', '일반 기록', '2026-08-01', { tags: ['design'] });
    const dossier = article(
      'uncle-bob-ai-code-review-evidence',
      'AI가 쓴 코드를 읽지 않아도 된다는 말의 조건',
      '2026-07-26',
      {
        tags: ['AI', 'code-review', 'testing', 'source-grounded'],
        status: 'review',
        body: '## 실제 구조\n\n명세의 한계를 재현했다.\n\n`CRAP = CC² × (1 - coverage)³ + CC`\n\n## 확인한 자료',
      },
    );

    const shared = article('shared-ai-conversation-evidence-boundaries', '공유된 AI 대화', '2026-07-26');
    const aws = article('aws-static-frontend-serverless-bff', 'AWS 기록', '2026-07-26');
    const agents = article('agents-md-vs-agent-skills-evidence', 'AGENTS 기록', '2026-07-26');
    const result = buildRecordsPresentation([ordinary, agents, aws, dossier, shared]);

    expect(result.lead.id).toBe(dossier.id);
    expect(result.lead.evidenceState).toBe('검토 중');
    expect(result.lead.evidenceSignals).toEqual([
      '구현',
      '명세',
      '반례',
      '원출처 확인',
      '재현 절차 있음',
    ]);
    expect(result.lead.excerpt).toBe('CRAP = CC² × (1 - coverage)³ + CC');
    expect(result.entries.map((entry) => entry.id)).toEqual([
      'shared-ai-conversation-evidence-boundaries',
      'aws-static-frontend-serverless-bff',
      'agents-md-vs-agent-skills-evidence',
      'ordinary',
    ]);
    expect(result.topics).toEqual(['AI', 'code-review', 'source-grounded', 'testing']);
    expect(result.years).toEqual(['2026']);
  });

  it('derives a truthful article TOC and caps related reading at three shared-topic records', () => {
    const current = article('current', '현재 글', '2026-08-01', {
      tags: ['AI', 'testing'],
      body: '본문 단어 '.repeat(520),
    });
    const candidates = [
      article('alpha', '알파', '2026-07-04', { tags: ['AI', 'testing'] }),
      article('beta', '베타', '2026-07-03', { tags: ['AI'] }),
      article('gamma', '감마', '2026-07-02', { tags: ['testing'] }),
      article('delta', '델타', '2026-07-01', { tags: ['AI'] }),
      article('unrelated', '무관', '2026-07-05', { tags: ['design'] }),
    ];

    const result = buildArticlePresentation(current, candidates, [
      { depth: 2, slug: 'first-heading', text: '첫 번째 장' },
      { depth: 3, slug: 'detail-heading', text: '세부 항목' },
      { depth: 4, slug: 'ignored-heading', text: '제외 항목' },
    ]);

    expect(result.toc).toEqual([
      { depth: 2, href: '#first-heading', label: '첫 번째 장' },
      { depth: 3, href: '#detail-heading', label: '세부 항목' },
    ]);
    expect(result.readingMinutes).toBe(4);
    expect(result.related.map((entry) => entry.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('decodes non-ASCII heading hashes before DOM id lookup', () => {
    expect(resolveTocTargetId('#%EB%A8%BC%EC%A0%80-%EC%95%8C%EC%95%84%EC%95%BC-%ED%95%A0-%EA%B0%9C%EB%85%90'))
      .toBe('먼저-알아야-할-개념');
  });
});
