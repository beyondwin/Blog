import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  getProjectionExclusionReason,
  parseThoughtMarkdown,
  validateEdgeRecord,
  validateThoughtRecord,
} from './memory/schema.mjs';

const acceptedThought = {
  schema_version: 1,
  slug: 'context-quality-is-routing-problem',
  claim_ko: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
  claim_en: 'Context quality is a routing and verification problem.',
  memory_type: 'semantic',
  origin: 'kws',
  confidentiality: 'public',
  surfaces: ['memory-public'],
  topics: ['ai-workflow'],
  theses: ['ai-workflow-quality'],
  sources: [
    {
      kind: 'article',
      path: 'src/content/articles/context-refinement-system-design.mdx',
      title: 'Context Refinement System 설계 요약',
      date: '2026-05-16',
    },
  ],
  review: {
    status: 'accepted',
    reviewed_at: '2026-05-24',
  },
};

describe('memory schema validation', () => {
  it('parses thought markdown frontmatter and body', () => {
    const markdown = `---
schema_version: 1
slug: context-quality-is-routing-problem
claim_ko: "컨텍스트 품질은 라우팅과 검증 구조의 문제다."
claim_en: "Context quality is a routing and verification problem."
memory_type: semantic
origin: kws
confidentiality: public
surfaces: [memory-public]
topics: [ai-workflow]
sources:
  - kind: article
    path: src/content/articles/context-refinement-system-design.mdx
    title: "Context Refinement System 설계 요약"
review:
  status: accepted
---

Short note.`;

    expect(parseThoughtMarkdown(markdown, 'memory/thoughts/example.md')).toMatchObject({
      slug: 'context-quality-is-routing-problem',
      claim_ko: '컨텍스트 품질은 라우팅과 검증 구조의 문제다.',
      body: 'Short note.',
      filePath: 'memory/thoughts/example.md',
    });
  });

  it('accepts a complete public thought with a resolvable local source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memory-schema-'));
    const sourcePath = join(root, 'src/content/articles/context-refinement-system-design.mdx');
    await writeFile(sourcePath, '---\ntitle: Example\n---\n', { recursive: true }).catch(async () => {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(join(root, 'src/content/articles'), { recursive: true }));
      await writeFile(sourcePath, '---\ntitle: Example\n---\n');
    });

    expect(validateThoughtRecord(acceptedThought, { root })).toEqual([]);
  });

  it('rejects invalid enums and missing required fields', () => {
    const thought = {
      ...acceptedThought,
      memory_type: 'memoir',
      review: {},
    };

    expect(validateThoughtRecord(thought, { requireResolvedSources: false })).toEqual([
      'context-quality-is-routing-problem: memory_type must be semantic, procedural, reflective, or episodic',
      'context-quality-is-routing-problem: review.status is required',
    ]);
  });

  it('explains why thoughts are excluded from public projection', () => {
    expect(getProjectionExclusionReason({
      ...acceptedThought,
      confidentiality: 'private',
    })).toBe('private');

    expect(getProjectionExclusionReason({
      ...acceptedThought,
      review: { status: 'needs_review' },
    })).toBe('notAccepted');

    expect(getProjectionExclusionReason({
      ...acceptedThought,
      surfaces: ['article-ready'],
    })).toBe('notPublicSurface');
  });

  it('validates edge endpoints and allowed edge types', () => {
    const knownThoughts = new Set(['a', 'b']);

    expect(validateEdgeRecord({ from: 'a', to: 'b', type: 'supports', confidence: 0.8 }, knownThoughts)).toEqual([]);
    expect(validateEdgeRecord({ from: 'a', to: 'c', type: 'mentions', confidence: 1.2 }, knownThoughts)).toEqual([
      'edge a -> c: type must be supports, extends, instantiates, refines, contradicts, related, topic-tag, or thesis-tag',
      'edge a -> c: confidence must be a number from 0 to 1',
      'edge a -> c: target thought does not exist',
    ]);
  });
});
