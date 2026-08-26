# Ponytail Agent Minimalism Analysis Research Packet

Date: 2026-08-26
Status: published
Target article: src/content/articles/ponytail-agent-minimalism-analysis.mdx

## Publication target

- Public article: `src/content/articles/ponytail-agent-minimalism-analysis.mdx`
- Canonical repo: https://github.com/DietrichGebert/ponytail
- Independent verification: 2026-06-25 (local clone at `a945778b4a73b0b78c3c781a594b62cd3a324637`, release/npm `v4.8.3`)
- 2026-08-26 re-check: official GitHub, releases, npm, docs, and source only. Ponytail was not executed. Install/test scripts and `node --check` were not re-run.
- Historical pin: `DietrichGebert/ponytail` `a945778b4a73b0b78c3c781a594b62cd3a324637` (2026-06-24 15:37:06 +0200), GitHub latest / npm `v4.8.3`
- 2026-08-26 HEAD: default branch still `main`, commit `2ed6c52c9d7e5e56942508591085fd45dea277d3` (“feat: add Grok Build native skills adapter (revive #561) (#661)”, 2026-08-07T21:44:01Z), 3 commits ahead of `v4.9.0`
- Latest GitHub release: `v4.9.0: 53 commits of doing less`, published `2026-08-07T21:15:11Z`, tag SHA `0a4dd63ad4541f4f655c4108a295916f3c1d8fda`
- npm dist-tag `latest`: `@dietrichgebert/ponytail@4.9.0` (`gitHead` `0a4dd63ad4541f4f655c4108a295916f3c1d8fda`, `time['4.9.0']` `2026-08-07T21:14:40.831Z`)
- Repo created `2026-06-12T00:52:37Z`. Stats on 2026-08-26: 112,002 stars, 6,147 forks, `open_issues_count` 171 (GitHub field includes PRs; adoption only). 210 commits on `main` (Link `page=210`).
- License: MIT

Editorial note: local published after verification.

## Intake

- Input: https://github.com/DietrichGebert/ponytail
- Input type: GitHub repository
- Editorial angle: Explain Ponytail as an agent behavior distribution that reduces over-engineering by injecting a "minimal correct solution" ladder across many AI coding hosts.
- Audience: Developer readers, including juniors who may not know plugin hooks, skill systems, or agent adapters.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| https://github.com/DietrichGebert/ponytail | GitHub source | Canonical repository, README, adapters, skills, hooks, tests, examples, benchmarks. Default `main`. HEAD [`2ed6c52`](https://github.com/DietrichGebert/ponytail/commit/2ed6c52c9d7e5e56942508591085fd45dea277d3). | checked 2026-08-26 |
| https://github.com/DietrichGebert/ponytail/releases/tag/v4.9.0 | GitHub release | Latest release on 2026-08-26; tag SHA `0a4dd63`; HEAD is 3 commits ahead. | checked 2026-08-26 |
| https://www.npmjs.com/package/@dietrichgebert/ponytail | npm package | Published package identity; dist-tag `latest` `4.9.0`. | checked 2026-08-26 with `npm view` |
| https://github.com/DietrichGebert/ponytail/blob/main/benchmarks/results/2026-06-18-agentic.md | Benchmark report | Repo's own agentic benchmark methodology and limitations. Headline numbers unchanged. | checked 2026-08-26; not re-run |
| https://github.com/DietrichGebert/ponytail/blob/main/benchmarks/README.md | Benchmark docs | Independent benchmarks section: third-party plugin-installed runs, corroboration not official figures. | checked 2026-08-26; linked pages not opened |
| https://github.com/DietrichGebert/ponytail/blob/main/docs/agent-portability.md | Internal docs | Adapter map for Claude Code, Codex, OpenCode, Pi, Gemini, Grok, Hermes, Qoder, Copilot CLI, and instruction-only hosts. | checked 2026-08-26 |
| https://github.com/DietrichGebert/ponytail/blob/main/docs/platform-native.md | Internal docs | Platform-native replacement philosophy; Swift/SwiftUI section still present. | checked 2026-08-26 |

## Local Source Inspection

### 2026-08-26 re-check (this pass)

- Method: official GitHub API (`gh`), raw docs, and source files. No local clone. Ponytail was not executed.
- Default branch: `main`
- Inspected HEAD: `2ed6c52c9d7e5e56942508591085fd45dea277d3`
- Commit time: `2026-08-07T21:44:01Z`
- Compare `v4.9.0...main`: ahead 3, behind 0. The three commits are `#601` (drop `commandWindows`), `#579` (VS Code Copilot via `CLAUDE_PLUGIN_ROOT`), `#661` (Grok Build native skills adapter).
- Package version at HEAD: `4.9.0` (`package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`)
- Files inspected:
  - `README.md`, `package.json`, `plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`
  - `AGENTS.md`, `skills/ponytail/SKILL.md`, `commands/ponytail.toml`
  - `hooks/claude-codex-hooks.json`, `hooks/ponytail-activate.js`, `hooks/ponytail-mode-tracker.js`, `hooks/ponytail-subagent.js`
  - `docs/agent-portability.md`, `docs/platform-native.md`
  - `benchmarks/README.md`, `benchmarks/results/2026-06-18-agentic.md`
  - `.github/workflows/test.yml`; test file names under `tests/`; skill names under `skills/`; hook names under `hooks/`
- Execution policy:
  - External repository install and test scripts were not run.
  - June `node --check` was not repeated.

### 2026-06-25 historical pin

- Repository path: `/tmp/ponytail-review-dtwXxR`
- Commit: `a945778b4a73b0b78c3c781a594b62cd3a324637`
- Commit date: 2026-06-24 15:37:06 +0200
- GitHub metadata checked on 2026-06-25:
  - default branch: `main`
  - license: MIT
  - stars: 55,045
  - latest GitHub release: `v4.8.3`, published 2026-06-24
  - npm latest: `4.8.3`
- Low-risk syntax checks were run then with `node --check` on key JavaScript entry points; no syntax errors were reported. That check is historical, not claimed for HEAD.

## Evidence Ledger

| Claim | Evidence | Strength | Article Section |
| --- | --- | --- | --- |
| Ponytail is an agent behavior distribution, not a runtime library for application code. | HEAD `package.json` exports an OpenCode plugin; `files` package `AGENTS.md`, `hooks/`, `skills/`, `.opencode/`, `.qoder/`, `pi-extension/`, `scripts/uninstall.js`; adapter docs map many hosts. | High | intro, 실제 구조 |
| The core concept is a seven-rung ladder: skip, reuse local code, stdlib, native platform, installed dependency, one-liner, then minimum custom code. | `README.md`, `AGENTS.md`, `skills/ponytail/SKILL.md`. Unchanged at HEAD. | High | 먼저 알아야 할 개념 |
| The rule set explicitly says reading, trust-boundary validation, data-loss handling, security, accessibility, hardware calibration, and user-explicit requirements must not be simplified away. | `AGENTS.md`, `skills/ponytail/SKILL.md`, benchmark safety writeup. | High | 핵심 기능, 조심해야 할 점 |
| Current published version is `v4.9.0`; HEAD is 3 commits ahead. | GitHub latest release `v4.9.0` tag `0a4dd63`; npm `latest` `4.9.0` same `gitHead`; compare `v4.9.0...main` ahead 3. | High | intro, 확인한 자료 |
| Claude/Codex integration uses lifecycle hooks to activate mode, track mode changes, persist `/ponytail default`, and inject the ruleset into subagents. | `hooks/claude-codex-hooks.json`, `ponytail-activate.js`, `ponytail-mode-tracker.js`, `ponytail-subagent.js`. | High | 실제 구조 |
| Bare `/ponytail` reports the active level; `/ponytail default <mode>` writes config. | `ponytail-mode-tracker.js` (`isReportOnly` on empty arg; `writeDefaultMode` on `default`); README Commands table; v4.9.0 notes. `commands/ponytail.toml` prompt still says “If no level specified, use full” — hook/README are the public claim. | High for hook/README; Medium for Claude skill prompt file | 실제 구조, 핵심 기능 |
| Subagent injection is default-all; `PONYTAIL_SUBAGENT_MATCHER` is opt-in and fail-open. | `hooks/ponytail-subagent.js`, README. | High | 실제 구조 |
| OpenCode and Pi integrations reuse the same instruction builder but inject through their host-native extension surfaces. | `.opencode/plugins/ponytail.mjs` (not re-read in full; tests still cover transform/persist), `pi-extension/index.js` still has `before_agent_start` / `systemPrompt`. | High | 실제 구조 |
| Grok plugin exists but does not use lifecycle hooks. | README Grok Build section; `docs/agent-portability.md` Grok row. | High | 실제 구조, 조심해야 할 점 |
| Codex install path is marketplace add then `codex plugin add ponytail@ponytail`, then `/hooks` trust. | README Codex section at HEAD. June article’s `/plugins` install wording is stale. | High | 핵심 기능 |
| The published benchmark claims 54% average LOC reduction across 12 feature tasks, with 100% safety in the adversarial tier for Ponytail. | `benchmarks/results/2026-06-18-agentic.md` still present; README still quotes it. Article treats this as project-provided evidence with limitations, not independent proof. Not re-run. | Medium | 벤치마크를 어떻게 읽어야 하나 |
| Repo now links third-party plugin-installed runs as corroboration, not official figures. | `benchmarks/README.md` Independent benchmarks table (KuldeepB19 2026-06-24; RicardoCostaGit 2026-06-16). Linked pages not opened this pass. | Medium | 벤치마크를 어떻게 읽어야 하나 |
| The repo has self-tests for hook compatibility, command parity, OpenCode behavior, host plugins, and uninstall cleanup. CI still runs rule-copy, version, and `npm test`. | `tests/*.test.js` names at HEAD; `.github/workflows/test.yml`. Tests not executed this pass. | High for file presence; not a runtime pass | 좋은 점 |
| Adoption risks include hook trust, prompt over-correction, stale copied rule files, host API churn, and benchmark transferability. | Source inspection plus benchmark limitations and adapter breadth. | High | 조심해야 할 점 |

## Junior Explanation Notes

- Explain "minimalism" as smallest correct implementation, not clever code golf.
- Explain lifecycle hooks as "small scripts that the host runs at session start or prompt submit."
- Explain agent adapters as host-specific packaging around one shared instruction set.
- Show why `<input type="date">`, `URLSearchParams`, `structuredClone`, and `Intl.NumberFormat` are representative of the platform-native mindset.
- Emphasize that the lesson transfers even without installing Ponytail: read first, reuse first, use platform features, keep checks for non-trivial logic.

## Blind Spots

- Ponytail was not executed on 2026-08-26. Runtime of hooks, `/ponytail default`, subagent matcher, Grok/Hermes/Qoder/Copilot CLI plugins, and uninstall is inferred from official docs/source.
- June `node --check` and any local clone tests are historical (`a945778`), not claimed for `2ed6c52` / `4.9.0`.
- `commands/ponytail.toml` still tells the model “If no level specified, use full” while the UserPromptSubmit hook and README report the current level. Public article follows hook/README.
- Independent benchmarks linked pages (KuldeepB19, RicardoCostaGit) were not opened. Their numbers are not treated as verified.
- Headline 54/22/20/27/100 figures were not reproduced. They remain the repo’s 2026-06-18 Haiku 4.5 agentic writeup.
- Star/fork/`open_issues_count` are adoption snapshots only and are not in the public article.
- README “20 agents” badge is a dated marketing count; public article uses the portability doc instead of treating 20 as a contract.
- Plugin-tier hosts added after the June pin were not smoke-tested.

## Editorial Decisions

- Keep published. The behavior-distribution thesis is not inverted.
- Preserve `createdAt: "2026-06-25"`. Set `updatedAt: "2026-08-26"` because the article changed.
- Title unchanged. Description now points at official repo/npm/docs instead of “직접 클론해”.
- Keep extra heading `## 벤치마크를 어떻게 읽어야 하나`. It does not duplicate a required heading.
- Layer June pin (`a945778` / `v4.8.3`) and August HEAD (`2ed6c52` / `v4.9.0`, 3 commits ahead) instead of pretending the June clone is current.
- Update Codex install to `codex plugin add ponytail@ponytail`; keep `/hooks` trust.
- Name new plugin hosts and Grok’s no-lifecycle-hook constraint without dumping the full 20-row table into the intro.
- Treat Independent benchmarks as the repo’s own corroboration list, not an audit this pass ran.
- Abbreviate inline SHAs (`2ed6c52`, `0a4dd63`, `a945778`). Full hashes stay in list-item commit URLs and this packet so the colophon does not overflow at 390.
- Korean polish is local (two-layer check date, version/adapter/command updates). Keep first-person close.
- Catalog packet `updated` date is 2026-08-26. `docs/INDEX.md` has no date that this change would make wrong.

## Draft Outline

1. Thesis: Ponytail installs judgment about not building things.
2. 먼저 알아야 할 개념
3. 실제 구조
4. 핵심 기능
5. 벤치마크를 어떻게 읽어야 하나
6. 좋은 점
7. 조심해야 할 점
8. 언제 쓰면 좋은가
9. 주니어 개발자가 배울 점
10. 내 결론
11. 확인한 자료

## Quality Gate Notes

- The article includes a clear thesis before the first heading.
- It contains every required `source-grounded` heading plus `## 벤치마크를 어떻게 읽어야 하나`.
- It names the June pin, August HEAD, latest release, npm version, and that Ponytail was not executed.
- It separates Ponytail's own benchmark claims from independently verified source structure, and does not treat the Independent benchmarks section as this pass’s audit.
- It includes adoption risks, not only strengths.
- It includes junior-reader explanations and practical usage guidance.
- It is tagged `source-grounded` so `npm run article:quality` validates it.
- Status stays `"published"`. Do not unpublish for evidence doubts alone.
- Catalog packet `updated` date is 2026-08-26.
