import { describe, expect, it } from 'vitest';
import { buildHomePresentation, selectHomeMemories } from './homePresentation';

function article(id, title, date) {
  return {
    id,
    collection: 'articles',
    data: {
      title,
      description: `${title} 설명`,
      createdAt: new Date(date),
      updatedAt: new Date(date),
      tags: ['AI'],
      status: 'published',
      draft: false,
    },
  };
}

function review(id, title, date) {
  return {
    id,
    collection: 'reviews',
    data: {
      title,
      itemTitle: title,
      itemType: 'book',
      description: `${title} 한 문장 판단`,
      completedAt: new Date(date),
      createdAt: new Date(date),
      updatedAt: new Date(date),
      coverImage: `https://example.com/${id}.jpg`,
      tags: ['book'],
      status: 'published',
      draft: false,
    },
  };
}

describe('home presentation', () => {
  it('keeps the approved lead sequence and removes those entries from lower sections', () => {
    const articles = [
      article('agents-md-vs-agent-skills-evidence', 'AGENTS.md가 Skills보다 낫다는 말은 어디까지 맞을까', '2026-07-26'),
      article('shared-ai-conversation-evidence-boundaries', '공유된 AI 대화는 어디까지 근거가 될 수 있을까', '2026-07-26'),
      article('uncle-bob-ai-code-review-evidence', 'AI가 쓴 코드를 읽지 않아도 된다는 말의 조건', '2026-07-26'),
      article('aws-static-frontend-serverless-bff', 'AWS 정적 프런트엔드와 서버리스 BFF를 고르는 기준', '2026-07-26'),
      article('ai-design-references', 'AI 디자인 도구를 보는 기준', '2026-05-16'),
    ];
    const reviews = [
      review('changing-their-minds', '그들의 생각을 바꾸는 방법', '2026-06-16'),
      review('black-swan', '블랙스완', '2026-05-27'),
      review('lord-of-the-flies', '파리대왕', '2026-06-02'),
      review('future-arrived-first', '먼저 온 미래', '2026-01-26'),
      review('goethe-said-everything', '괴테는 모든 것을 말했다', '2026-05-12'),
      review('art-thief', '예술 도둑', '2026-04-06'),
      review('poor-charlies-almanack', '가난한 찰리의 연감', '2026-04-16'),
      review('how-we-crossed-winter', '우리가 겨울을 지나온 방식', '2026-01-15'),
      review('factfulness', '팩트풀니스', '2025-11-17'),
      review('habitus', '아비투스', '2026-03-10'),
    ];

    const result = buildHomePresentation({ articles, reviews });

    expect(result.featuredReview?.id).toBe('changing-their-minds');
    expect(result.featuredArticle?.id).toBe('uncle-bob-ai-code-review-evidence');
    expect(result.featuredReading?.id).toBe('black-swan');
    expect(result.openRecords.map((entry) => entry.id)).toEqual([
      'shared-ai-conversation-evidence-boundaries',
      'aws-static-frontend-serverless-bff',
    ]);
    expect(result.books.map((entry) => entry.id)).toEqual([
      'lord-of-the-flies',
      'future-arrived-first',
      'goethe-said-everything',
      'art-thief',
      'poor-charlies-almanack',
      'how-we-crossed-winter',
      'factfulness',
      'habitus',
    ]);
  });

  it('falls back to available real content without duplicating a sparse corpus', () => {
    const loneArticle = article('only-article', '유일한 기술 기록', '2026-08-01');
    const loneReview = review('only-review', '유일한 읽기 기록', '2026-07-01');

    const result = buildHomePresentation({
      articles: [loneArticle],
      reviews: [loneReview],
    });

    expect(result.featuredReview?.id).toBe('only-review');
    expect(result.featuredArticle?.id).toBe('only-article');
    expect(result.featuredReading).toBeUndefined();
    expect(result.openRecords).toEqual([]);
    expect(result.books).toEqual([]);
  });

  it('selects the approved real public-memory sentences in their editorial order', () => {
    const thoughts = [
      { slug: 'agent-harnesses-are-operating-systems', claimKo: '에이전트 하네스 문장' },
      { slug: 'context-quality-is-routing-problem', claimKo: '컨텍스트 품질 문장' },
      { slug: 'personal-sites-should-show-records-first', claimKo: '개인 블로그 문장' },
      { slug: 'memory-needs-retrieval-not-decoration', claimKo: 'Second brain 문장' },
    ];

    const result = selectHomeMemories(thoughts);

    expect(result.map((thought) => thought.slug)).toEqual([
      'personal-sites-should-show-records-first',
      'memory-needs-retrieval-not-decoration',
      'context-quality-is-routing-problem',
    ]);
  });
});
