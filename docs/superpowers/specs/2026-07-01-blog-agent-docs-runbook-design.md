# Blog Agent Docs Runbook Design

Date: 2026-07-01
Status: approved design
Scope: project documentation structure and agent-oriented task routing

## Context

`beyondwin` already has a useful project documentation set:

- `README.md` gives the repo overview, routes, local commands, archive docs
  rules, and Graphify rule.
- `PRODUCT.md`, `DESIGN.md`, and `SYNC.md` define product direction, visual
  constraints, and queue-sync behavior.
- `docs/notes/project/` follows a Diataxis-style split:
  - `README.md` as the project docs hub,
  - `getting-started.md` as the first-run tutorial,
  - `publishing-workflows.md` as operational how-to,
  - `architecture-reference.md` as the technical reference,
  - `design-and-content-rationale.md` as the explanation layer.
- `docs/README.md`, `docs/_index/catalog.yml`, `docs/_index/topics.yml`, and
  `docs/INDEX.md` define the archive documentation library.

The current weakness is not missing documentation. The weakness is that humans
and coding agents enter through mostly the same prose documents. A developer can
read the existing docs and understand the system, but an agent starting a task
still needs to infer the read order, edit surface, verification command, and
public/private boundary for each task type.

Graphify is present at `graphify-out/`, but its output is generated navigation.
It can help orient architecture questions, while current claims still need to be
verified against `src/`, `scripts/`, `docs/raw/`, or `docs/notes/`.

## Goal

Add an agent-oriented runbook layer without rewriting the human-facing project
docs.

Success means:

- Developers still start from `README.md` and `docs/notes/project/README.md`.
- Agents get a short task map that tells them what to read, what they may edit,
  what they should avoid, and how to verify each task.
- The runbook links to the existing source-of-truth docs instead of duplicating
  long explanations.
- Archive docs index metadata stays in sync when the new curated project note is
  added.
- The repo makes a clear distinction between generated navigation layers and
  durable source-of-truth files.

## Non-Goals

This design does not include:

- rewriting the full `docs/notes/project/` set,
- restructuring `README.md`, `PRODUCT.md`, `DESIGN.md`, or `SYNC.md`,
- adding new documentation automation scripts,
- generating `docs/wiki/`,
- changing the Astro site UI,
- changing content schemas, routes, or validation logic.

The first implementation should be a documentation structure improvement, not a
runtime feature.

## Recommended Approach

Use a separated runbook model.

Human-facing docs remain Diataxis-oriented and explanatory. The new agent-facing
document is a compact execution contract:

```text
README.md
  -> shared first entry point

docs/notes/project/
  README.md                         # human project documentation hub
  getting-started.md                # first-run tutorial
  publishing-workflows.md           # content and docs operations
  architecture-reference.md         # route, schema, script, test contracts
  design-and-content-rationale.md   # why the system is shaped this way
  agent-runbook.md                  # new agent task map
```

`agent-runbook.md` should route the agent to the right existing documents rather
than restating every detail. This keeps the runbook short and reduces drift.

## Document Responsibilities

### `README.md`

First repo entry point for humans and agents.

It should briefly link to the agent runbook in the documentation section, while
keeping the current overview focused on product shape, public routes, local
commands, archive docs, and Graphify.

### `docs/notes/project/README.md`

Human-facing project docs hub.

It should add `agent-runbook.md` to the document map with a clear label such as
`Agent Runbook`, and explain that it is for task routing and verification rather
than conceptual onboarding.

### `docs/notes/project/agent-runbook.md`

Agent-facing execution surface.

It should include:

- `Read Order`: which source files to read before different task families.
- `Task Map`: task, purpose, required context, editable files, risky files,
  verification, and browser route checks.
- `Validation Matrix`: minimum commands for docs-only, content-only,
  source-grounded article, memory projection, route/layout/style, and new lane
  work.
- `Public/Private Boundaries`: memory source, generated public JSON,
  `docs/raw`, `docs/wiki`, `graphify-out`, article evidence packets, and public
  route boundaries.
