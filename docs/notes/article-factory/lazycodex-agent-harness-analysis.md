# LazyCodex Agent Harness Analysis Research Packet

Date: 2026-08-26
Status: verified-with-runtime-limit
Target article: src/content/articles/lazycodex-agent-harness-analysis.mdx

## Publication target

- Public article: `src/content/articles/lazycodex-agent-harness-analysis.mdx`
- Canonical repo: https://github.com/code-yeongyu/lazycodex
- Independent verification: 2026-06-24 (Asia/Seoul), static clone at `d4c4f05d424451bdd917cfa3416dbab3ff973c95`, plugin `4.13.0`
- 2026-08-26 re-check: official GitHub/docs/source only. LazyCodex installer, OmO Codex plugin, and the harness were not executed.
- Historical pin: `code-yeongyu/lazycodex` `d4c4f05d424451bdd917cfa3416dbab3ff973c95` (plugin.json `4.13.0`)
- 2026-08-26 HEAD: default branch still `main`, commit `10f95587d3aeacf208cc1fee88a91315962d31e8` (“docs(readme): replace rock logo with light mark”, 2026-08-09), 25 commits ahead of the pinned SHA
- Git root `package.json`: `lazycodex-ai` `0.2.2` (thin alias; files are `bin`, `README.md`, `LICENSE`)
- Plugin manifest at HEAD: `plugins/omo/.codex-plugin/plugin.json` `4.19.4`, 23 hooks
- Installable release: GitHub latest release `v4.19.4` (2026-08-01T09:50:15Z), npm dist-tag `latest` `lazycodex-ai@4.19.4` / `oh-my-openagent@4.19.4`. npm `beta` is `5.0.0-beta.21` (2026-08-26T07:00:58Z); `npx` default is latest.
- Docs site header on 2026-08-26: `v0.2.2`
- Repo created 2026-05-25T07:56:45Z. Stats on 2026-08-26: 3315 stars, 210 forks, 19 open issues. Adoption signals only.
- OmO: default branch `dev`, latest GitHub release name `v5.0.0-beta.19` (2026-08-24); npm `latest` still `4.19.4`
- Codex host: `openai/codex` HEAD `f5420174dafba153913a3e697f89002c338dfd7e` (2026-08-26), latest GitHub release `rust-v0.149.1` / name `0.149.1` (2026-08-24)

Editorial note: local published after verification.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| https://github.com/code-yeongyu/lazycodex | GitHub source | Canonical LazyCodex repo and install entrypoint. Default branch `main`. HEAD [`10f9558`](https://github.com/code-yeongyu/lazycodex/commit/10f95587d3aeacf208cc1fee88a91315962d31e8). | checked 2026-08-26 |
| https://lazycodex.ai/docs | Official docs | Product promise, command surface, Hephaestus, hooks, install/permission claims. Header `v0.2.2`. | checked 2026-08-26 |
| https://lazycodex.ai/ | Official site | Positioning: light Hephaestus port, four workflows, team mode, ulw-research. | checked 2026-08-26 |
| https://github.com/code-yeongyu/oh-my-openagent | GitHub source | Underlying OmO. Default branch `dev`. Light edition = `npx lazycodex-ai install`. Telemetry opt-out names. | checked 2026-08-26 |
| https://github.com/openai/codex | GitHub source | Host agent environment LazyCodex extends. | checked 2026-08-26 |
| https://zenn.dev/53able/articles/c0f9268ab6d45b | Third-party analysis | Discourse / adoption context, not implementation proof. | discourse only |
| https://www.threads.com/search?q=LazyCodex | Social discussion | Current discourse signal, not implementation proof. | discourse only |

## Local Source Inspection

