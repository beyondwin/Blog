import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildPublicMemory,
  collectMemoryInputs,
  writePublicMemory,
} from './memory/project.mjs';

async function writeThought(root, slug, frontmatter) {
  const dir = join(root, 'memory/thoughts');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${slug}.md`), `---\n${frontmatter}\n---\n\nBody for ${slug}.\n`);
}

async function makeProjectionRoot() {
  const root = await mkdtemp(join(tmpdir(), 'memory-project-'));
  await mkdir(join(root, 'src/content/articles'), { recursive: true });
  await mkdir(join(root, 'docs/notes/skills'), { recursive: true });
  await writeFile(join(root, 'src/content/articles/context-refinement-system-design.mdx'), '---\ntitle: Context\n---\n');
  await writeFile(join(root, 'docs/notes/skills/gstack-superpowers-summary.md'), '# GStack\n');
  return root;
}

const publicThought = `schema_version: 1
slug: context-quality-is-routing-problem
claim_ko: "컨텍스트 품질은 라우팅과 검증 구조의 문제다."
claim_en: "Context quality is a routing and verification problem."
memory_type: semantic
origin: kws
confidentiality: public
surfaces: [memory-public]
topics: [ai-workflow, context-engineering]
theses: [ai-workflow-quality]
sources:
  - kind: article
    path: src/content/articles/context-refinement-system-design.mdx
    title: "Context Refinement System 설계 요약"
    date: 2026-05-16
review:
  status: accepted
  reviewed_at: 2026-05-24`;

describe('public memory projection', () => {
  it('exports only accepted public thoughts with memory-public surface', async () => {
    const root = await makeProjectionRoot();
    await writeThought(root, 'context-quality-is-routing-problem', publicThought);
    await writeThought(root, 'private-unpublished-example', publicThought
      .replace('slug: context-quality-is-routing-problem', 'slug: private-unpublished-example')
      .replace('confidentiality: public', 'confidentiality: private'));
    await writeFile(join(root, 'memory/edges.jsonl'), '');
    await writeFile(join(root, 'memory/sources.jsonl'), '');

    const inputs = await collectMemoryInputs({ root });
    const projection = await buildPublicMemory(inputs, { root, generatedAt: '2026-05-24T00:00:00.000Z' });

    expect(projection.counts).toMatchObject({
      thoughts: 1,
      topics: 2,
      sources: 1,
    });
    expect(projection.thoughts.map((thought) => thought.slug)).toEqual(['context-quality-is-routing-problem']);
    expect(projection.sources[0].date).toBe('2026-05-16');
    expect(projection.excluded.private).toBe(1);
  });

  it('keeps only edges whose endpoints are public thoughts', async () => {
    const root = await makeProjectionRoot();
    await writeThought(root, 'context-quality-is-routing-problem', publicThought);
    await writeThought(root, 'agent-workflows-need-review-gates', publicThought
      .replaceAll('context-quality-is-routing-problem', 'agent-workflows-need-review-gates')
      .replace('Context quality is a routing and verification problem.', 'Agent workflows need explicit review gates.')
      .replace('src/content/articles/context-refinement-system-design.mdx', 'docs/notes/skills/gstack-superpowers-summary.md'));
    await writeFile(join(root, 'memory/edges.jsonl'), [
      JSON.stringify({ from: 'context-quality-is-routing-problem', to: 'agent-workflows-need-review-gates', type: 'supports', confidence: 0.82 }),
      JSON.stringify({ from: 'context-quality-is-routing-problem', to: 'missing-thought', type: 'supports', confidence: 0.5 }),
    ].join('\n'));
    await writeFile(join(root, 'memory/sources.jsonl'), '');

    const inputs = await collectMemoryInputs({ root });
    const projection = await buildPublicMemory(inputs, { root, generatedAt: '2026-05-24T00:00:00.000Z' });

    expect(projection.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'context-quality-is-routing-problem',
        to: 'agent-workflows-need-review-gates',
        type: 'supports',
      }),
    ]));
    expect(projection.edges.some((edge) => edge.to === 'missing-thought')).toBe(false);
  });

  it('records public projection exclusion reasons', async () => {
    const root = await makeProjectionRoot();
    await writeThought(root, 'context-quality-is-routing-problem', publicThought);
    await writeThought(root, 'needs-review-example', publicThought
      .replace('slug: context-quality-is-routing-problem', 'slug: needs-review-example')
      .replace('status: accepted', 'status: needs_review'));
    await writeThought(root, 'missing-source-example', publicThought
      .replace('slug: context-quality-is-routing-problem', 'slug: missing-source-example')
      .replace(`sources:
  - kind: article
    path: src/content/articles/context-refinement-system-design.mdx
    title: "Context Refinement System 설계 요약"
    date: 2026-05-16`, 'sources: []'));
    await writeThought(root, 'unsupported-schema-example', publicThought
      .replace('slug: context-quality-is-routing-problem', 'slug: unsupported-schema-example')
      .replace('schema_version: 1', 'schema_version: 99'));
    await writeFile(join(root, 'memory/edges.jsonl'), '');
    await writeFile(join(root, 'memory/sources.jsonl'), '');

    const inputs = await collectMemoryInputs({ root });
    const projection = await buildPublicMemory(inputs, { root, generatedAt: '2026-05-24T00:00:00.000Z' });

    expect(projection.excluded).toMatchObject({
      notAccepted: 1,
      missingSource: 1,
      unsupportedSchema: 1,
      invalidSource: 0,
    });
  });

  it('fails validation for a broken source path', async () => {
    const root = await makeProjectionRoot();
    await writeThought(root, 'context-quality-is-routing-problem', publicThought
      .replace('src/content/articles/context-refinement-system-design.mdx', 'src/content/articles/missing.mdx'));
    await writeFile(join(root, 'memory/edges.jsonl'), '');
    await writeFile(join(root, 'memory/sources.jsonl'), '');

    const inputs = await collectMemoryInputs({ root });
    await expect(buildPublicMemory(inputs, { root })).rejects.toThrow('source.path does not exist');
  });

  it('writes formatted public memory JSON', async () => {
    const root = await makeProjectionRoot();
    const outputPath = join(root, 'src/data/memory.public.json');
    const projection = {
      schemaVersion: 1,
      generatedAt: '2026-05-24T00:00:00.000Z',
      counts: { thoughts: 0, topics: 0, edges: 0, sources: 0 },
      thoughts: [],
      topics: [],
      sources: [],
      edges: [],
      excluded: {},
    };

    await writePublicMemory(projection, outputPath);

    expect(await readFile(outputPath, 'utf8')).toBe(`${JSON.stringify(projection, null, 2)}\n`);
  });
});
