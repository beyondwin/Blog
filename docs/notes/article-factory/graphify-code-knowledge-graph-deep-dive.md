# Graphify Code Knowledge Graph Deep-Dive Research Packet

Date: 2026-08-26
Status: verified-with-runtime-limit
Target article: `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`

## Publication target

- Public article: `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`
- Supplied report: `docs/raw/graphify/graphify_deep_dive_ko.html`
- Supplied report SHA-256: `fff4edcd26614a70d58b345b704c2028a502ed441627c4edd242dad720c066e3`
- Supplied report snapshot: 2026-07-11
- Independent verification: 2026-07-12 (Asia/Seoul), CLI probes on PyPI `0.9.12` and then-HEAD `0.9.13`
- 2026-08-26 re-check: official GitHub/docs/source/issues/PyPI only. Graphify CLI, restore, and install were not run.
- Historical clone: `Graphify-Labs/graphify` at `591da764a18db9c558de627accd61a61b32bc23e`
- 2026-08-26 HEAD: default branch still `v8`, commit `43d54acbfa9e731f7a592bb582c1f4b9d48ed73e` (“chore: bump to 0.9.50”, 2026-08-25), 492 commits ahead of the pinned SHA
- Repository version: `pyproject.toml` `0.9.50`
- Installable release: PyPI and GitHub release `0.9.50`, published 2026-08-25T17:43:31Z. PyPI JSON upload time 2026-08-25T17:44:02Z
- Repo stats on 2026-08-26: 110,853 stars, 10,778 forks, 1,127 open issues. Adoption signals only.

