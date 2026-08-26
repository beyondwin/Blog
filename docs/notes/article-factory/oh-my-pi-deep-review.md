# oh-my-pi Deep Review Research Packet

Date: 2026-08-26
Status: published
Target article: src/content/articles/oh-my-pi-deep-review.mdx

Editorial note: local published after verification.

## Intake

- Input: `/Users/user/Downloads/oh-my-pi-deep-review-ko.html`
- Input type: standalone Korean technical/security/adoption report
- Upstream: https://github.com/can1357/oh-my-pi
- Editorial request: verify the report rather than republish it, inspect blind spots not stated directly in documentation, and turn the result into a natural Korean technical-blog article.
- Audience: experienced individual developers, engineering leads considering a pilot, and junior developers learning how to evaluate an agent harness as a privileged runtime.

The supplied HTML was treated as an intake hypothesis. Its custom CSS, navigation, filters, theme switcher, print behavior, repeated cards, and score presentation were not carried into the article.

## Upstream Snapshot

### 2026-08-26 re-check (this pass)

- Method: official GitHub API, raw docs, and source files. No local clone, no `omp` execution, no TypeScript/Biome/test re-run.
- Default branch: `main`
- Inspected HEAD: `b4e8e856ad40294167679a3f88417c07429fe59b`
- Commit time: `2026-08-26T08:02:57Z`
- Commit subject: `chore: bump version to 18.0.6`
- GitHub latest release: `v18.0.6`, published `2026-08-26T08:23:43Z` (tag points at the same SHA)
- Package version at HEAD: `18.0.6` (`packages/coding-agent/package.json`, workspace catalog)
- Commit count shown on the repository page: `19,866`
- GitHub repository metadata observed on 2026-08-26:
  - stars: `27,611`
  - forks: `2,721`
  - repository size field: `566,553` KiB
  - license: MIT
  - `open_issues_count`: `1,797` (GitHub's repository field includes pull requests and must not be presented as issue count alone)
- Bun floor: still `>=1.3.14` (`packages/coding-agent/package.json` `engines.bun`)
- Rust pin: `nightly-2026-08-08` (`rust-toolchain.toml`; was `nightly-2026-04-29` on 2026-07-12)

### 2026-07-12 historical pin

- Local clone: `/tmp/oh-my-pi-review-nnY3gw/repo`
- Inspected commit: `20c0a2e4101d8507e7cbbaf547baa4f9f2340b73`
- Commit time: `2026-07-12T03:13:15+02:00`
- Commit subject: `test(coding-agent): fixed storage tests for schema v6 and slow CI disks`
- Commit count at HEAD: `12,997`
- Package version at HEAD: `16.4.6`
- Nearest/current tag in the clone: `v16.4.6`
- Latest published GitHub release returned by the API on 2026-07-12: `v16.4.5`, published `2026-07-11T18:10:52Z`
- GitHub repository metadata observed on 2026-07-12:
  - stars: `17,315`
  - forks: `1,562`
  - repository size field: `391,150` KiB
  - license: MIT
  - `open_issues_count`: `747`

The supplied report described commit `c6b83c1d…` and release `v16.4.4`. Those values were already stale on 2026-07-12. The 2026-08-26 public article uses HEAD `b4e8e856` / `v18.0.6` and dates the July test evidence separately.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| https://github.com/can1357/oh-my-pi | repository | Canonical source, history, package layout, metadata | checked 2026-08-26 (API + page) |
| `README.md` | official docs | Product scope, install methods, provider/tool claims | checked 2026-08-26 |
| `package.json` | manifest | Bun floor, workspaces, build/test/release commands | checked 2026-08-26 |
| `packages/coding-agent/package.json` | manifest | CLI package version `18.0.6`, dependencies, engine constraint | checked 2026-08-26 |
| `packages/coding-agent/DEVELOPMENT.md` | official docs | Runtime entry points, session flow, RPC shape, package map | checked 2026-08-26 |
| `AGENTS.md` | project rules | Test, logging, release, and contributor engineering conventions | listed; not re-executed |
| `rust-toolchain.toml` | toolchain pin | Native addon floor moved to `nightly-2026-08-08` | checked 2026-08-26 |
| `.github/SECURITY.md` | policy | Latest-only security support and best-effort response | checked 2026-08-26 |
| `docs/approval-mode.md` | official docs | Approval tiers, default yolo, per-tool policy, subagent boundary, eval vs bash.patterns, ACP gate | checked against `approval.ts` / schema |
| `packages/coding-agent/src/tools/approval.ts` | source | Actual approval resolution order and yolo behavior | checked 2026-08-26 |
| `packages/coding-agent/src/config/settings-schema.ts` | source | Defaults for approvals, tasks, secrets, GC, and other controls | checked 2026-08-26 |
| `packages/coding-agent/src/task/executor.ts` | source | Headless subagent settings, request/runtime controls | checked 2026-08-26 |
| `docs/extension-loading.md` | official docs | Extension discovery and dynamic module execution | checked 2026-08-26 |
| `packages/coding-agent/src/extensibility/extensions/loader.ts` | source | Bun import/factory execution; not sandboxed | checked 2026-08-26 |
| `docs/mcp-config.md` | official docs | stdio/HTTP servers, OAuth, project/user config | checked 2026-08-26 |
| `docs/secrets.md` | official docs | Opt-in obfuscation and collection rules | checked 2026-08-26 |
| `packages/coding-agent/src/secrets/obfuscator.ts` | source | Implementation still present; 7월 focused tests not re-run | checked 2026-08-26 (file exists; coverage from July tests + current docs) |
| `docs/session.md` | official docs | JSONL session model, blobs, branching, resume | checked 2026-08-26 |
| `packages/coding-agent/src/session/session-storage.ts` | source | File creation, append, atomic rewrite; no explicit chmod | checked 2026-08-26 |
| `packages/coding-agent/src/session/agent-storage.ts` | source | SQLite storage and explicit `0700`/`0600` permission hardening | checked 2026-08-26 |
| `packages/coding-agent/src/cli/gc-cli.ts` | source | Blob cleanup and cold session archive behavior | checked 2026-08-26 |
| `docs/collab.md` | official docs | E2EE relay, full/view capability links, guest transcript replica | checked 2026-08-26 |
| `docs/tools/browser.md` | official docs | Headless, connected, spawned, relay, cmux modes | checked against registry/attach source |
| `packages/coding-agent/src/tools/browser/registry.ts` | source | CDP reuse, same-path process termination, spawn/attach | checked 2026-08-26 |
| `docs/auth-broker-gateway.md` | official docs | Credential broker and gateway boundary | listed; not re-executed |
| `scripts/install.sh` | installer | Default source/binary install path; smoke `--version`; no digest | checked 2026-08-26 |
| Issues #5192, #4820, #5194, #5189, #5181 | issue reports | Live state re-checked with GitHub API | checked 2026-08-26 |

### Live issue state on 2026-08-26

| Issue | State | Closed | Reading |
| --- | --- | --- | --- |
| [#5192](https://github.com/can1357/oh-my-pi/issues/5192) | closed | 2026-07-11T17:25:34Z | Idle CPU report; already closed in the v16.4.5 window. Not an unresolved defect claim. |
| [#4820](https://github.com/can1357/oh-my-pi/issues/4820) | closed | 2026-07-14T17:09:28Z | Long resumed TUI JSC/WebKit footprint. Was **open** on 2026-07-12. Closed is not a local re-verification that the footprint is gone. |
| [#5194](https://github.com/can1357/oh-my-pi/issues/5194) | closed | 2026-07-17T03:52:25Z | Malformed RPC stdin terminating the process. Was **open** on 2026-07-12. Closed is not a local re-run of RPC mode. |
| [#5189](https://github.com/can1357/oh-my-pi/issues/5189) | closed | 2026-07-11T17:25:34Z | Incomplete plugin upgrade/startup failure; already closed in the v16.4.5 window. |
| [#5181](https://github.com/can1357/oh-my-pi/issues/5181) | closed | 2026-07-14T17:09:28Z | Advisor hallucination / nonexistent MCP-tool attempt. Was **open** on 2026-07-12. Still a model-orchestration report, not proof of a deterministic code bug, and not proof it cannot recur. |

## Verification Commands

### 2026-08-26 (this pass)

Official GitHub API and raw files only. Oh-my-pi was not executed.

```bash
# API / raw (no clone, no bun, no omp)
# GET https://api.github.com/repos/can1357/oh-my-pi
# GET https://api.github.com/repos/can1357/oh-my-pi/commits/main
# GET https://api.github.com/repos/can1357/oh-my-pi/releases/latest
# GET https://api.github.com/repos/can1357/oh-my-pi/issues/{number}
# GET https://raw.githubusercontent.com/can1357/oh-my-pi/main/{path}
```

Result: completed. Metadata, yolo/schema defaults, and issue states above are based on these fetches.

### 2026-07-12 (historical; not re-run)

```bash
git clone --filter=blob:none https://github.com/can1357/oh-my-pi.git /tmp/oh-my-pi-review-nnY3gw/repo
git rev-parse HEAD
git log -1 --format='%H%n%cI%n%s'
git describe --tags --abbrev=0
git rev-list --count HEAD
gh api repos/can1357/oh-my-pi
gh api repos/can1357/oh-my-pi/releases/latest
gh api repos/can1357/oh-my-pi/issues/{number}
```

Required runtime then: host Bun `1.3.10` was below `>=1.3.14`; Bun `1.3.14` was downloaded and digest-checked. `bun install --frozen-lockfile` and `bun run check:ts` passed (Biome `3,393` files). Focused tests (secrets, collab crypto, brew formula, Windows targets, release notes): `60 pass, 0 fail`. `bun run build:native` did not complete because Homebrew stable Rust `1.95.0` did not match `nightly-2026-04-29`.

## Evidence Ledger

| Claim | Result (2026-08-26) | Evidence | Strength | Article use |
| --- | --- | --- | --- | --- |
| OMP is an agent harness/workbench, not a model. | Unchanged | README, DEVELOPMENT, CLI/TUI/RPC/ACP/SDK entry paths | High | thesis and architecture |
| LSP, DAP, structural edits, shell, browser, MCP, sessions, subagents, and collaboration are genuinely integrated. | Unchanged | Source directories and package manifests, not README alone | High | strengths |
| `tools.approvalMode` defaults to `yolo`. | **Still true** | `settings-schema.ts` default `"yolo"`; `approval-mode.md` table `yolo (default)` | High | primary risk |
| Safety override reasons do not force a prompt in yolo. | **Still true** | `resolveApproval()` yolo branch ignores `override`; docs: “The `override` flag alone does not force a prompt in yolo.” | High | primary risk |
| Subagents use headless yolo and treat parent task approval as the boundary. | **Still true** | `createSubagentSettings()` sets `"tools.approvalMode": "yolo"`; `approval-mode.md` Subagents section | High | delegated blast radius |
| Schema default yolo does not mean ACP is unattended by default. | **Narrowed** | `approval-mode.md`: default-config ACP sessions keep the client permission gate; explicit yolo / `--yolo` / `--auto-approve` skips it | High | approval claim qualifier |
| `eval` can bypass `bash.patterns` under yolo. | **Added from current docs** | `approval-mode.md`: eval is exec; a bash.patterns deny does not apply to the same command via eval | High | approval gap |
| Extensions execute imported Bun/Node modules in-process. | **Still true** | extension-loading.md: “Extensions are **not sandboxed**”; loader still dynamic-imports factories | High | extension trust boundary |
| MCP tools are treated as write-tier by default. | **Still true** | `approval-mode.md`: “MCP server tools declare `write`.” | High | semantic approval gap |
| Secret obfuscation is disabled by default and has explicit coverage limits. | **Still true** | schema `secrets.enabled` default `false`; secrets.md 8-character obfuscate floor. July tests covered message-type gaps; not re-run | High | DLP limitations |
| Collaboration transport is E2EE and capability-link based. | **Still true (docs)** | collab.md AES-256-GCM, fragment key, full/view tokens. July crypto tests not re-run | High | strength and endpoint caveat |
| Browser app attach can terminate same-path running processes before relaunch. | **Still true** | `registry.ts` still calls `killExistingByPath` when no reusable CDP | High | availability/session boundary |
| Browser Relay adopts the user's Chrome tabs. | **Added** | `docs/tools/browser.md`: relay kind; no process ownership; logged-in tabs | High | data boundary |
| `computer` is a disabled-by-default desktop exec surface. | **Added** | `approval-mode.md` Computer safety; README `computer` tool | High | expanded exec surface |
| Session and blob data are stored locally; GC archives cold sessions rather than defining a hard deletion SLA. | **Still true** | session.md; `gc.coldArchiveAfterDays` default `30`; agent.db still `0700`/`0600`; session-storage.ts has no chmod | High | retention risk |
| Release CI uses digests/signing, but the default binary installer does not verify the downloaded asset digest. | **Still true, installer now smokes `--version`** | `scripts/install.sh` downloads to final path, `chmod +x`, then `--version`; no SHA256SUMS check | High | supply-chain blind spot |
| HEAD / latest release is `16.4.6` / `v16.4.5`. | **Superseded** | HEAD and latest release are `18.0.6` / `v18.0.6` | High | version surface |
| Runtime stability has active and recently fixed edge cases. | **Narrowed** | #5194, #4820, #5181 closed after the July pin. Closed ≠ locally re-verified fixed. | Medium | operations caveat |
| Task fan-out defaults remain broad. | **Still true** | `task.maxConcurrency` 32, `task.maxRecursionDepth` 2, `task.maxRuntimeMs` 0, `task.softRequestBudget` 200 | High | delegated blast radius |
| Team rollout requires OS/network/credential/review controls beyond OMP config. | Unchanged | Composition of execution authority and the controls above | Inference | adoption recommendation |

## Code-Derived Blind Spots

### 1. A single task approval can authorize a much larger execution fan-out

The documentation says subagents run headless with yolo and the parent task approval is the boundary. The code adds important scale context: `task.maxConcurrency` defaults to `32`, `task.maxRuntimeMs` defaults to `0` (unlimited), recursion depth defaults to `2`, and the ordinary soft request budget is `200` before a forced-stop path at 1.5x. These are useful controls, but their defaults make one approved task a potentially broad cost, network, and mutation authorization. Team profiles should lower concurrency, set a hard runtime, restrict tool policy, and set provider budgets.

### 2. Approval tiers describe capability class, not business impact

MCP tools default to the `write` tier. In `write` approval mode, write-tier operations are auto-approved. A remote tool named “update_ticket” and one named “rotate_production_key” may therefore share the same tier even though their business impact differs. Per-tool `allow/prompt/deny`, narrow MCP servers, and server-side authorization remain necessary.

Current docs add a second semantic gap: `bash.patterns` only feeds the `bash` tool. The `eval` tool is `exec` and can spawn a shell; under yolo that call resolves to `allow` unless `tools.approval.eval` is `prompt` or `deny`.

### 3. Extension exit guards are not a sandbox

The loader protects some process-exit behavior and reports load errors, but extensions are still dynamically imported JavaScript/TypeScript factories with ambient process, filesystem, environment, and network authority. An exit guard reduces one failure mode; it does not create isolation. Project-local `.omp/extensions`, hooks, and plugin manifests must be reviewed like executable dependencies. 2026-08-26 docs still say extensions are **not sandboxed**.

### 4. Secret obfuscation is a scoped text transform, not DLP

It is disabled by default. July tests showed that it redacts selected outbound message origins but intentionally leaves system prompts, tool schemas, assistant messages, and inline image bytes untouched, and ignores plain/regex matches shorter than eight characters. 2026-08-26 docs still document the 8-character obfuscate floor and opt-in default. This is sensible for false-positive control and cache stability, but means it cannot prove that no sensitive value reaches a provider. Credential scoping and broker/gateway architecture matter more.

### 5. Browser app attach has an availability boundary as well as a data boundary

When `app.path` has no reusable CDP endpoint, the implementation still terminates all processes matching that executable path, then relaunches it with a debugging port. Connected CDP, supplied profile arguments, and the 2026-08-26 Browser Relay path can also expose authenticated application state to the agent. A dedicated automation profile or headless browser is safer than attaching to a daily-use profile or enabling relay against a logged-in Chrome.

### 6. Local persistence has uneven hardening and no universal deletion promise

`agent.db` explicitly hardens its directory and database to `0700/0600`, which is positive. Generic session JSONL and blob writers still have no chmod in `session-storage.ts`. GC defaults archive cold sessions after 30 days and retain recent sessions; archiving/compression is not deletion. Teams need endpoint encryption, backup rules, retention/deletion policy, and guest-device policy for collaboration replicas.

### 7. The release pipeline and the default installer do not expose the same integrity guarantee

CI and Homebrew formula generation use release digests, and macOS release verification includes code-signing checks. `scripts/install.sh` still downloads a release binary directly to the final path and makes it executable without checking the GitHub asset digest. 2026-08-26 adds a post-download `omp --version` smoke check; that is a startability check, not digest verification. Pinning versions and using a package manager/formula with digest verification is safer than piping the default installer into a shell for controlled environments.

### 8. Failure containment depends on the entry surface

The RPC loop consumes JSONL from stdin. Open issue #5194 on 2026-07-12 reported that malformed input can terminate the whole process; it closed on 2026-07-17. This pass did not re-run RPC mode. A supervisor, strict producer-side framing, idempotent queueing, and restart/checkpoint behavior remain part of a reliable automated deployment, even if interactive TUI usage looks stable.

### 9. Fast releases reduce bug lifetime but increase verification load

The July article's `16.4.6` / `v16.4.5` snapshot is stale; HEAD and latest release are `18.0.6` / `v18.0.6` on 2026-08-26. Closing #5192, #5189, then #4820 / #5194 / #5181 is a positive maintenance signal. It also means teams need canaries, version pins, regression checks, and rollback instead of automatically equating “latest” with “safe.”

### 10. Desktop and relay surfaces expand the exec boundary when enabled

`computer` is disabled by default and chooses `read` only when `read_only: true`; otherwise it is `exec`. Browser Relay attaches to the user's Chrome without stealth patches. Neither inverts the harness thesis, but both widen what “yolo exec” can touch if turned on.

## Editorial Transformation

- Removed standalone presentation code and all interactive report UI.
- Replaced scores with an evidence-qualified verdict.
- Collapsed more than twenty risk cards into six trust-boundary themes.
- Corrected stale version/commit details and live issue states (again on 2026-08-26).
- Added code-derived blind spots and verification commands not present in the supplied report.
- Kept strengths and mitigations beside risks so the article is an adoption review, not a fear list.
- Avoided reproducing long configuration blocks that would drift quickly; the article explains required policy choices instead.
- 2026-08-26: dated the July test evidence; did not pretend this pass re-ran TypeScript/Biome/60 tests; did not unpublish.

## Limitations

- No enterprise penetration test, production incident history review, or legal/privacy assessment was performed.
- No provider credentials, MCP OAuth flow, collaboration relay deployment, browser account, or destructive tool path was exercised.
- 2026-08-26: oh-my-pi was not executed. Focused secrets/collab/release tests were not re-run.
- The complete upstream test suite was not run because the required pinned nightly Rust toolchain/native addon was unavailable locally (July: `nightly-2026-04-29`; August pin: `nightly-2026-08-08`).
- GitHub metrics, releases, and issue states are volatile after 2026-08-26.
- Issue reports are treated as reports; a closed issue is not automatically proof of a confirmed fix in the current binary.
- Security recommendations are architectural inference from inspected boundaries, not a vendor certification.

## Quality Gate Notes

- The public article must state the exact inspected HEAD and observation date (2026-08-26, `b4e8e856` / `18.0.6`) and date the July test snapshot separately.
- It must separate verified behavior, upstream claim, issue report, and inference.
- It must include both strong engineering signals and operational/security costs.
- It must surface the task fan-out, browser process termination, partial secret coverage, persistence/retention, and installer integrity blind spots.
- It must not repeat stale `v16.4.4` or `16.4.6` as current.
- It must keep yolo as the schema default unless source changes; qualify ACP's client permission gate and eval vs bash.patterns from current docs.
- It must explain the nightly-native test limitation without presenting environment failures as upstream defects, and must not claim this pass re-ran tests.
- It must keep published. Do not unpublish for evidence doubts alone.
- It must read as a technical blog narrative, not an assessment template or raw report dump.