- `Index Sync Rules`: when to update `docs/_index/catalog.yml`,
  `docs/_index/topics.yml`, and `docs/INDEX.md`.
- `Graphify Rules`: when to read `GRAPH_REPORT.md`, when to use graph queries,
  and when to refresh the graph.
- `Common Failure Modes`: repeated mistakes that the runbook should prevent.

The runbook should be concrete enough that an agent can start common work
without broad repo search.

### `docs/_index/catalog.yml`, `docs/_index/topics.yml`, and `docs/INDEX.md`

The new runbook is a curated project note, so it belongs in the existing
`project` topic.

Implementation should:

- add one `catalog.yml` entry for `docs/notes/project/agent-runbook.md`,
- keep the existing `project` topic in `topics.yml` and update its description
  only if needed,
- add a visible row to `docs/INDEX.md`.

## Task Map Shape

The runbook should cover at least these task families.

| Task family | Required context | Primary edit surface | Verification |
| --- | --- | --- | --- |
| Ordinary article | `publishing-workflows.md`, `src/content.config.ts` | `src/content/articles/*.mdx` | `npm run validate`; route preview when requested |
| Source-grounded article | `publishing-workflows.md`, article-factory notes | article MDX and evidence packet | `npm run validate`; rendered route review |
| Review, idea, or travel note | `publishing-workflows.md`, `architecture-reference.md` | matching collection folder under `src/content/` | `npm run validate` |
| Queue analysis | `SYNC.md`, `publishing-workflows.md`, `scripts/queue.mjs` | `queue.md`, `src/content/analysis/*.mdx` | `npm run validate`; queue metadata check |
| Public memory projection | `architecture-reference.md`, `docs/implementation/memory-second-brain.md` | `memory/**`, `src/data/memory.public.json` | `npm run memory:validate`; `npm run validate` for closeout |
| Archive docs note | `docs/README.md`, `docs/_index/README.md` | `docs/notes/**`, `_index`, `docs/INDEX.md` | index files in sync; `npm run validate` when practical |
| New content lane | `architecture-reference.md`, `DESIGN.md` | schema, pages, layouts, validation, docs | `npm run validate`; route preview |
| Route/layout/style change | `DESIGN.md`, `architecture-reference.md` | `src/pages`, `src/layouts`, `src/components`, CSS | `npm run validate`; browser check |

Each row should tell the agent which files are dangerous to edit casually. For
example, public memory work must not make `/memory` read `memory/**` directly,
and archive docs work must not treat `graphify-out/` as source of truth.

## Validation Strategy

For the design-doc commit:

```bash
git diff --check
```

For the implementation that follows:

```bash
npm run validate
git diff --check
```

Run `graphify update .` only when code files change, or when the implementation
explicitly chooses to refresh graph navigation after documentation structure
changes. `graphify-out/` remains generated output and should not be treated as
the primary authored documentation.

## Acceptance Criteria

The later implementation is complete when:

- `docs/notes/project/agent-runbook.md` exists and is written as a task map, not
  a long conceptual essay.
- `README.md` links to the agent runbook from the documentation section.
- `docs/notes/project/README.md` includes the runbook in its document map.
- `docs/_index/catalog.yml`, `docs/_index/topics.yml`, and `docs/INDEX.md` stay
  consistent with the new curated note.
- The runbook covers ordinary content, source-grounded articles, queue analysis,
  memory projection, archive docs, new lanes, and route/layout/style changes.
- The runbook identifies public/private boundaries and generated-source
  boundaries clearly.
- Verification commands pass.

## Future Work

Possible later improvements:

- Add a small docs-index generation script if manual `catalog.yml` and
  `docs/INDEX.md` synchronization becomes error-prone.
- Add focused documentation tests for catalog path existence and topic
  references.
- Generate a lightweight `docs/wiki/` navigation layer from curated notes.
- Add a project map diagram if the docs structure becomes harder to explain in
  text.
