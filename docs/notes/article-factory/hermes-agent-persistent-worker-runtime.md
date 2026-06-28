# Hermes Agent Persistent Worker Runtime Research Packet

Date: 2026-06-29
Status: completed
Target article: src/content/articles/hermes-agent-persistent-worker-runtime.mdx

## Intake

- User source: local user-provided Korean report.
- Raw capture: excluded from the public repository.
- Canonical repo: https://github.com/NousResearch/hermes-agent
- Default angle: Review the supplied Korean deep analysis, verify the actual source, improve the structure, and publish a junior-friendly source-grounded article.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| Local user-provided Korean report | user-provided report | Starting point and claim inventory. | excluded from public repo |
| https://github.com/NousResearch/hermes-agent | GitHub repo | Canonical implementation source. | cloned and inspected |
| README.md | official repo doc | Product promise, install surface, CLI/gateway overview. | inspected |
| website/docs/developer-guide/architecture.md | official docs | Top-level system structure and subsystem map. | inspected |
| website/docs/developer-guide/agent-loop.md | official docs | AIAgent lifecycle, provider modes, tool execution, compression. | inspected |
| website/docs/user-guide/features/tools.md | official docs | Tool categories and terminal backend behavior. | inspected |
| website/docs/user-guide/features/memory.md | official docs | MEMORY.md, USER.md, session search behavior. | inspected |
| website/docs/user-guide/features/skills.md | official docs | Skills, /learn, progressive disclosure. | inspected |
| website/docs/user-guide/features/cron.md | official docs | Scheduled agent sessions, delivery, provider/model guard. | inspected |
| website/docs/user-guide/security.md | official docs | Approval modes, gateway auth, container caveats. | inspected |
| GitHub issues #52934, #53632, #34587, #27804, #54329, #466, #47093, #34205, #43904, #42376, #54410 | issue metadata | Real usage and operational edge-case evidence. | verified with gh issue view |

## Local Source Inspection

- Repository path: /tmp/hermes-agent-review
- Commit: d0d2cf1c2f7e821e6d06a7a0e838ad66c6e17fd5
- HEAD summary: Merge pull request #54492 from NousResearch/bb/windows-hide-checkpoint-skills-git
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
- Execution policy: static inspection plus syntax validation only. External install scripts, gateway services, and full test suite were not run.
- Syntax verification:
  - `python3 -m py_compile run_agent.py model_tools.py tools/registry.py tools/session_search_tool.py tools/skill_manager_tool.py cron/scheduler.py hermes_state.py toolsets.py`

## Review Notes On The Supplied Report

The supplied report was strong on breadth. It correctly identified the main shape: Hermes is closer to a long-running agent runtime than a terminal chatbot, and its highest-risk surfaces are terminal/file/browser/messaging/cron.

Improvements made for the article:

- The article now leads with the worker-runtime thesis instead of a feature list.
- Verified source facts are separated from second-hand commentary.
- External article and benchmark claims from the supplied report were not used as central evidence because they were not revalidated during this pass.
- GitHub issues are framed as observed operational edge cases, not all as currently open defects.
- Junior explanations now distinguish model, tools, runtime, memory, session search, skills, and cron.
- Security guidance is moved from scattered warnings into a concrete phased adoption path.

## Evidence Ledger

| Claim | Evidence | Strength | Article Section |
| --- | --- | --- | --- |
| Hermes is a multi-entrypoint runtime converging on AIAgent. | Architecture doc maps CLI/Gateway/ACP/Batch/API/Python Library into `AIAgent`; source tree contains the corresponding modules. | High | 실제 구조 |
| Hermes supports three API modes and a provider-independent internal message shape. | `website/docs/developer-guide/agent-loop.md` describes `chat_completions`, `codex_responses`, `anthropic_messages`. | High | 먼저 알아야 할 개념 |
| Toolsets act as the first exposure boundary for tool schemas. | `toolsets.py` defines core tools and a constrained webhook-safe set; tools docs describe per-platform toolsets. | High | 실제 구조 |
| Memory consists of bounded `MEMORY.md` and `USER.md` injected as frozen snapshots. | Persistent Memory docs lines 13-20 and 32-54. | High | 핵심 기능 |
| Session search uses SQLite/FTS5 and returns actual DB messages, not LLM summaries. | `tools/session_search_tool.py` module docstring and memory docs session search section. | High | 핵심 기능 |
| Skills are procedural memory and can be agent-managed. | Skills docs and `tools/skill_manager_tool.py` describe `~/.hermes/skills`, create/edit/patch/delete actions, and progressive disclosure. | High | 핵심 기능 |
| Cron creates fresh agent sessions and supports delivery targets. | Cron docs describe gateway tick, fresh `AIAgent`, skill injection, delivery; `cron/scheduler.py` implements protected disabled toolsets. | High | 핵심 기능 |
| Hermes has meaningful hardening, not only feature breadth. | `model_tools.py` async bridge and MCP discovery comments; `tools/registry.py` check_fn TTL and grace; `hermes_state.py` WAL fallback; cron provider/model fail-closed docs. | High | 좋은 점 |
| Approval/off/YOLO/container behavior is a major risk boundary. | Security docs approval modes, YOLO warning, hardline blocklist, container bypass note. | High | 조심해야 할 점 |
| Messaging and cron are real operational surfaces with edge cases. | Verified GitHub issues #52934, #53632, #34587, #27804, #54329, #466, #47093, #34205, #43904, #42376, #54410 via `gh issue view`. | Medium | 핵심 기능 |

## Junior Explanation Notes

- Explain Hermes through three nouns: model, tools, runtime.
- Memory is not the same as session search. Memory is always-on compact context; session search is on-demand recall.
- Skills are not just prompts. They are procedural documents the agent can load and modify.
- Cron is not just `bash -c` on a schedule. Agent-mode cron starts a fresh agent session and may use model/tool permissions.
- Toolset is not a full security sandbox. It narrows model-visible tools, while OS/backend/gateway policy must provide the stronger boundary.
- “Self-improving” means improving stored context and procedure, not fine-tuning model weights.

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
- The top summary table gives fast orientation before deep sections.
- Claims about issue status are not overclaimed; some verified issues are closed.
- The article states the exact local clone commit and the verification command.
- The article intentionally avoids relying on unverified third-party article and benchmark claims from the supplied report.
