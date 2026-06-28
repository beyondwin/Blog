import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSeedCandidates, writeSeedCandidates } from './memory/seed.mjs';

const execFileAsync = promisify(execFile);
const seedScriptPath = fileURLToPath(new URL('./memory/seed.mjs', import.meta.url));

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'memory-seed-'));
  await mkdir(join(root, 'docs/_index'), { recursive: true });
  await mkdir(join(root, 'src/content/articles'), { recursive: true });
  return root;
}

describe('memory seed candidates', () => {
  it('creates private review candidates from docs catalog metadata', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'docs/_index/catalog.yml'), `- title: Context Refinement System 설계 요약
  path: docs/_inbox/context-refinement-system-design.md
  topic: skills/agent-workflows
  type: research-note
  language: ko
  status: inbox
  summary: 거친 사용자 입력을 실행 가능한 작업 요청으로 바꾸는 시스템 설계.
  source: unknown
  updated: 2026-05-16
`);

    const candidates = await buildSeedCandidates({ root });

    expect(candidates).toEqual([
      expect.objectContaining({
        slug: 'context-refinement-system',
        claim_ko: 'Context Refinement System 설계 요약',
        claim_en: 'Context Refinement System 설계 요약',
        confidentiality: 'private',
        surfaces: [],
        topics: ['skills/agent-workflows'],
        review: { status: 'candidate' },
        sources: [
          {
            kind: 'research-note',
            path: 'docs/_inbox/context-refinement-system-design.md',
            title: 'Context Refinement System 설계 요약',
            date: '2026-05-16',
          },
        ],
      }),
    ]);
  });

  it('creates candidates from Astro content frontmatter', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'docs/_index/catalog.yml'), '[]\n');
    await writeFile(join(root, 'src/content/articles/context-refinement-system-design.mdx'), `---
title: "Context Refinement System 설계 요약"
description: "거친 사용자 입력을 실행 가능한 작업 요청으로 바꾸는 시스템 설계."
createdAt: "2026-05-16"
updatedAt: "2026-05-16"
tags: ["AI", "workflow"]
status: "published"
---

Body.
`);

    const candidates = await buildSeedCandidates({ root });

    expect(candidates).toEqual([
      expect.objectContaining({
        slug: 'context-refinement-system',
        topics: ['AI', 'workflow', 'articles'],
        seed: expect.objectContaining({
          source: 'astro-content',
          collection: 'articles',
        }),
      }),
    ]);
  });

  it('uses stable source kinds for each Astro content collection', async () => {
    const root = await makeRoot();
    await mkdir(join(root, 'src/content/analysis'), { recursive: true });
    await writeFile(join(root, 'docs/_index/catalog.yml'), '[]\n');
    await writeFile(join(root, 'src/content/analysis/open-design.mdx'), `---
title: "Open Design 분석"
description: "디자인 에이전트 런타임 분석."
createdAt: "2026-05-16"
updatedAt: "2026-05-16"
tags: ["AI", "design"]
status: "published"
---

Body.
`);

    const candidates = await buildSeedCandidates({ root });

    expect(candidates[0].sources[0]).toMatchObject({
      kind: 'analysis',
      path: 'src/content/analysis/open-design.mdx',
    });
  });

  it('skips unpublished Astro content', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'docs/_index/catalog.yml'), '[]\n');
    await writeFile(join(root, 'src/content/articles/review-only.mdx'), `---
title: "Review Only"
description: "Not ready for deterministic memory review seeding."
createdAt: "2026-05-16"
updatedAt: "2026-05-16"
tags: ["AI"]
status: "review"
---

Body.
`);

    expect(await buildSeedCandidates({ root })).toEqual([]);
  });

  it('falls back to file names when titles do not produce useful slugs', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'docs/_index/catalog.yml'), '[]\n');
    await writeFile(join(root, 'src/content/articles/andrej-karpathy-skills-analysis.mdx'), `---
title: "코딩 에이전트에게 필요한 네 가지 규율"
description: "AI 코딩 에이전트의 실패를 줄이는 행동 규칙."
createdAt: "2026-05-16"
updatedAt: "2026-05-16"
tags: ["AI", "coding"]
status: "published"
---

Body.
`);

    const candidates = await buildSeedCandidates({ root });

    expect(candidates[0].slug).toBe('andrej-karpathy-skills-analysis');
  });

  it('writes one JSON object per candidate', async () => {
    const root = await makeRoot();
    const outputPath = join(root, 'memory/review/seed-candidates.jsonl');
    const candidates = [
      {
        slug: 'a',
        claim_ko: 'A',
        claim_en: 'A',
        memory_type: 'semantic',
        origin: 'kws',
        confidentiality: 'private',
        surfaces: [],
        topics: ['one'],
        theses: [],
        sources: [{ kind: 'article', path: 'src/content/articles/a.mdx', title: 'A' }],
        review: { status: 'candidate' },
      },
    ];

    await writeSeedCandidates(candidates, outputPath);

    expect(await readFile(outputPath, 'utf8')).toBe(`${JSON.stringify(candidates[0])}\n`);
  });

  it('runs as a CLI from worktree paths that contain spaces', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'docs/_index/catalog.yml'), '[]\n');
    await writeFile(join(root, 'src/content/articles/context-refinement-system-design.mdx'), `---
title: "Context Refinement System 설계 요약"
description: "거친 사용자 입력을 실행 가능한 작업 요청으로 바꾸는 시스템 설계."
createdAt: "2026-05-16"
updatedAt: "2026-05-16"
tags: ["AI", "workflow"]
status: "published"
---

Body.
`);

    const { stdout } = await execFileAsync(process.execPath, [seedScriptPath], { cwd: root });

    expect(stdout).toContain('Wrote 1 memory seed candidates');
    expect(await readFile(join(root, 'memory/review/seed-candidates.jsonl'), 'utf8')).toContain(
      '"slug":"context-refinement-system"',
    );
  });
});