- Repository path: GitHub contents/API on 2026-08-26 (no local clone required; no installer run)
- Commit: `10f95587d3aeacf208cc1fee88a91315962d31e8`
- Pinned 2026-06-24 commit: `d4c4f05d424451bdd917cfa3416dbab3ff973c95`
- Release observed: GitHub / npm latest `v4.19.4`; git root and docs site `0.2.2`
- Submodule `src/` points at OmO `65715d1c2c35e27ccf2195ef688b0909dddb403c` (2026-06-05). Marketplace/plugin payload at HEAD is `4.19.4`, not that submodule SHA.
- Files inspected:
  - `package.json`
  - `bin/lazycodex-ai.js`
  - `plugins/omo/.codex-plugin/plugin.json`
  - `plugins/omo/.mcp.json`
  - `plugins/omo/README.md`
  - `plugins/omo/components/telemetry/README.md`
  - `plugins/omo/components/rules/bundled-rules/hephaestus/gpt-5.5.md`
  - `plugins/omo/skills/init-deep/SKILL.md`
  - `plugins/omo/skills/ulw-plan/SKILL.md`
  - `plugins/omo/skills/start-work/SKILL.md`
  - `plugins/omo/skills/ulw-loop/SKILL.md`
  - `plugins/omo/skills/ulw-research/SKILL.md`
- Execution policy: static inspection only. `npx lazycodex-ai`, `omo install`, Codex plugins, and the harness were not executed.

## Evidence Ledger

| Claim | Result (2026-08-26) | Evidence | Strength | Article Section |
| --- | --- | --- | --- | --- |
| LazyCodex Git HEAD is a thin install alias that delegates to OmO for Codex setup. | Verified | HEAD `bin/lazycodex-ai.js` still forwards `install` to `npx --yes --package oh-my-openagent omo install --platform=codex`. Official docs repeat the equation. | High | 실제 구조 |
| The useful unit is an agent harness: skills, hooks, MCP tools, and workflow rules. | Verified | HEAD `plugin.json` skills `./skills/`, 23 hooks, mcpServers `./.mcp.json`; docs list commands/skills/hooks/MCP/roles. | High | 먼저 알아야 할 개념, 실제 구조 |
| Latest installable plugin/npm version is still `4.13.0`. | **Superseded** | Plugin.json `4.19.4` (was `4.13.0` at `d4c4f05`). GitHub latest release `v4.19.4`. npm dist-tag `latest` `4.19.4`. Git root / docs site remain `0.2.2`. npm `beta` `5.0.0-beta.21` is not `npx` default. | High | 도입, 확인한 자료 |
| The main commands are `$init-deep`, `$ulw-plan`, `$start-work`, and `$ulw-loop`. | Verified, README table narrowed | Official docs still front four commands. README Commands table lists three; `$init-deep` is workflow #1. | High | 핵심 기능 |
| `$ulw-plan` writes `plans/<slug>.md`. | **Narrowed** | Docs/README say `plans/<slug>.md`. HEAD ulw-plan skill writes `.omo/plans/<slug>.md` after approval. | Medium | 핵심 기능 |
| Social posts emphasize ultraresearch and broad search workflows. | Discourse only; current skill renamed | Official docs: `ulw-research` is “Maximum-saturation research mode (formerly `ultraresearch`)”. HEAD skill is `plugins/omo/skills/ulw-research/SKILL.md`. Threads/Zenn are not proof. | Medium | Ultraresearch와 최근 논의 |
| Hephaestus is OmO’s deep worker ported into Codex. | Verified and narrowed | Docs: no Sisyphus in the Codex package. Bundled rule `hephaestus/gpt-5.5.md`: Explore → Plan → Implement → Verify → Manually QA; do not revert others’ worktree changes. | High | Hephaestus라는 작업자 모델 |
| Permission, hooks, telemetry, and autonomous mode need adoption review. | Verified | Docs: hooks never run before Codex startup review; marketplace path does not touch permissions; autonomous is `--codex-autonomous`. Telemetry: once per UTC day, `omo_codex_daily_active`; opt-out `OMO_CODEX_DISABLE_POSTHOG=1` / `OMO_CODEX_SEND_ANONYMOUS_TELEMETRY=0` (global flags also). | High | 조심해야 할 점 |
| MCP servers are `grep_app`, `context7`, `codegraph`, `git_bash`, `lsp`. | Verified | HEAD `.mcp.json` and official docs. Plugin README: AST-grep is a skill, not an MCP server. | High | 실제 구조 |
| Rapid change ended in late June 2026. | **Superseded** | Repo created 2026-05-25. HEAD commit 2026-08-09. Latest GitHub/npm `4.19.4` on 2026-08-01. npm beta still moving on 2026-08-26. | High | 조심해야 할 점 |
| Junior readers can learn that AI coding quality depends on process and verification, not only model ability. | Unchanged | Synthesis from inspected workflow rules. | High | 주니어 개발자가 배울 점 |