The supplied HTML is treated as an input report, not as unquestioned truth.
The public article is a rewrite based on the 2026-07-12 claim review and probes,
updated where 2026-08-26 official sources now contradict those claims.
Editorial note: local published after verification.

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| [Graphify repository](https://github.com/Graphify-Labs/graphify) | Official repository | 2026-08-26. Default branch `v8`. HEAD [`43d54acbfa9e731f7a592bb582c1f4b9d48ed73e`](https://github.com/Graphify-Labs/graphify/commit/43d54acbfa9e731f7a592bb582c1f4b9d48ed73e). |
| [README at HEAD](https://github.com/Graphify-Labs/graphify/blob/43d54acbfa9e731f7a592bb582c1f4b9d48ed73e/README.md) | Official documentation | Code-only tree-sitter path; HTTP loopback default; query-log env table vs privacy paragraph still disagree. |
| [ARCHITECTURE.md at HEAD](https://github.com/Graphify-Labs/graphify/blob/43d54acbfa9e731f7a592bb582c1f4b9d48ed73e/ARCHITECTURE.md) | Official documentation | Pipeline unchanged. `build()` still returns `nx.Graph`. Omitting `extract(root=…)` can embed machine path segments in IDs. |
| [BENCHMARKS.md at HEAD](https://github.com/Graphify-Labs/graphify/blob/43d54acbfa9e731f7a592bb582c1f4b9d48ed73e/BENCHMARKS.md) | Official documentation | Last updated 2026-07-05. LOCOMO 45.3% / recall@10 0.497; LongMemEval-S 76%; ERPNext n=6 70.8%→82.0%; `$1.40` ingest vs `$0` graph build. Reproduction still calls `python memory/runner.py`. |
| [SECURITY.md at HEAD](https://github.com/Graphify-Labs/graphify/blob/43d54acbfa9e731f7a592bb582c1f4b9d48ed73e/SECURITY.md) | Official documentation | SSRF, size caps, path containment, label escaping. HTTP is opt-in; default bind `127.0.0.1`. Supported-version table still says `0.3.x`. |
| [pyproject.toml at HEAD](https://github.com/Graphify-Labs/graphify/blob/43d54acbfa9e731f7a592bb582c1f4b9d48ed73e/pyproject.toml) | Package metadata | `name = "graphifyy"`, `version = "0.9.50"`, `requires-python = ">=3.10"`. |
| `graphify/build.py`, `serve.py`, `cli.py`, `detect.py`, `watch.py`, `cache.py`, `export.py`, `extract.py`, `benchmark.py` at HEAD | Implementation | Inspected 2026-08-26 via GitHub contents API. No Graphify command was executed. File-ID remap lives in `extract.py`. |
| [PyPI graphifyy](https://pypi.org/project/graphifyy/) | Installable release | 0.9.50 on 2026-08-26. Package name remains `graphifyy`; CLI remains `graphify`. |
| [#1706](https://github.com/Graphify-Labs/graphify/issues/1706) | Official issue | Still open. Memory harness not in the public repo. |
| [#1765](https://github.com/Graphify-Labs/graphify/issues/1765) | Official issue | Still open. `check-update` remains a `needs_update` flag check. |
| [#1766](https://github.com/Graphify-Labs/graphify/issues/1766) | Official issue | Closed 2026-07-13. Seed selection dedups by normalized label in 0.9.14 (`6ca8604` / PR #1832). |
| [#1751](https://github.com/Graphify-Labs/graphify/issues/1751) | Official issue | Still open. Central graph store. |
| [#1776](https://github.com/Graphify-Labs/graphify/issues/1776) | Official issue | Still open. Deleted files and unresolved stubs. |
| [#1774](https://github.com/Graphify-Labs/graphify/issues/1774) | Official issue | Closed 2026-07-13. Cache-in-tree. |
| [#1769](https://github.com/Graphify-Labs/graphify/issues/1769) | Official issue | Still open. Cost ledger persistence. |
| [#1652](https://github.com/Graphify-Labs/graphify/issues/1652) | Official issue | Still open. Dry-run / backup extras. |
| [#1789](https://github.com/Graphify-Labs/graphify/issues/1789) | Official issue | Closed. 0.9.14 follow-up fixed solution-folder IDs. Historical 2026-07-12 `extract` probe is not re-run. |
| [#1939](https://github.com/Graphify-Labs/graphify/issues/1939) | Official issue | Closed. Semantic cache now prompt-fingerprinted; still not package-versioned. |
| [#2487](https://github.com/Graphify-Labs/graphify/issues/2487) | Official issue | Closed 2026-08-05. `path` / MCP `shortest_path` directed by default in 0.9.34. |
| [PR #1795](https://github.com/Graphify-Labs/graphify/pull/1795) | Official PR | Closed. GitHub `merged=false`; the fail-closed deletion-evidence commit is `591da76` and the same guard remains in HEAD `watch.py`. |
| Adjacent tools | Primary references | Tree-sitter, CodeQL data-flow, SCIP, LSIF, OpenTelemetry traces, Zoekt. Unchanged role: not Graphify features. |
| Supplied HTML report | Intake artifact | Present at `docs/raw/graphify/graphify_deep_dive_ko.html`. Not a publishable primary source. |

Pinned 2026-07-12 blobs remain valid as the probe commit, not as current HEAD.

## Evidence Ledger

| Claim | Result (2026-08-26) | Evidence and editorial treatment |
| --- | --- | --- |
| Code-only extraction is local and AST-based | Verified | README, `pyproject.toml` tree-sitter deps, `ARCHITECTURE.md`. Limit wording to code-only mode. Not re-probed. |
| Pipeline is detect → extract → build → cluster → analyze → report → export | Verified | `ARCHITECTURE.md` unchanged. Some CLI paths still stop before cluster/report. |
| Default graph is undirected | Verified | `build_from_json(..., directed=False)` still constructs `nx.Graph`. `_src`/`_tgt` remain export metadata. |
| Default graph preserves every typed relation | Not fully true | Default output is still `nx.Graph`. Path CLI now *loads* as directed+multigraph for rendering; that does not make the stored graph a typed multigraph. |
| `query` is semantic natural-language retrieval | Overstated | HEAD `serve.py` still uses IDF, exact/prefix/substring, trigram candidates, then BFS/DFS. No embeddings. |
| `path` ignores direction | **Superseded** | True on 2026-07-12 (`to_undirected`). False on HEAD: #2487 closed; CLI/MCP default to a `_src`/`_tgt` digraph; `--undirected` / `undirected=true` opt out. Still not runtime/data-flow proof. |
| Homonymous `GET()` queries seed every match | **Superseded as current behavior** | 2026-07-12 fixture seeded both `GET()`. #1766 closed in 0.9.14: `_pick_seeds` dedups by normalized label. Historical output kept; not re-run. |
| `check-update` scans the corpus for new files | False interpretation | HEAD `watch.check_update` still only reads `needs_update`. #1765 still open. 2026-07-12 silent exit 0 remains historical. |
| Deleting files always leaves stale nodes | Not reproduced as a general rule | HEAD `watch.py` still fail-closes: corpus-absent identity is deletion only if `Path(identity).exists()` is false. #1776 still open for stubs. |
| Absolute-path node IDs are fixed in current releases | Historical contradiction; current docs qualify | 2026-07-12 `graphify extract` probe produced checkout-dependent IDs on 0.9.12 and then-HEAD. Not re-run. HEAD `extract.py` remaps file IDs to `{parent_dir}_{stem}`; `ARCHITECTURE.md` still warns that omitting `root` can embed machine path segments. |
| Built-in token benchmark measures task success | False | HEAD `benchmark.py` still uses `node_count × 50`, 4 chars/token, five sample questions, drops unmatched questions. |
| Published memory benchmark is independently reproducible from the public repo | Not currently | #1706 still open. `BENCHMARKS.md` still documents `python memory/runner.py`. |
| Published code benchmark is strong general evidence | Limited | ERPNext n=6 and 70.8%→82.0% unchanged. |
| `$1.40` is Graphify index build cost | Misleading boundary | Same 2026-07-05 tables: graph build `$0`; `$1.40` is LOCOMO ingest vs supermemory `$15.67`. |
| Security controls are absent | False | SSRF, redirects, size caps, path containment, label escaping, untrusted-source delimiters, optional API-key middleware, loopback default. HEAD checks: test 3.10/3.12, skillgen, security-scan green. |
| HTTP exposure is safe by default in every configuration | False | Wildcard bind without API key still allowed with a warning; DNS-rebinding protection disabled. |
| Semantic cache ignores prompt/model changes | Partially superseded | Still not package-versioned (#1252). HEAD fingerprints the extraction prompt (#1939) into `cache/semantic/p{fingerprint}/`. Provider/model are not in the key. Missing fingerprint falls back to the flat layout. |

## Independent probe record

Historical 2026-07-12 record. Not re-executed on 2026-08-26. Numbers were not invented.

### Repository and package state

```text
git rev-parse HEAD
591da764a18db9c558de627accd61a61b32bc23e

git describe --tags --always
v0.9.12-12-g591da76

pyproject.toml
name = graphifyy
version = 0.9.13

PyPI JSON / latest GitHub release
0.9.12, published 2026-07-10
```

On 2026-07-12 the repository API reported default branch `v8`, 82,450 stars,
8,124 forks, and 471 open issues. These are only adoption/activity signals.
They are not accuracy evidence and should not lead the article.

### 2026-07-12 source test run

Command:

```bash
uv run --frozen pytest -q
```

Result:

```text
3097 passed, 31 skipped, 10 failed in 348.49s
```

Failure classification:

- Four Ollama/OpenAI-compatible tests failed because the default dev sync does
  not install the optional `openai` dependency. Running the focused file with
  `uv run --frozen --extra openai pytest tests/test_ollama_retry_cap.py -q`
  produced `4 passed`.
- Six security tests depended on DNS resolution for `example.com` even when the
  HTTP opener was mocked. In this environment `github.com` and `pypi.org`
  resolved, while `example.com` did not. This is a test-isolation/environment
  dependency, not evidence that the SSRF implementation is broken.
- GitHub check runs for the same commit were green for Python 3.10, Python 3.12,
  skill generation, and the security scan. CI uses `uv sync --all-extras` for
  the main test job, explaining the optional-dependency difference.

Editorial treatment: describe the repository as heavily tested and CI-green,
but note that reproducing the exact green suite requires the CI dependency
profile and network assumptions.

### Five-file code fixture

Fixture:

- two Python modules each defining `GET()`,
- an `OrderService.submit()` method,
- a direct `service.submit()` call,
- a `getattr(service, "submit")` indirect call,
- one file added after the initial manifest.

Then-HEAD `v8` initial result (2026-07-12):

```text
4 files → 10 nodes, 10 edges
```

Observed edges:

- Both `GET()` functions remained separate nodes because their IDs carried path
  context.
- The direct checkout path emitted a call to `OrderService`, but did not emit a
  call edge to `OrderService.submit()`.
- The `getattr` path emitted an `indirect_call` edge to `.submit()`.

Query probes:

```text
GET
Start: ['GET()', 'GET()']

checkout OrderService
Start: ['OrderService', 'checkout()']

dynamic checkout submit
Start: ['checkout()', 'dynamic_checkout()', '.submit()']
```

This confirms both sides of the retrieval story: path-qualified identity keeps
same-named functions distinct, while a generic query deliberately seeds both.
It also shows that call resolution is construct-dependent; apparently simpler
syntax is not guaranteed to yield the more precise edge.

### New-file detection versus `check-update`

After saving a four-file AST manifest and adding `new_handler.py`:

```text
detect_incremental(..., kind='ast')
new_total 1
new_files {'code': ['.../new_handler.py'], ...}

graphify check-update /tmp/graphify-probe
exit 0, no output
```

The first is a corpus comparison. The second is a watcher-flag check. The public
article must not collapse them into one feature.

### Cross-checkout node ID portability

The same fixture was copied to two roots and processed with both PyPI 0.9.12 and
current `v8` using the documented headless `graphify extract` command. IDs
included the scan root:

```text
private_tmp_graphify_path_a_proj_api_a_get
private_tmp_graphify_path_b_proj_api_a_get
```

The sorted ID sets differed. Clustered current output normalized `source_file`
to `api_a.py`, but the node ID still contained the absolute root. This is a
stronger and more current finding than the supplied report's statement that the
issue did not reproduce on 0.9.12. It should be worded narrowly around this CLI
path and date.

## Blind spots beyond the supplied report

### 1. Graph files lack a complete provenance envelope

`graph.json` can carry `built_at_commit`, but it does not carry the branch,
dirty-worktree state, package/extractor version, extraction flags, ignore rules,
semantic backend/model/prompt identity, or a graph schema version. Two graphs
built from the same commit with different flags can therefore look equally
fresh. A central store keyed only by repo/commit can serve a semantically
different artifact.

Classification: code-backed observation plus engineering inference.

### 2. Semantic cache freshness has a different contract from AST freshness

AST cache entries are namespaced by Graphify version and cache-key schema.
Semantic cache entries are still not package-versioned, to avoid rebilling.
HEAD now fingerprints the extraction prompt into `cache/semantic/p{fingerprint}/`
(#1939). A provider or model change that does not change the prompt, or a caller
that does not supply a prompt, can still reuse old semantic output. Legacy
flat-layout hits remain allowed by default.

Classification: explicitly documented in HEAD `cache.py`. Prompt fingerprint is
a 2026-08-26 source update, not a new local probe.

### 3. Default graph storage loses relation multiplicity

Default `nx.Graph` storage can hold only one edge record between a node pair.
Different relation types, repeated evidence, or opposite directions can
collapse. `_src` and `_tgt` preserve the chosen edge's direction for export,
but cannot restore relations already overwritten or dropped.

Classification: direct property of the selected NetworkX type and build code.

### 4. Node deduplication can trade precision for richness

Duplicate node IDs are last-writer-wins across extraction inputs. The builder
documents that a semantic node may overwrite an AST node: richer context can
replace a more precise source location. That is a policy choice, not a neutral
merge.

Classification: documented build behavior.

### 5. “Generated code is ignored” is necessarily heuristic

Graphify excludes known build/cache directories and lockfiles and offers
`.graphifyignore`, but generated, vendored, templated, macro-expanded, and
framework-produced code cannot be identified universally. Missing generated
code hides real runtime paths; including it can create duplicate or noisy hubs.

Classification: code-backed boundary plus engineering inference.

### 6. Submodules and monorepos need explicit corpus ownership

The scanner ignores `.git` internals and nested worktree conventions, but a
checked-out submodule or vendored repository can still look like ordinary
source unless excluded. A graph also does not encode the submodule commit as a
first-class freshness dimension. Monorepos additionally repeat generic symbols
and package names across independently deployed services.

Classification: scanner behavior plus engineering inference. Phrase as a risk
to test, not a reproduced defect.

### 7. Network sharing changes the threat model

The HTTP server binds to loopback by default and supports constant-time API-key
comparison. It also permits `0.0.0.0` with no key, emitting only a warning, and
disables host allow-list enforcement for wildcard binds. A shared graph needs
mandatory authentication, transport security, tenant isolation, access logs,
and artifact-level authorization outside the tool's local default model.

Classification: code-backed behavior plus deployment inference.

### 8. Graph artifacts expose architectural intelligence even without source text

Labels, file paths, symbol names, relations, communities, package dependencies,
and “god nodes” can reveal high-value architecture. Semantic nodes may add more
document-derived content. Removing raw source does not make the graph safe to
publish.

Classification: output-schema observation plus security inference.

### 9. Not every write path is equally crash-safe

Watch rebuilds use a temporary graph and a lock, but other paths still write
JSON directly with `write_text()` or `open(..., "w")`. Backups and shrink guards
reduce some damage; they do not make every multi-file output transaction atomic.
An interrupted run can leave graph, report, labels, manifest, and cost metadata
at different generations.

Classification: code-backed multi-path comparison.

### 10. Installer-written instructions are part of the trust boundary

`graphify install` and hook installation write persistent agent guidance and Git
hook behavior. Upgrading the Python package does not automatically prove every
installed instruction file and embedded interpreter path has been refreshed.
The current CLI warns about skill/package mismatch, which confirms this is a
real lifecycle boundary.

Classification: documentation, tests, and the observed 0.9.12 mismatch warning.

### 11. Benchmarks can leak evaluation choices into the retriever

The built-in benchmark uses five hand-authored generic questions and discards
unmatched questions. The public research harness is not available, so dataset
split, prompt, adapter, judge, and run-manifest details cannot be independently
audited end to end. Even with blind judge agreement, the same organization
chooses retrieval settings, questions, budgets, and reporting conventions.

Classification: source-backed methodology limitation.

### 12. Static completeness is impossible to infer from a clean-looking graph

Reflection, dependency injection, framework registration, runtime imports,
macros, code generation, configuration, and feature flags can all change the
real execution path. The probe's direct and indirect method-call differences
show that relation coverage varies by syntax. A graph with no ambiguous edges
can still be incomplete because missing edges do not label themselves.

Classification: probe-backed observation plus general static-analysis boundary.

## Experiment boundaries

- The independent fixture was intentionally small and Python-only.
- It tests feature semantics, not representative precision/recall.
- 2026-07-12: no document, image, video, external URL, model-backed semantic
  extraction, MCP client, HTTP listener, Neo4j, FalkorDB, PostgreSQL, SCIP, or
  global graph store was exercised.
- 2026-08-26: Graphify CLI, restore, install, local pytest, and the 2026-07-12
  fixture were not re-run. Inspection used GitHub contents/issues APIs, raw
  docs, and PyPI.
- The 2026-07-12 full test run used the default `uv run --frozen` profile, not
  CI's `--all-extras` profile.
- DNS behavior was environment-specific; no security conclusion is based on the
  `example.com` resolution failures.
- The absolute-ID reproduction covers 2026-07-12 `graphify extract`; the host
  skill's multi-step `/graphify` path may behave differently. HEAD source now
  remaps file IDs; that remap was not re-probed.
- Public issue status and repository statistics below are 2026-08-26 snapshots
  unless labeled 2026-07-12.

## Editorial Decisions

- Do not port the standalone HTML theme toggle, progress bar, sticky table of
  contents, cards, gauges, or custom CSS.
- Lead with a practical verdict and evidence hierarchy rather than project
  popularity.
- Keep the 2026-07-12 fixture, pytest, and extract-ID numbers labeled historical.
  Do not invent a 2026-08-26 local benchmark or re-run Graphify.
- Update claims that HEAD now contradicts: directed `path` default (#2487),
  GET seed label-dedup (#1766), semantic-cache prompt fingerprint (#1939),
  extract ID remapping + `root` warning.
- Keep `check-update` as a flag/contract trap; #1765 is still open.
- Keep the 2026-07-12 extract-ID reproduction as a dated CLI-path finding, not
  as a current-HEAD runtime result.
- Explain the 2026-07-12 local full-test failures honestly, but keep them
  secondary. 2026-08-26 HEAD GitHub checks were green.
- Separate project-reported benchmark results from the built-in token-ratio
  command and from independent probes. `BENCHMARKS.md` date is still 2026-07-05.
- Mark engineering inferences explicitly instead of dressing them as observed
  vulnerabilities.
- Local published after verification. Do not unpublish.

## Quality Gate Notes

- Required public headings: `먼저 알아야 할 개념`, `실제 구조`, `핵심 기능`,
  `좋은 점`, `조심해야 할 점`, `언제 쓰면 좋은가`, `주니어 개발자가 배울 점`,
  `내 결론`, `확인한 자료`.
- Check date 2026-08-26. CreatedAt remains 2026-07-12. Status remains published.
- Public `## 확인한 자료` uses HEAD commit links and official issues. No local
  filesystem intake path.
- Inline SHAs in the article body are abbreviated (`43d54ac`, `591da76`) to
  avoid 390px overflow; full hashes stay in URLs and this packet.
- Validate with `node scripts/validate-content.mjs`, `npm run article:quality`,
  and `git diff --check`.
- Confirm `/articles/graphify-code-knowledge-graph-deep-dive/` at desktop and
  mobile. Keep the article on `/articles/`.
