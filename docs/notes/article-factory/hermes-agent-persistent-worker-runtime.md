# Hermes Agent Persistent Worker Runtime Research Packet

Date: 2026-08-26
Status: verified-with-runtime-limit
Target article: src/content/articles/hermes-agent-persistent-worker-runtime.mdx

## Publication target

- Public article: `src/content/articles/hermes-agent-persistent-worker-runtime.mdx`
- Canonical repo: https://github.com/NousResearch/hermes-agent
- Independent verification: 2026-06-29 (Asia/Seoul), local clone at `d0d2cf1c2f7e821e6d06a7a0e838ad66c6e17fd5`
- 2026-08-26 re-check: official GitHub/docs/source/issues only. Hermes install scripts, gateway services, and the agent runtime were not executed.
- Historical clone: `/tmp/hermes-agent-review` at `d0d2cf1c2f7e821e6d06a7a0e838ad66c6e17fd5` (“Merge pull request #54492 …”, 2026-06-28)
- 2026-08-26 HEAD: default branch still `main`, commit `cddb908aab2542eec9b4480a3738e9ea0ae3a8f5` (“fix(web_server): detect replaced venvs …”, 2026-08-26), 12073 commits ahead of the pinned SHA
- Repository version: `pyproject.toml` `0.20.5`, `requires-python = ">=3.11,<3.14"`
- Installable release: GitHub latest release name `Hermes Agent v0.20.5 (v2026.8.19)`, published 2026-08-21T12:16:39Z. Release tag is not the same object as HEAD.
- Repo stats on 2026-08-26: 236,693 stars, 47,841 forks, ~36,076 open issues. Adoption signals only.

The supplied Korean report remains an intake artifact, not a publishable primary source.
The public article is a rewrite based on the 2026-06-29 source review, updated where 2026-08-26 official sources now contradict those claims.
Editorial note: local published after verification.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| Local user-provided Korean report | user-provided report | Starting point and claim inventory. | excluded from public repo |
| https://github.com/NousResearch/hermes-agent | GitHub repo | Canonical implementation source. Default branch `main`. HEAD [`cddb908aab2542eec9b4480a3738e9ea0ae3a8f5`](https://github.com/NousResearch/hermes-agent/commit/cddb908aab2542eec9b4480a3738e9ea0ae3a8f5). | cloned and inspected |
| [README.md at HEAD](https://github.com/NousResearch/hermes-agent/blob/cddb908aab2542eec9b4480a3738e9ea0ae3a8f5/README.md) | official repo doc | Product promise, install surface, CLI/gateway overview. Marketing “LLM summarization” is not the session_search return path. | inspected |
| [pyproject.toml at HEAD](https://github.com/NousResearch/hermes-agent/blob/cddb908aab2542eec9b4480a3738e9ea0ae3a8f5/pyproject.toml) | package metadata | `hermes-agent` `0.20.5`, Python `>=3.11,<3.14`, exact pin rationale. | inspected |
| [Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture) | official docs | Top-level system structure. Entry points still converge on `AIAgent`. Overview diagram still says “Terminal (6 backends)”; Tool System section lists 7. | inspected |
| [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop) | official docs | AIAgent lifecycle, `chat_completions` / `codex_responses` / `anthropic_messages`. | inspected |
| [Tools & Toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools) | official docs | Tool categories and seven terminal backends, including `vercel_sandbox`. Docker is still a process-lifetime persistent sandbox. | inspected |
| [Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) | official docs | MEMORY.md, USER.md, frozen snapshot, `write_approval`. | inspected |
| [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) | official docs | Skills, /learn, progressive disclosure, `~/.hermes/skills`. | inspected |
| [Scheduled Tasks](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) | official docs | Fresh `AIAgent`, delivery, provider/model fail-closed, `allow_agent_scheduling`. Early warning still says cron cannot recurse; later section and source gate it. | inspected |
| [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) | official docs | Approval modes, YOLO, hardline blocklist, container bypass including `vercel_sandbox`. | inspected |
| GitHub issues #52934, #53632, #34587, #27804, #54329, #466, #47093, #34205, #43904, #42376, #54410 | issue metadata | Real usage and operational edge-case evidence. | re-verified 2026-08-26 via `gh api` |

## Local Source Inspection

- Repository path: `/tmp/hermes-agent-review-20260826`
- Commit: `cddb908aab2542eec9b4480a3738e9ea0ae3a8f5`
- Pinned 2026-06-29 commit: `d0d2cf1c2f7e821e6d06a7a0e838ad66c6e17fd5`
- HEAD summary: fix(web_server): detect replaced venvs with a marker file — inode snapshots miss ext4 inode reuse
- Files inspected:
  - README.md
  - pyproject.toml
  - run_agent.py
  - model_tools.py
  - tools/registry.py
  - toolsets.py
  - hermes_state.py
  - tools/session_search_tool.py
  - tools/skill_manager_tool.py
  - cron/scheduler.py
  - website/docs/developer-guide/architecture.md
  - website/docs/developer-guide/agent-loop.md
  - website/docs/user-guide/features/tools.md
  - website/docs/user-guide/features/memory.md
  - website/docs/user-guide/features/skills.md
  - website/docs/user-guide/features/cron.md
  - website/docs/user-guide/security.md
- Execution policy: static inspection plus syntax validation only. External install scripts, gateway services, agent runtime, and full test suite were not run.
- Syntax verification:
  - `python3 -m py_compile run_agent.py model_tools.py tools/registry.py tools/session_search_tool.py tools/skill_manager_tool.py cron/scheduler.py hermes_state.py toolsets.py`

## Review Notes On The Supplied Report

The supplied report was strong on breadth. It correctly identified the main shape: Hermes is closer to a long-running agent runtime than a terminal chatbot, and its highest-risk surfaces are terminal/file/browser/messaging/cron.

Improvements made for the article:

- The article now leads with the worker-runtime thesis instead of a feature list.
- Verified source facts are separated from second-hand commentary.
- External article and benchmark claims from the supplied report were not used as central evidence because they were not revalidated during this pass.
- GitHub issues are framed as observed operational edge cases, not all as currently open defects, and closed is not treated as fixed.
- Junior explanations now distinguish model, tools, runtime, memory, session search, skills, and cron.
- Security guidance is moved from scattered warnings into a concrete phased adoption path.
- 2026-08-26 claims that current docs/source contradict were narrowed: package version, session-search modes, cron `cronjob` denylist, Vercel Sandbox container bypass.

## Evidence Ledger

| Claim | Result (2026-08-26) | Evidence | Strength | Article Section |
| --- | --- | --- | --- | --- |
| Hermes is a multi-entrypoint runtime converging on AIAgent. | Verified | Architecture doc maps CLI/Gateway/ACP/Batch/API/Python Library into `AIAgent`; `run_agent.py` still defines `class AIAgent`. | High | 실제 구조 |
| Hermes supports three API modes and a provider-independent internal message shape. | Verified | Agent-loop docs still describe `chat_completions`, `codex_responses`, `anthropic_messages`. | High | 먼저 알아야 할 개념 |
| Toolsets act as the first exposure boundary for tool schemas. | Verified | HEAD `toolsets.py` still defines `_HERMES_CORE_TOOLS` and a constrained `_HERMES_WEBHOOK_SAFE_TOOLS` (`web_search`, `web_extract`, `vision_analyze`, `clarify`). | High | 실제 구조 |
| Package version is 0.17.0. | **Superseded** | HEAD `pyproject.toml` is `0.20.5`. Python bound still `>=3.11,<3.14`. Exact-pin supply-chain comment remains. | High | 실제 구조 |
| Memory consists of bounded `MEMORY.md` and `USER.md` injected as frozen snapshots. | Verified | Persistent Memory docs: 2,200 / 1,375 char limits, `~/.hermes/memories/`, frozen snapshot, disk writes do not refresh the live prompt. | High | 핵심 기능 |
| Session search uses SQLite/FTS5 and returns actual DB messages, not LLM summaries. | Verified | HEAD `tools/session_search_tool.py` docstring: four shapes (discovery, scroll, read, browse), “No LLM calls anywhere”. README “LLM summarization” is marketing, not this tool’s return path. | High | 핵심 기능 |
| Skills are procedural memory and can be agent-managed. | Verified | Skills docs and `tools/skill_manager_tool.py` still describe `~/.hermes/skills`, create/edit/patch/delete, and `/learn`. | High | 핵심 기능 |
| Cron creates fresh agent sessions and supports delivery targets. | Verified | Cron docs: gateway tick, fresh `AIAgent`, skill injection, delivery, no-agent mode. | High | 핵심 기능 |
| Cron-spawned agents always disable `cronjob`, `messaging`, and `clarify`. | **Narrowed** | HEAD `_resolve_cron_disabled_toolsets`: `messaging` and `clarify` always; `cronjob` is default-denied and dropped when `cron.allow_agent_scheduling` is true. Cron docs have a later matching section; an earlier warning still says recursion is impossible. | High | 좋은 점 |
| Hermes has meaningful hardening, not only feature breadth. | Verified | `model_tools.py` async bridge and MCP discovery comments; `tools/registry.py` TTL 30s / grace 60s last-good; `hermes_state.py` WAL fallback (now also ZFS / WAL-reset); cron provider/model fail-closed docs. | High | 좋은 점 |
| Approval/off/YOLO/container behavior is a major risk boundary. | Verified | Security docs: `manual` / `smart` / `off`, YOLO, hardline blocklist. Container bypass now includes `vercel_sandbox` besides docker/singularity/modal/daytona. Docker remains a persistent sandbox. | High | 조심해야 할 점 |
| Messaging and cron are real operational surfaces with edge cases. | Verified as surfaces, not as a live-bug list | 2026-08-26: open #52934, #27804, #54329, #466, #47093, #42376. Closed completed: #53632, #54410. Closed not_planned: #34587, #34205, #43904. | Medium | 핵심 기능 |

## Issue status (2026-08-26)

| Issue | Title | State | Note |
| --- | --- | --- | --- |
| [#52934](https://github.com/NousResearch/hermes-agent/issues/52934) | Claude models include thinking blocks in cron job output | open | Not a “Telegram daily briefing” ticket. |
| [#53632](https://github.com/NousResearch/hermes-agent/issues/53632) | Cronjob break rich message table in telegram | closed completed | Closed 2026-06-28. |
| [#34587](https://github.com/NousResearch/hermes-agent/issues/34587) | Slack full Block Kit support | closed not_planned | Umbrella; closed 2026-05-29. Gap not treated as shipped. |
| [#27804](https://github.com/NousResearch/hermes-agent/issues/27804) | Email gateway subject isolation and notification volume | open | |
| [#54329](https://github.com/NousResearch/hermes-agent/issues/54329) | `deliver=origin` dropped when origin is gone | open | |
| [#466](https://github.com/NousResearch/hermes-agent/issues/466) | File transfer between sandboxed environments | open | |
| [#47093](https://github.com/NousResearch/hermes-agent/issues/47093) | Telegram photos dropped when `get_file()` times out | open | |
| [#34205](https://github.com/NousResearch/hermes-agent/issues/34205) | Provider switch leaves stale `encrypted_content` | closed not_planned | Closed 2026-07-13. |
| [#43904](https://github.com/NousResearch/hermes-agent/issues/43904) | Desktop remote backend ready/error loop | closed not_planned | Closed 2026-07-14. |
| [#42376](https://github.com/NousResearch/hermes-agent/issues/42376) | macOS launchd plist `LimitLoadToSessionType` | open | |
| [#54410](https://github.com/NousResearch/hermes-agent/issues/54410) | QQAdapter unexpected `is_reconnect` | closed completed | Closed 2026-06-28. |

## Junior Explanation Notes

- Explain Hermes through three nouns: model, tools, runtime.
- Memory is not the same as session search. Memory is always-on compact context; session search is on-demand recall.
- Skills are not just prompts. They are procedural documents the agent can load and modify.
- Cron is not just `bash -c` on a schedule. Agent-mode cron starts a fresh agent session and may use model/tool permissions.
- Toolset is not a full security sandbox. It narrows model-visible tools, while OS/backend/gateway policy must provide the stronger boundary.
- “Self-improving” means improving stored context and procedure, not fine-tuning model weights.

## Blind Spots

- Hermes agent runtime, installer, gateway, and the upstream test suite were not executed on 2026-08-26. Hardening claims rest on source comments and docs.
- Architecture overview ASCII still says “Terminal (6 backends)” and the directory tree omits `vercel_sandbox`, while the Tool System section and tools.md list seven backends. Public article follows tools.md / security.md, not the stale diagram count.
- Cron docs still contain an early “cannot recursively create more cron jobs” warning that is broader than HEAD source and the later `allow_agent_scheduling` section.
- README “FTS5 session search with LLM summarization” can be misread as session_search returning summaries. The tool module denies that path.
- Star/fork/issue counts are adoption snapshots only.
- Honcho memory provider, Tool Gateway, and extra messaging platforms were not promoted into the public thesis.

## Editorial Decisions

- Keep published. The worker-runtime thesis is not inverted.
- Preserve `createdAt: "2026-06-29"`. Set `updatedAt: "2026-08-26"` because the article changed.
- Title and description unchanged.
- Narrow version, session-search modes, cron denylist, and Vercel Sandbox claims rather than polish over them.
- Do not call closed issues fixed unless `state_reason` is completed and the article needs that fact.
- Abbreviate inline SHAs (`cddb908`, `d0d2cf1`) so the colophon does not overflow at 390. Full hashes stay in commit URLs and this packet.
- Convert the file map and staged-adoption 3-column tables to lists. Long unbreakable `code` cells overflowed `documentElement.scrollWidth` at 390. The six-step adoption path is unchanged.
- Korean polish is local (check-date layering, dated issue status, cron/version/backend updates). Keep first-person close.

## Draft Outline

1. Thesis and verification scope
2. 먼저 알아야 할 개념
3. 실제 구조
4. 핵심 기능
5. 좋은 점
6. 조심해야 할 점
7. 언제 쓰면 좋은가
8. 주니어 개발자가 배울 점
9. 내 결론
10. 확인한 자료

## Quality Gate Notes

- The article contains every required `source-grounded` heading.
- The top summary table gives fast orientation before deep sections. Advantage / risk / adoption criteria remain.
- Claims about issue status are not overclaimed; closed ≠ fixed.
- The article states the two-layer check (2026-06-29 pin, 2026-08-26 HEAD) and that the agent runtime was not executed.
- The article intentionally avoids relying on unverified third-party article and benchmark claims from the supplied report.
- Catalog packet `updated` date is 2026-08-26. `docs/INDEX.md` has no date that this change would make wrong.