## Junior Explanation Notes

- Explain "agent harness" through the analogy of a test harness.
- Explain why large codebase work needs planning, memory, and verification.
- Avoid assuming the reader already knows Codex plugins, MCP, or hooks.
- Convert tool-specific observations into general development lessons.
- Version numbers need a split: git alias / docs header vs plugin / npm latest vs beta.

## Blind Spots

- LazyCodex installer, OmO Codex plugin, Codex App/CLI, doctor, and the four commands were not executed on 2026-08-26. Runtime quality of ultrawork, team mode, and ulw-research is inferred from docs/source.
- Git submodule `src/` SHA `65715d1` (2026-06-05) is stale relative to the `4.19.4` plugin payload in `plugins/omo`. Public article follows plugin.json / docs / skills, not the submodule date.
- Official docs and README still say plan output is `plans/<slug>.md`; HEAD ulw-plan skill writes `.omo/plans/<slug>.md`.
- Docs recommended-environment table still says native Windows is “Not recommended”; FAQ says both npx and marketplace support Windows natively. Not used as a load-bearing public claim.
- npm `lazycodex-ai@4.19.4` repository field points at `oh-my-openagent`, not the thin git alias repo. Docs still describe the alias equation. Public article states both facts.
- Star/fork/issue counts are adoption snapshots only.
- Team mode is on the official site; it is not the thesis and was not promoted into the close.
- Threads and Zenn remain discourse, not implementation proof.

## Editorial Decisions

- Keep published. The harness thesis is not inverted.
- Preserve `createdAt: "2026-06-24"`. Set `updatedAt: "2026-08-26"` because the article changed.
- Title unchanged. Description dropped “Threads 논의까지 검토해” so the public summary does not treat discourse as evidence.
- Keep extra headings `## Hephaestus라는 작업자 모델` and `## Ultraresearch와 최근 논의`. They do not duplicate a required heading. Body of the latter now uses `ulw-research` with `ultraresearch` as legacy alias.
- Narrow version, command-table, plan-path, research-skill name, telemetry env vars, and “updated through late June” rather than polish over them.
- Do not treat npm `5.0.0-beta.21` as the default `npx` install.
- Abbreviate inline SHAs (`10f9558`, `d4c4f05`). Full hashes stay in list-item commit URLs and this packet so the colophon does not overflow at 390.
- Korean polish is local (two-layer check date, version split, renamed research skill). Keep first-person close.
- Catalog packet `updated` date is 2026-08-26. `docs/INDEX.md` has no date that this change would make wrong.

## Draft Outline

1. Thesis: LazyCodex changes how Codex works, not what Codex is.
2. 먼저 알아야 할 개념
3. 실제 구조
4. 핵심 기능
5. Hephaestus라는 작업자 모델
6. Ultraresearch와 최근 논의
7. 좋은 점
8. 조심해야 할 점
9. 언제 쓰면 좋은가
10. 주니어 개발자가 배울 점
11. 내 결론
12. 확인한 자료

## Quality Gate Notes

- The article includes a clear thesis before the first heading.
- The article contains every required `source-grounded` heading plus the two extra headings.
- The article separates source-verified claims from social discussion.
- The article includes adoption risks, not only strengths.
- The article includes a junior-reader section.
- The article includes source URLs and dated local source inspection details.
- The article states the two-layer check (2026-06-24 pin, 2026-08-26 HEAD) and that LazyCodex was not executed.
- The article is tagged `source-grounded` so `npm run article:quality` validates it.
- Catalog packet `updated` date is 2026-08-26.
