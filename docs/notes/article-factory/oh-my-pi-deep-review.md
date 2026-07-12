# oh-my-pi Deep Review Research Packet

Date: 2026-07-12
Status: published
Target article: src/content/articles/oh-my-pi-deep-review.mdx

## Intake

- Input: `/Users/user/Downloads/oh-my-pi-deep-review-ko.html`
- Input type: standalone Korean technical/security/adoption report
- Upstream: https://github.com/can1357/oh-my-pi
- Editorial request: verify the report rather than republish it, inspect blind spots not stated directly in documentation, and turn the result into a natural Korean technical-blog article.
- Audience: experienced individual developers, engineering leads considering a pilot, and junior developers learning how to evaluate an agent harness as a privileged runtime.

The supplied HTML was treated as an intake hypothesis. Its custom CSS, navigation, filters, theme switcher, print behavior, repeated cards, and score presentation were not carried into the article.

## Upstream Snapshot

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
  - repository size field: `391,150 KiB`
  - license: MIT
  - `open_issues_count`: `747` (GitHub's repository field includes pull requests and must not be presented as issue count alone)

The supplied report described commit `c6b83c1d…` and release `v16.4.4`. Those values were already stale when this publication pass ran, so the public article uses the verified snapshot above and dates volatile values explicitly.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| https://github.com/can1357/oh-my-pi | repository | Canonical source, history, package layout, metadata | cloned and checked |
| `README.md` | official docs | Product scope, install methods, provider/tool claims | checked |
| `package.json` | manifest | Bun floor, workspaces, build/test/release commands | checked |
| `packages/coding-agent/package.json` | manifest | CLI package version, dependencies, engine constraint | checked |
| `packages/coding-agent/DEVELOPMENT.md` | official docs | Runtime entry points, session flow, RPC shape, package map | checked |
| `AGENTS.md` | project rules | Test, logging, release, and contributor engineering conventions | checked |
| `.github/workflows/ci.yml` | CI source | Multi-platform tests, release asset verification, macOS signing | checked |
| `.github/SECURITY.md` | policy | Latest-only security support and best-effort response | checked |
| `docs/approval-mode.md` | official docs | Approval tiers, default yolo, per-tool policy, subagent boundary | checked against code/tests |
| `packages/coding-agent/src/tools/approval.ts` | source | Actual approval resolution order and yolo behavior | checked |
| `packages/coding-agent/src/config/settings-schema.ts` | source | Defaults for approvals, tasks, secrets, GC, and other controls | checked |
| `packages/coding-agent/src/task/executor.ts` | source | Headless subagent settings, request/runtime controls | checked |
| `docs/extension-loading.md` | official docs | Extension discovery and dynamic module execution | checked against loader |
| `packages/coding-agent/src/extensibility/extensions/loader.ts` | source | Bun import/factory execution and error handling | checked |
| `docs/mcp-config.md` | official docs | stdio/HTTP servers, OAuth, project/user config | checked against MCP source/tests |
| `docs/secrets.md` | official docs | Opt-in obfuscation and collection rules | checked against source/tests |
| `packages/coding-agent/src/secrets/obfuscator.ts` | source | Message coverage and length/placeholder behavior | checked and tested |
| `docs/session.md` | official docs | JSONL session model, blobs, branching, resume | checked against storage source |
| `packages/coding-agent/src/session/session-storage.ts` | source | File creation, append, atomic rewrite, delete boundary | checked |
| `packages/coding-agent/src/session/agent-storage.ts` | source | SQLite storage and explicit permission hardening | checked |
| `packages/coding-agent/src/cli/gc-cli.ts` | source | Blob cleanup and cold session archive behavior | checked |
| `docs/collab.md` | official docs | E2EE relay, full/view capability links, guest transcript replica | checked against crypto tests |
| `packages/coding-agent/src/collab/crypto.ts` | source | Link and authenticated-encryption implementation | checked and tested |
| `docs/tools/browser.md` | official docs | Headless, connected, and app-path browser modes | checked against registry/attach source |
| `packages/coding-agent/src/tools/browser/registry.ts` | source | CDP reuse, same-path process termination, spawn/attach | checked |
| `docs/auth-broker-gateway.md` | official docs | Credential broker and gateway boundary | checked |
| `scripts/install.sh` | installer | Default source/binary install path and integrity behavior | checked |
| `scripts/ci-update-brew-formula.ts` | release tooling | Release asset SHA-256 use in Homebrew formula | checked and tested |
| `python/robomp/README.md` | reference architecture | More isolated unattended GitHub automation lane | checked |
| Issues #5192, #4820, #5194, #5189, #5181 | issue reports | CPU, long-session footprint, RPC framing, plugin update, advisor behavior | live state checked with GitHub API |

### Live issue state on 2026-07-12

| Issue | State | Reading |
| --- | --- | --- |
| [#5192](https://github.com/can1357/oh-my-pi/issues/5192) | closed | Idle CPU report was closed in the v16.4.5 release window; useful as a release-regression example, not an unresolved defect claim. |
| [#4820](https://github.com/can1357/oh-my-pi/issues/4820) | open | Long resumed TUI sessions retaining JSC/WebKit footprint remains an active report. |
| [#5194](https://github.com/can1357/oh-my-pi/issues/5194) | open | A non-JSON RPC input line terminating the process remains an active failure-containment concern. |
| [#5189](https://github.com/can1357/oh-my-pi/issues/5189) | closed | Incomplete plugin upgrade/startup failure was closed in the v16.4.5 release window. |
| [#5181](https://github.com/can1357/oh-my-pi/issues/5181) | open | Advisor hallucination and nonexistent MCP-tool attempt remains a model-orchestration report, not proof of a deterministic code bug. |

## Verification Commands

### Repository and live metadata

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

Result: completed. Metadata and issue states above are based on these commands.

### Required runtime

The host Bun was `1.3.10`, below the repository's declared `>=1.3.14` floor. Bun `1.3.14` was therefore downloaded from the official `oven-sh/bun` GitHub release into a temporary directory. Its asset was checked against GitHub's published digest:

```text
bun-darwin-aarch64.zip
sha256:d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620
```

The digest check passed before execution.

### Static and type checks

```bash
/tmp/bun-1.3.14-cPTaw5/bun-darwin-aarch64/bun install --frozen-lockfile
/tmp/bun-1.3.14-cPTaw5/bun-darwin-aarch64/bun run check:ts
```

Result: passed. Biome checked `3,393` files and all workspaces completed their TypeScript checks.

### Focused executable tests

```bash
/tmp/bun-1.3.14-cPTaw5/bun-darwin-aarch64/bun test \
  packages/coding-agent/test/secrets-obfuscator.test.ts \
  packages/coding-agent/test/collab/crypto.test.ts \
  scripts/ci-update-brew-formula.test.ts \
  scripts/ci-release-build-binaries.test.ts \
  scripts/ci-release-notes.test.ts
```

Result: `60 pass, 0 fail`, covering secret redaction boundaries, collaboration encryption/link parsing, Homebrew asset digests, Windows release target selection, and release-note assembly.

### Native/full-suite boundary

`bun run build:native` did not complete because the host had Homebrew stable Rust `1.95.0`, while the repository pins `nightly-2026-04-29` and uses `#![feature(alloc_error_hook)]`. Tests that import the native addon were therefore not counted as product failures; they were marked unverified in this environment. No attempt was made to install a global nightly toolchain or run privileged installer/integration paths.

## Evidence Ledger

| Claim | Evidence | Strength | Article use |
| --- | --- | --- | --- |
| OMP is an agent harness/workbench, not a model. | Runtime/package layout, README, DEVELOPMENT guide, CLI/TUI/RPC/ACP/SDK entry paths | High | thesis and architecture |
| LSP, DAP, structural edits, shell, browser, MCP, sessions, subagents, and collaboration are genuinely integrated. | Source directories and package manifests, not README alone | High | strengths |
| `tools.approvalMode` defaults to `yolo`. | `settings-schema.ts`, `approval-mode.md`, approval tests | High | primary risk |
| Safety override reasons do not force a prompt in yolo. | `resolveApproval()` and approval tests | High | primary risk |
| Subagents use headless yolo and treat parent task approval as the boundary. | `task/executor.ts`, approval docs | High | delegated blast radius |
| Extensions execute imported Bun/Node modules in-process. | extension docs and loader source | High | extension trust boundary |
| MCP tools are treated as write-tier by default. | approval docs and MCP integration | High | semantic approval gap |
| Secret obfuscation is disabled by default and has explicit coverage limits. | settings schema, secrets docs, obfuscator source, 17 focused tests | High | DLP limitations |
| Collaboration transport is E2EE and capability-link based. | collab docs, crypto source, 29 focused tests | High | strength and endpoint caveat |
| Browser app attach can terminate same-path running processes before relaunch. | browser registry and attach source | High | availability/session boundary |
| Session and blob data are stored locally; GC archives cold sessions rather than defining a hard deletion SLA. | session storage, blob store, GC source/defaults | High | retention risk |
| Release CI uses digests/signing, but the default binary installer does not verify the downloaded asset digest. | CI workflow, Brew formula generator/tests, `scripts/install.sh` | High | supply-chain blind spot |
| The codebase has strong static/test signals. | 1,004 coding-agent test files found, `check:ts` pass, focused 60-test pass | High | engineering quality |
| Runtime stability has active and recently fixed edge cases. | live issue states and release timing | Medium | operations caveat |
| Team rollout requires OS/network/credential/review controls beyond OMP config. | Composition of execution authority and the controls above | Inference | adoption recommendation |

## Code-Derived Blind Spots

### 1. A single task approval can authorize a much larger execution fan-out

The documentation says subagents run headless with yolo and the parent task approval is the boundary. The code adds important scale context: `task.maxConcurrency` defaults to `32`, `task.maxRuntimeMs` defaults to `0` (unlimited), recursion depth defaults to `2`, and the ordinary soft request budget is `200` before a forced-stop path at 1.5x. These are useful controls, but their defaults make one approved task a potentially broad cost, network, and mutation authorization. Team profiles should lower concurrency, set a hard runtime, restrict tool policy, and set provider budgets.

### 2. Approval tiers describe capability class, not business impact

MCP tools default to the `write` tier. In `write` approval mode, write-tier operations are auto-approved. A remote tool named “update_ticket” and one named “rotate_production_key” may therefore share the same tier even though their business impact differs. Per-tool `allow/prompt/deny`, narrow MCP servers, and server-side authorization remain necessary.

### 3. Extension exit guards are not a sandbox

The loader protects some process-exit behavior and reports load errors, but extensions are still dynamically imported JavaScript/TypeScript factories with ambient process, filesystem, environment, and network authority. An exit guard reduces one failure mode; it does not create isolation. Project-local `.omp/extensions`, hooks, and plugin manifests must be reviewed like executable dependencies.

### 4. Secret obfuscation is a scoped text transform, not DLP

It is disabled by default. Tests show that it redacts selected outbound message origins but intentionally leaves system prompts, tool schemas, assistant messages, and inline image bytes untouched, and ignores plain/regex matches shorter than eight characters. This is sensible for false-positive control and cache stability, but means it cannot prove that no sensitive value reaches a provider. Credential scoping and broker/gateway architecture matter more.

### 5. Browser app attach has an availability boundary as well as a data boundary

When `app.path` has no reusable CDP endpoint, the implementation terminates all processes matching that executable path, then relaunches it with a debugging port. This can interrupt the user's browser/application state. Connected CDP or supplied profile arguments can also expose authenticated application state to the agent. A dedicated automation profile or headless browser is safer than attaching to a daily-use profile.

### 6. Local persistence has uneven hardening and no universal deletion promise

`agent.db` explicitly hardens its directory and database to `0700/0600`, which is positive. Generic session JSONL and blob writers rely on their enclosing directory and OS umask rather than applying the same explicit mode at every write site. GC defaults archive cold sessions after 30 days and retain recent sessions; archiving/compression is not deletion. Teams need endpoint encryption, backup rules, retention/deletion policy, and guest-device policy for collaboration replicas.

### 7. The release pipeline and the default installer do not expose the same integrity guarantee

CI and Homebrew formula generation use release digests, and macOS release verification includes code-signing checks. `scripts/install.sh` downloads a release binary directly to the final path and makes it executable without checking the GitHub asset digest. Pinning versions and using a package manager/formula with digest verification is safer than piping the default installer into a shell for controlled environments.

### 8. Failure containment depends on the entry surface

The RPC loop consumes JSONL from stdin; open issue #5194 reports that malformed input can terminate the whole process. A supervisor, strict producer-side framing, idempotent queueing, and restart/checkpoint behavior are therefore part of a reliable automated deployment, even if interactive TUI usage looks stable.

### 9. Fast releases reduce bug lifetime but increase verification load

The supplied report's v16.4.4 snapshot was stale by the next day's clone, while v16.4.5 was the latest published release and HEAD/tag/package metadata had already moved to v16.4.6. Closing #5192 and #5189 quickly is a positive maintenance signal. It also means teams need canaries, version pins, regression checks, and rollback instead of automatically equating “latest” with “safe.”

## Editorial Transformation

- Removed standalone presentation code and all interactive report UI.
- Replaced scores with an evidence-qualified verdict.
- Collapsed more than twenty risk cards into six trust-boundary themes.
- Corrected stale version/commit details and live issue states.
- Added code-derived blind spots and verification commands not present in the supplied report.
- Kept strengths and mitigations beside risks so the article is an adoption review, not a fear list.
- Avoided reproducing long configuration blocks that would drift quickly; the article explains required policy choices instead.

## Limitations

- No enterprise penetration test, production incident history review, or legal/privacy assessment was performed.
- No provider credentials, MCP OAuth flow, collaboration relay deployment, browser account, or destructive tool path was exercised.
- The complete upstream test suite was not run because the required pinned nightly Rust toolchain/native addon was unavailable locally.
- GitHub metrics, releases, and issue states are volatile after 2026-07-12.
- Issue reports are treated as reports; an open issue is not automatically proof of a confirmed root cause.
- Security recommendations are architectural inference from inspected boundaries, not a vendor certification.

## Quality Gate Notes

- The public article must state the exact inspected commit and observation date.
- It must separate verified behavior, upstream claim, issue report, and inference.
- It must include both strong engineering signals and operational/security costs.
- It must surface the task fan-out, browser process termination, partial secret coverage, persistence/retention, and installer integrity blind spots.
- It must not repeat stale `v16.4.4` as current.
- It must explain the nightly-native test limitation without presenting environment failures as upstream defects.
- It must read as a technical blog narrative, not an assessment template or raw report dump.
