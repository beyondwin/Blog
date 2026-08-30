# beyondwin agent contract

`beyondwin` is a React Router and MDX personal knowledge publishing system. Public content lives under `src/content/`, is compiled into an immutable release by `packages/content`, and is rendered only by `apps/site`. Public memory is projected into `src/data/memory.public.json`; private memory and archive sources have stricter boundaries.

## Start here

- Run `git status --short --branch` before editing. Preserve pre-existing changes and investigate unexpected broad diffs.
- Read `docs/notes/project/agent-runbook.md` for the smallest task-specific read order, editable surface, risks, and verification.
- Before editing a scoped subtree, read its guidance:
  - application code or UI: `src/AGENTS.md`
  - MDX content: `src/content/AGENTS.md` in addition to `src/AGENTS.md`
  - archive documentation: `docs/AGENTS.md`
  - private memory: `memory/AGENTS.md`
- Use the matching project skill under `.agents/skills/` for repeatable research, site-change, or archive-and-memory workflows.

## Decision records

- Before product, architecture, data-boundary, publishing-policy, or durable UX work, read `docs/notes/project/adr/README.md` and the relevant accepted ADRs.
- Create or update an ADR in the same change whenever work accepts, rejects, supersedes, or materially narrows one of those decisions. Routine implementation details and reversible local choices do not need an ADR.
- Keep exploratory options marked `proposed`; do not present them as accepted until the user has explicitly approved them. Preserve rejected options and reasons when they constrain future work.
- When an ADR is added or moved, update the ADR index, `docs/_index/catalog.yml`, `docs/_index/topics.yml` when needed, and `docs/INDEX.md`.

## Setup and completion

- Use Node 24 and install committed dependencies with `npm ci`.
- Use focused tests while iterating.
- Run `npm run validate` before claiming completion; it includes agent/content/media/article/memory checks, the full test and typecheck suites, immutable release build/verify/cleanup, and the local React static build.
- Run `git diff --check` and review the final diff for unrelated files.
- Review the relevant ADRs before closeout and confirm the implementation and documentation still match them.
- UI or interaction changes require a real browser check on affected routes at desktop and mobile widths.
- Use `npm run site:build` for local evidence. A production build additionally requires an explicitly approved normalized HTTPS `FORM_THOUGHT_SITE_ORIGIN`; do not invent one.

## Safety and scope

- Do not add dependencies, delete data, broaden public data, publish content, or promote memory without explicit authorization.
- Public application code must not import or read top-level `memory/**`; it reads `src/data/memory.public.json`.
- Preserve existing local servers. Use a separate port instead of killing or reconfiguring another process.
- Do not commit or push unless the user explicitly requests it.
- Historical renderer, parity, rollback, Public Atlas, and Graphify documents are evidence only. Do not restore their removed commands or dependencies; Graphify is article subject matter, not a project tool.
- 이 저장소는 public이다. `.gitignore`에 있는 경로(`.superpowers/`, `docs/superpowers/`, `docs/raw/**`, `docs/_inbox/`, `memory/review/*`)는 커밋하지 않는다. `git add -f`로도 올리지 않는다.
- `/Users/실제계정`, 개인 메일, 네이버/소셜 계정 ID, 로컬 Downloads 경로를 source·docs·테스트 fixture에 넣지 않는다. 익명 경로는 `/Users/user` 또는 `/Users/example`만 쓴다.
- git 작성자는 `beyondwin <beyondwin@users.noreply.github.com>`이다. 커밋 전에 tracked 파일이 ignore 규칙과 충돌하지 않는지 본다.
