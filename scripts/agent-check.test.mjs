import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { checkAgentSetup } from './agent-check.mjs';

const execFileAsync = promisify(execFile);
const checkerPath = fileURLToPath(new URL('./agent-check.mjs', import.meta.url));

const guidanceFiles = [
  'AGENTS.md',
  'src/AGENTS.md',
  'src/content/AGENTS.md',
  'docs/AGENTS.md',
  'memory/AGENTS.md',
];

const skillNames = [
  'research-and-publish',
  'site-change',
  'archive-and-memory',
];

async function put(root, relativePath, content) {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

async function makeValidRoot() {
  const root = await mkdtemp(join(tmpdir(), 'blog-agent-check-'));

  for (const file of guidanceFiles) {
    await put(root, file, '# Guidance\n');
  }

  await put(root, 'AGENTS.md', `# Project guidance

Read docs/notes/project/agent-runbook.md first.
Before editing, read src/AGENTS.md, src/content/AGENTS.md, docs/AGENTS.md, or memory/AGENTS.md for the target subtree.
`);
  await put(root, 'docs/notes/project/agent-runbook.md', '# Agent Runbook\n');

  for (const name of skillNames) {
    await put(root, `.agents/skills/${name}/SKILL.md`, `---
name: ${name}
description: Use this project workflow when its scoped task is requested.
---

# ${name}
`);
  }

  await put(root, 'docs/notes/project/README.md', '# Project docs\n');
  await put(root, 'docs/notes/project/guide.md', '# Guide\n');
  await put(root, 'docs/_index/catalog.yml', `- title: Agent Runbook
  path: docs/notes/project/agent-runbook.md
  topic: project
  type: guide
  language: en
  status: organized
  summary: Project agent workflow.
  source: README.md
  updated: 2026-07-19
- title: Guide
  path: docs/notes/project/guide.md
  topic: project
  type: guide
  language: en
  status: organized
  summary: Project guide.
  source: README.md
  updated: 2026-07-19
`);
  await put(root, 'docs/_index/topics.yml', `- id: project
  name: Project
  description: Project documentation.
  folder: docs/notes/project
`);
  await put(root, 'docs/INDEX.md', `[Agent Runbook](notes/project/agent-runbook.md)
[Guide](notes/project/guide.md)
`);
  await put(root, 'apps/site/app/root.tsx', `const memoryUrl = '/memory/';
export function Root() { return <a href={memoryUrl}>Memory</a>; }
`);

  return root;
}

describe('agent setup check', () => {
  it('accepts the complete repository contract', async () => {
    const root = await makeValidRoot();
    try {
      expect(await checkAgentSetup(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('aggregates catalog, topic, index, and curated-note failures', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/notes/project/orphan.md', '# Orphan\n');
      await put(root, 'docs/_index/catalog.yml', `- title: Missing
  path: docs/notes/project/missing.md
  topic: missing-topic
  type: guide
  language: en
  status: organized
  summary: Missing file.
  source: README.md
  updated: 2026-07-19
- title: Duplicate
  path: docs/notes/project/missing.md
  topic: missing-topic
  type: guide
  language: en
  status: organized
  summary: Duplicate path.
  source: README.md
  updated: 2026-07-19
`);

      const errors = await checkAgentSetup(root);
      expect(errors).toEqual(expect.arrayContaining([
        'docs/_index/catalog.yml: duplicate path "docs/notes/project/missing.md"',
        'docs/_index/catalog.yml: path does not exist "docs/notes/project/missing.md"',
        'docs/_index/catalog.yml: unknown topic "missing-topic"',
        'docs/INDEX.md: missing catalog path "docs/notes/project/missing.md"',
        'docs/notes/project/guide.md: curated note is missing from catalog.yml',
        'docs/notes/project/orphan.md: curated note is missing from catalog.yml',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts normalized inline and reference-style docs index links', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/INDEX.md', `[Agent Runbook](<notes/project/agent-runbook.md?view=full#start> "Runbook title")
[Guide][project-guide]

[project-guide]: <notes/project/guide%2Emd> 'Guide title'
`);

      expect(await checkAgentSetup(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not count image targets or fenced examples as docs index links', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/INDEX.md', `![Guide cover](notes/project/guide.md)

\`\`\`md
[Agent Runbook](notes/project/agent-runbook.md)
\`\`\`
`);

      expect(await checkAgentSetup(root)).toEqual(expect.arrayContaining([
        'docs/INDEX.md: missing catalog path "docs/notes/project/agent-runbook.md"',
        'docs/INDEX.md: missing catalog path "docs/notes/project/guide.md"',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('aggregates malformed catalog and topic entry shapes without throwing', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/_index/catalog.yml', `- 17
- title: Invalid fields
  path:
    - docs/notes/project/guide.md
  topic: 42
  type: guide
  language: en
  status: organized
  summary: Invalid field types.
  source: README.md
  updated: 2026-07-19
`);
      await put(root, 'docs/_index/topics.yml', `- project
- id:
    - project
  name: 42
  description: Project documentation.
  folder:
    nested: docs/notes/project
`);

      await expect(checkAgentSetup(root)).resolves.toEqual(expect.arrayContaining([
        'docs/_index/catalog.yml: entry 1 must be an object',
        'docs/_index/catalog.yml: entry 2 field "path" must be a string',
        'docs/_index/catalog.yml: entry 2 field "topic" must be a string',
        'docs/_index/topics.yml: entry 1 must be an object',
        'docs/_index/topics.yml: entry 2 field "id" must be a string',
        'docs/_index/topics.yml: entry 2 field "name" must be a string',
        'docs/_index/topics.yml: entry 2 field "folder" must be a string',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports malformed skills and stale Graphify operating commands', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, '.agents/skills/site-change/SKILL.md', '# Missing metadata\n');
      await put(root, 'docs/notes/project/agent-runbook.md', 'Run graphify update . after edits.\n');

      const errors = await checkAgentSetup(root);
      expect(errors).toEqual(expect.arrayContaining([
        '.agents/skills/site-change/SKILL.md: frontmatter name must be "site-change"',
        '.agents/skills/site-change/SKILL.md: frontmatter description is required',
        'docs/notes/project/agent-runbook.md: removed Graphify operating command is not allowed',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects arbitrary Graphify commands across active guidance and project skills', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'src/AGENTS.md', 'Run `graphify install local-plugin` before editing.\n');
      await put(root, 'docs/notes/project/agent-runbook.md', '1. graphify check-update\n');
      await put(root, '.agents/skills/extra/SKILL.md', `---
name: extra
description: Extra workflow.
---

Use graphify frobnicate . to prepare the repository.
`);

      expect(await checkAgentSetup(root)).toEqual(expect.arrayContaining([
        'src/AGENTS.md: removed Graphify operating command is not allowed',
        'docs/notes/project/agent-runbook.md: removed Graphify operating command is not allowed',
        '.agents/skills/extra/SKILL.md: removed Graphify operating command is not allowed',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects option-only Graphify CLI invocations', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/AGENTS.md', 'graphify --diagnose\n');

      expect(await checkAgentSetup(root)).toContain(
        'docs/AGENTS.md: removed Graphify operating command is not allowed',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an active Graphify command after removal prose on the same line', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/AGENTS.md', 'Graphify is removed; run graphify install local-plugin.\n');

      expect(await checkAgentSetup(root)).toContain(
        'docs/AGENTS.md: removed Graphify operating command is not allowed',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a period-delimited Graphify command after removal prose', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/AGENTS.md', 'Graphify is removed. Run graphify install local-plugin.\n');

      expect(await checkAgentSetup(root)).toContain(
        'docs/AGENTS.md: removed Graphify operating command is not allowed',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows Graphify removal prose and historical content outside active guidance', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/notes/project/agent-runbook.md', `graphify has been removed and is not a project operating dependency.
Graphify commands remain historical content only.
Graphify must remain disabled in this project.
Do not run graphify update .
Never use graphify install local-plugin.
`);
      await put(root, '.agents/skills/extra/SKILL.md', `---
name: extra
description: Extra workflow.
---

Graphify is removed; do not restore Graphify commands.
`);
      await put(root, 'src/content/articles/graphify-history.mdx', `# Historical record

\`\`\`sh
graphify extract .
\`\`\`
`);

      expect(await checkAgentSetup(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('aggregates invalid skill frontmatter without aborting the check', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, '.agents/skills/site-change/SKILL.md', `---
name: [
description: Broken YAML.
---
`);

      await expect(checkAgentSetup(root)).resolves.toContain(
        '.agents/skills/site-change/SKILL.md: invalid frontmatter',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('validates every immediate project skill and reports duplicate names', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, '.agents/skills/duplicate/SKILL.md', `---
name: site-change
description: Duplicate metadata name.
---
`);
      await put(root, '.agents/skills/malformed/SKILL.md', `---
name: [
description: Broken YAML.
---
`);
      await put(root, '.agents/skills/missing-description/SKILL.md', `---
name: missing-description
---
`);
      await put(root, '.agents/skills/valid-extra/SKILL.md', `---
name: valid-extra
description: A valid extra project workflow.
---
`);
      await put(root, '.agents/skills/valid-extra/support/SKILL.md', '# Nested support markdown without metadata.\n');

      expect(await checkAgentSetup(root)).toEqual(expect.arrayContaining([
        '.agents/skills: duplicate skill name "site-change"',
        '.agents/skills/malformed/SKILL.md: invalid frontmatter',
        '.agents/skills/missing-description/SKILL.md: frontmatter description is required',
      ]));
      expect(await checkAgentSetup(root)).not.toEqual(expect.arrayContaining([
        expect.stringContaining('.agents/skills/valid-extra/support/SKILL.md'),
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enforces normalized directory and frontmatter names for extra skills', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, '.agents/skills/Mixed_Name/SKILL.md', `---
name: Mixed_Name
description: Invalid naming convention.
---
`);
      await put(root, '.agents/skills/folder-name/SKILL.md', `---
name: different-name
description: Metadata does not match its directory.
---
`);

      expect(await checkAgentSetup(root)).toEqual(expect.arrayContaining([
        '.agents/skills/Mixed_Name/SKILL.md: skill directory name must use lowercase letters, numbers, and hyphens',
        '.agents/skills/Mixed_Name/SKILL.md: frontmatter name must use lowercase letters, numbers, and hyphens',
        '.agents/skills/folder-name/SKILL.md: frontmatter name must match directory "folder-name"',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects catalog paths that escape docs/notes after normalization', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/secret.md', '# Secret\n');
      await put(root, 'docs/_index/catalog.yml', `- title: Escaped
  path: docs/notes/../secret.md
  topic: project
  type: guide
  language: en
  status: organized
  summary: Escaped path.
  source: README.md
  updated: 2026-07-19
`);

      expect(await checkAgentSetup(root)).toContain(
        'docs/_index/catalog.yml: path must stay under docs/notes/ "docs/notes/../secret.md"',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects topic folders that escape docs/notes after normalization', async () => {
    const root = await makeValidRoot();
    try {
      await mkdir(join(root, 'docs/outside-topic'), { recursive: true });
      await put(root, 'docs/_index/topics.yml', `- id: project
  name: Project
  description: Project documentation.
  folder: docs/notes/../outside-topic
`);

      expect(await checkAgentSetup(root)).toContain(
        'docs/_index/topics.yml: folder must stay under docs/notes/ "docs/notes/../outside-topic"',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects catalog and topic symlinks that escape real docs/notes', async ({ skip }) => {
    const root = await makeValidRoot();
    try {
      await put(root, 'docs/outside-linked.md', '# Outside linked note\n');
      await mkdir(join(root, 'docs/outside-linked-topic'), { recursive: true });
      try {
        await symlink(
          join(root, 'docs/outside-linked.md'),
          join(root, 'docs/notes/project/linked.md'),
        );
        await symlink(
          join(root, 'docs/outside-linked-topic'),
          join(root, 'docs/notes/linked-topic'),
          'dir',
        );
      } catch (error) {
        if (['EACCES', 'ENOSYS', 'EPERM'].includes(error.code)) {
          skip(`symbolic links are unsupported: ${error.code}`);
          return;
        }
        throw error;
      }

      await put(root, 'docs/_index/catalog.yml', `- title: Linked
  path: docs/notes/project/linked.md
  topic: project
  type: guide
  language: en
  status: organized
  summary: Linked outside the notes root.
  source: README.md
  updated: 2026-07-19
`);
      await put(root, 'docs/_index/topics.yml', `- id: project
  name: Project
  description: Project documentation.
  folder: docs/notes/linked-topic
`);
      await put(root, 'docs/INDEX.md', '[Linked](notes/project/linked.md)\n');

      expect(await checkAgentSetup(root)).toEqual(expect.arrayContaining([
        'docs/_index/catalog.yml: path resolves outside docs/notes/ "docs/notes/project/linked.md"',
        'docs/_index/topics.yml: folder resolves outside docs/notes/ "docs/notes/linked-topic"',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('flags private-memory source paths without rejecting the public route', async () => {
    const root = await makeValidRoot();
    try {
      expect(await checkAgentSetup(root)).toEqual([]);
      await put(root, 'apps/site/app/routes/private.tsx', `import privateThoughts from '../../../../memory/private.json';
export function Private() { return <p>{privateThoughts.length}</p>; }
`);

      expect(await checkAgentSetup(root)).toContain(
        'apps/site/app/routes/private.tsx: public source references top-level memory/**',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('detects static private-memory module and filesystem references only', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'apps/site/app/routes/private.tsx', `export { privateThoughts } from '../../../../memory/private.js';
`);
      await put(root, 'src/content/articles/private.mdx', `import privateThoughts from '../../../memory/private.js';

# Private import
`);
      await put(root, 'packages/content/src/dynamic.ts', `export async function loadPrivate() {
  return import(\`../../../memory/private.js\`);
}
`);
      await put(root, 'packages/content/src/filesystem.ts', `import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const value = readFileSync(join(process.cwd(), 'memory', 'private.json'), 'utf8');
`);
      await put(root, 'packages/content/src/unresolved.ts', `export function load(projectRoot, slug) {
  return readFileSync(join(projectRoot, 'memory', slug));
}
`);
      await put(root, 'packages/content/src/warning.ts', `export const warning = '../../../memory/private.json';
`);

      const errors = await checkAgentSetup(root);
      expect(errors).toEqual(expect.arrayContaining([
        'src/content/articles/private.mdx: public source references top-level memory/**',
        'packages/content/src/dynamic.ts: public source references top-level memory/**',
        'packages/content/src/filesystem.ts: public source references top-level memory/**',
        'apps/site/app/routes/private.tsx: public source references top-level memory/**',
      ]));
      expect(errors).not.toContain(
        'packages/content/src/unresolved.ts: public source references top-level memory/**',
      );
      expect(errors).not.toContain(
        'packages/content/src/warning.ts: public source references top-level memory/**',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('covers multiline imports and common path APIs without scanning code-like text', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'packages/content/src/multiline.ts', `import {
  privateThoughts,
} from '../../../memory/private.js';
`);
      await put(root, 'packages/content/src/required.cjs', `module.exports = require('../../../memory/private.json');\n`);
      await put(root, 'packages/content/src/read.mts', `import { readFile } from 'node:fs/promises';

export const data = readFile('memory/private.json');
`);
      await put(root, 'packages/content/src/resolved.ts', `import { resolve } from 'node:path';

export const path = resolve(process.cwd(), 'memory', 'private.json');
`);
      await put(root, 'packages/content/src/promise.ts', `export const warning = Promise.resolve('memory/private.json');\n`);
      await put(root, 'packages/content/src/code-like.ts', `export const examples = [
  "require('../../../memory/private.json')",
  \`readFile('memory/private.json')\`,
];
`);
      await put(root, 'packages/content/src/commented.ts', `// require('../../../memory/private.json')
/* readFile('memory/private.json') */
`);

      const errors = await checkAgentSetup(root);
      expect(errors).toEqual(expect.arrayContaining([
        'packages/content/src/multiline.ts: public source references top-level memory/**',
        'packages/content/src/read.mts: public source references top-level memory/**',
        'packages/content/src/required.cjs: public source references top-level memory/**',
        'packages/content/src/resolved.ts: public source references top-level memory/**',
      ]));
      expect(errors).not.toContain(
        'packages/content/src/code-like.ts: public source references top-level memory/**',
      );
      expect(errors).not.toContain(
        'packages/content/src/commented.ts: public source references top-level memory/**',
      );
      expect(errors).not.toContain(
        'packages/content/src/promise.ts: public source references top-level memory/**',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('detects private-memory reads through common fs promises imports and requires', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'packages/content/src/promises-named.ts', `import { promises as fs } from 'node:fs';

export const data = fs.readFile('memory/private.json');
`);
      await put(root, 'packages/content/src/promises-namespace.ts', `import * as fs from 'node:fs';

export const data = fs.promises.readFile('memory/private.json');
`);
      await put(root, 'packages/content/src/promises-destructured.cjs', `const { promises: fs } = require('node:fs');

module.exports = fs.readFile('memory/private.json');
`);
      await put(root, 'packages/content/src/promises-required.cjs', `const fs = require('node:fs');

module.exports = fs.promises.readFile('memory/private.json');
`);

      expect(await checkAgentSetup(root)).toEqual(expect.arrayContaining([
        'packages/content/src/promises-destructured.cjs: public source references top-level memory/**',
        'packages/content/src/promises-named.ts: public source references top-level memory/**',
        'packages/content/src/promises-namespace.ts: public source references top-level memory/**',
        'packages/content/src/promises-required.cjs: public source references top-level memory/**',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prints the success message and exits successfully through the CLI', async () => {
    const root = await makeValidRoot();
    try {
      const result = await execFileAsync(process.execPath, [checkerPath], { cwd: root });
      expect(result.stdout).toBe('Agent setup check passed.\n');
      expect(result.stderr).toBe('');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prints aggregated failures and exits non-zero through the CLI', async () => {
    const root = await makeValidRoot();
    try {
      await put(root, 'AGENTS.md', '# Missing required links\n');
      await put(root, 'docs/_index/catalog.yml', 'not: an array\n');

      let failure;
      try {
        await execFileAsync(process.execPath, [checkerPath], { cwd: root });
      } catch (error) {
        failure = error;
      }

      expect(failure?.code).toBe(1);
      expect(failure?.stdout).toBe('');
      expect(failure?.stderr).toContain('Agent setup check failed:\n');
      expect(failure?.stderr).toContain(
        '- AGENTS.md: missing scoped guidance link "docs/notes/project/agent-runbook.md"\n',
      );
      expect(failure?.stderr).toContain(
        '- docs/_index/catalog.yml: expected a YAML array\n',
      );
      expect(failure?.stderr).toContain(
        '- docs/notes/project/guide.md: curated note is missing from catalog.yml\n',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
