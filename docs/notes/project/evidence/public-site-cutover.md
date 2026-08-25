# Public site cutover, rollback, and restore evidence

This source-bound record remains blocked after independent-review fix round 1.
The single changed-surface performance hypothesis passed, but the bounded local
drill loop did not produce a complete receipt. Local evidence never authorizes
deployment, traffic mutation, production observation, or Astro removal.

```yaml
schema_version: 2
implementation_commit: b981faab70b2264b85032439401772503e96410b
performance_commit: b8ed8fd914a468f11108509761857d694c5e44cb
changed_surface_performance_status: passed
local_cutover_status: blocked
local_shadow_rollback_status: not_measured
dynamic_80_route_crawl_status: not_measured
clean_host_status: not_measured
production_host: null
production_cutover_authorized: false
production_cutover_at: null
rollback_drill_at: null
observation_started_at: null
observation_completed_at: null
observation_errors: null
astro_removal_ready: false
```

## Changed-surface performance

The exact review-only command ran once. Desktop LCP samples were
`28, 24, 24, 24, 24` (median 24ms, maximum 26.4ms); mobile samples were
`20, 20, 20, 24, 20` (median 20ms, maximum 22ms). CLS was 0, initial
JavaScript was 108,250 B gzip, image transfer was 45,902 B, and the mandatory
issue union was zero in both cells. The tracked raw receipt is
[`public-site-review-performance.json`](public-site-review-performance.json).
Chromium exposed the LCP timing provenance but returned empty element identity
fields; the receipt preserves that limitation without inference.

## Local proof boundary

Four safety refusals stopped before an 80-route dynamic crawl completed: npm
command-title stabilization, owned-group cleanup verification, PPID-versus-PGID
listener ownership, and a trailing-empty-row `lsof` parser defect. Each defect
received a focused regression and code fix. The final parser fix is bound to the
implementation commit above, but the retry bound prohibited a fifth drill.

The first refusal left one orphaned preview. PID 49587 was matched to the exact
workspace Vite command and port 4391 before TERM. Later attempts stopped their
complete owned process groups. Final checks found no owned processes, no
`/tmp/beyondwin-cutover.*` roots, and ports 4390, 4391, and 4392 free.

The local machine boundary is recorded in
[`public-site-local-receipt.json`](public-site-local-receipt.json). Because it
does not contain a successful transition/dynamic receipt, the source-bound local
verifier failed closed with exit 1 and reported the missing parity/proxy/clean-host
groups. The strict-env clean-host proof was not run because a complete local
drill was its prerequisite; its boundary is recorded in
[`public-site-clean-host-receipt.json`](public-site-clean-host-receipt.json).

## Verification and production boundary

Before the immutable performance run, the Node 24 full gate passed 70 test files
and 565 tests, Astro checked 246 files with zero diagnostics, and the legacy
build produced 79 pages. Later lifecycle fixes were verified only on their
focused test/typecheck surface; no performance or full-gate rerun was performed.

Every production host/auth/cutover/rollback/observation field remains absent or
false/null. No production host, deploy target, DNS, traffic, proxy, or live
process was contacted or mutated. The Astro-removal verifier failed closed with
exit 1 on incomplete production cutover, rollback, and observation evidence.
Task 16 and Astro removal remain blocked.
