# Graphify Code Knowledge Graph Deep-Dive Research Packet

## Publication target

- Public article: `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`
- Supplied report: `docs/raw/graphify/graphify_deep_dive_ko.html`
- Supplied report SHA-256: `fff4edcd26614a70d58b345b704c2028a502ed441627c4edd242dad720c066e3`
- Supplied report snapshot: 2026-07-11
- Independent verification: 2026-07-12 (Asia/Seoul)
- Fresh clone: `Graphify-Labs/graphify` at `591da764a18db9c558de627accd61a61b32bc23e`
- Repository branch/version: default branch `v8`, `pyproject.toml` `0.9.13`
- Installable release: PyPI and GitHub release `0.9.12`, published 2026-07-10

The supplied HTML is treated as an input report, not as unquestioned truth.
The public article is a rewrite based on the claim review and probes below.

## Source inventory

### Current primary sources

- [Graphify repository](https://github.com/Graphify-Labs/graphify)
- [README at verified commit](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/README.md)
- [Architecture at verified commit](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/ARCHITECTURE.md)
- [Benchmark report at verified commit](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/BENCHMARKS.md)
- [Security policy at verified commit](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/SECURITY.md)
- [Package metadata at verified commit](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/pyproject.toml)
- [Graph builder](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/build.py)
- [Query and MCP implementation](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/serve.py)
- [CLI implementation](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/cli.py)
- [Incremental detection](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/detect.py)
- [Watch and rebuild path](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/watch.py)
- [Cache implementation](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/cache.py)
- [Export implementation](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/export.py)
- [Built-in token benchmark](https://github.com/Graphify-Labs/graphify/blob/591da764a18db9c558de627accd61a61b32bc23e/graphify/benchmark.py)
- [PyPI package](https://pypi.org/project/graphifyy/)

### Issues and maintainer evidence

- [#1706: memory benchmark reproduction](https://github.com/Graphify-Labs/graphify/issues/1706)
- [#1765: `check-update` and new files](https://github.com/Graphify-Labs/graphify/issues/1765)
- [#1766: homonymous generic symbols](https://github.com/Graphify-Labs/graphify/issues/1766)
- [#1751: central graph store](https://github.com/Graphify-Labs/graphify/issues/1751)
- [#1776: deleted files and unresolved stubs](https://github.com/Graphify-Labs/graphify/issues/1776)
- [#1774: cache output inside analyzed trees](https://github.com/Graphify-Labs/graphify/issues/1774)
- [#1769: cost ledger persistence](https://github.com/Graphify-Labs/graphify/issues/1769)
- [#1652: shrink detection, backup, and dry-run](https://github.com/Graphify-Labs/graphify/issues/1652)
- [#1789: absolute paths in structural IDs](https://github.com/Graphify-Labs/graphify/issues/1789)
- [#1795: deletion-evidence guard](https://github.com/Graphify-Labs/graphify/pull/1795)

### Adjacent-tool primary references

- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [CodeQL data-flow analysis](https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/)
- [SCIP](https://github.com/scip-code/scip)
- [LSIF overview](https://microsoft.github.io/language-server-protocol/overviews/lsif/overview/)
- [OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/)
- [Zoekt](https://github.com/sourcegraph/zoekt)

## Claim ledger

| Claim | Result | Evidence and editorial treatment |
| --- | --- | --- |
| Code-only extraction is local and AST-based | Verified | Default dependencies include tree-sitter grammars; code-only probe made no model call. Limit the wording to code-only mode because docs/media can use semantic backends. |
| Pipeline is detect → extract → build → cluster → analyze → report → export | Verified | `ARCHITECTURE.md` and module boundaries match. Some CLI paths stop at graph/analysis and require a later cluster/report step, so do not imply every command always completes every stage. |
| Default graph is undirected | Verified | `build_from_json(..., directed=False)` constructs `nx.Graph`. Direction endpoints are preserved as edge metadata for export, but traversal/storage still uses the undirected topology by default. |
| Default graph preserves every typed relation | Not fully true | A simple `nx.Graph` has one edge per node pair. Parallel relations or opposite-direction relations can collapse or overwrite. `MultiGraph` compatibility helpers do not make the default output a typed multigraph. |
| `query` is semantic natural-language retrieval | Overstated | Current query uses stopword removal, lexical normalization, IDF weighting, exact/prefix/substring/source tiers, trigram candidate filtering, seed selection, then BFS/DFS. It has useful heuristics, not embedding-based intent understanding. |
| `path` proves call or data-flow direction | False | Both CLI and MCP call `shortest_path(G.to_undirected(...))`. Output can show stored edge direction, but path selection ignores it. |
| `check-update` scans the corpus for new files | False interpretation | The command only checks a watcher-written `needs_update` flag. In a fresh probe it exited 0 silently after a new file. The lower-level `detect_incremental()` correctly reported the same new file. Treat this as a naming/operational-contract trap, not proof that all incremental detection is broken. |
| Deleting files always leaves stale nodes | Not reproduced as a general rule | Current code and maintainer reproduction remove nodes when deletion evidence is clear. Surviving references can create source-less unresolved stubs. PR #1795 adds a guard against evicting nodes without trustworthy deletion evidence. |
| Absolute-path node ID issue is fixed in current releases | Contradicted for a documented CLI path | Issue #1789 is closed and the maintainer reports portable CLI IDs. However, both PyPI 0.9.12 and current `v8` produced absolute-path-derived node IDs in fresh `graphify extract …` probes. `source_file` became relative in clustered output, but IDs differed across two checkout roots. State this as a command-path-specific reproduction, not a universal claim about every skill-driven path. |
| Built-in token benchmark measures task success | False | It estimates corpus size as `node_count × 50` words when no corpus count is supplied, estimates context at four characters per token, uses five fixed generic questions, and drops questions with no matching node. It measures an approximate context ratio, not correctness or success rate. |
| Published memory benchmark is independently reproducible from the public repo | Not currently | The maintainer states that `memory/runner.py` and adapters remain in a separate live research harness. Treat headline numbers as project-reported results. |
| Published code benchmark is strong general evidence | Limited | The ERPNext code suite reports `n=6`. It is evidence of possibility, not a broad estimate across languages, repos, and task types. |
| `$1.40` is Graphify index build cost | Misleading boundary | `BENCHMARKS.md` labels it ingest cost in places, while the maintainer clarifies that graph build/ingest is zero and the amount is the shared reader/judge cost. Keep graph construction cost, retrieval/evaluation cost, and competitor ingestion cost separate. |
| Security controls are absent | False | Current code has SSRF checks, redirect revalidation, size caps, graph path containment, label escaping, semantic-source delimiters, optional HTTP API key middleware, and loopback default binding. These are material strengths. |
| HTTP exposure is safe by default in every configuration | False | Loopback is the default, but wildcard binding without an API key remains allowed with a warning. In that mode DNS-rebinding protection is disabled because any Host is accepted. Network exposure needs an explicit policy, not only a warning. |

## Independent probe record

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

### Current source test run

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

Current `v8` initial result:

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

AST cache entries are namespaced by Graphify version. Semantic cache entries are
intentionally unversioned to avoid rebilling and are keyed by source-file
content. A provider, model, prompt, or extraction-policy change can therefore
reuse old semantic output for unchanged files unless another invalidation path
is used.

Classification: explicitly documented in `cache.py` and locked by tests.

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
- No document, image, video, external URL, model-backed semantic extraction, MCP
  client, HTTP listener, Neo4j, FalkorDB, PostgreSQL, SCIP, or global graph store
  was exercised.
- The current-source full test run used the default `uv run --frozen` profile,
  not CI's `--all-extras` profile.
- DNS behavior was environment-specific; no security conclusion is based on the
  `example.com` resolution failures.
- The absolute-ID reproduction covers `graphify extract`; the host skill's
  multi-step `/graphify` path may behave differently.
- Public issue status and repository statistics are snapshots from 2026-07-12.

## Editorial decisions

- Do not port the standalone HTML theme toggle, progress bar, sticky table of
  contents, cards, gauges, or custom CSS.
- Lead with a practical verdict and evidence hierarchy rather than project
  popularity.
- Replace the report's blanket `check-update` defect statement with the verified
  distinction between flag checking and corpus comparison.
- Replace the report's “absolute ID no longer reproduced” statement with the
  current command-path-specific reproduction.
- Explain the local full-test failures honestly, but keep them secondary to the
  product analysis because they were dependency/DNS-profile issues.
- Separate project-reported benchmark results from the built-in token-ratio
  command and from independent probes.
- Mark engineering inferences explicitly instead of dressing them as observed
  vulnerabilities.
- Keep the article shorter and more linear than the source report while adding
  the stronger provenance, cache, graph-schema, edge-multiplicity, network, and
  transactional-output analysis.

## Quality gate notes

- Required public headings: `먼저 알아야 할 개념`, `실제 구조`, `핵심 기능`,
  `좋은 점`, `조심해야 할 점`, `언제 쓰면 좋은가`, `주니어 개발자가 배울 점`,
  `내 결론`, `확인한 자료`.
- Validate with `node scripts/article-quality.mjs`, `npm run validate`, and
  `git diff --check`.
- Confirm the built article route and key source links.
- Inspect desktop and mobile rendering.
