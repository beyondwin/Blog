# Public site cutover, rollback, and restore evidence

This source-bound record remains blocked after independent-review fix round 2.
The preserved changed-surface performance receipt derives PASS against the
tracked Astro renderer baseline, but the one permitted final local drill failed
exact route-shape validation and did not write a successful receipt. Local
evidence never authorizes deployment, traffic mutation, production observation,
or Astro removal.

```yaml
schema_version: 2
implementation_commit: 479e8063838cd99c1c090b2cf3ac9c9a7385b7d0
performance_commit: b8ed8fd914a468f11108509761857d694c5e44cb
changed_surface_performance_status: passed
changed_run_machine_environment_provenance: not_measured
local_cutover_status: blocked
local_shadow_rollback_status: not_measured_unsealed
dynamic_80_route_crawl_status: not_measured_unsealed
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

Performance was not rerun. The tracked receipt was re-derived from its five raw
samples per cell and the tracked Astro baseline. Desktop LCP remains 24ms;
mobile LCP remains 20ms; CLS is 0, initial JavaScript is 108,250 B gzip, image
transfer is 45,902 B, and the mandatory issue union is zero. The tracked receipt
is [`public-site-review-performance.json`](public-site-review-performance.json).

The stripped receipt did not preserve a reconstructable changed-run environment
object or `selection.exactCommand`. Machine-level environment provenance is
therefore `not_measured`; the exact known command and Node 24 boundary remain in
the human Task 14 and Task 15 reports rather than being synthesized.

## Final local proof boundary

The one permitted final drill started owned React, Astro, and proxy groups,
completed the React → Astro → React sequence, and visited the exact 80-route
inventory in Chromium. Validation then failed at `/memory/map/`, route 24 in
inventory order, because the observed final URL/redirect pair did not equal the
tracked baseline-derived pair.

The failing run did not write its raw receipt. Consequently the observed pair,
the full dynamic route array, transitions, controller lifecycle, and historical
cleanup fields are not source-bound proof and remain `not_measured_unsealed`.
No diagnostic crawl or second drill was run.

The identity-bound failure cleanup ran. Final OS checks found no matching
Node/npm preview or proxy command, ports 4390, 4391, and 4392 free, and no
`/tmp/beyondwin-cutover.*` directory. Because no receipt was written,
historical group-member proof is not promoted beyond these final checks. The boundary is recorded in
[`public-site-local-receipt.json`](public-site-local-receipt.json).

## Clean-host and production boundary

The strict-env clean-host proof was not run because local PASS was its required
prerequisite. Its boundary is recorded in
[`public-site-clean-host-receipt.json`](public-site-clean-host-receipt.json).

Every production host/auth/cutover/rollback/observation field remains absent or
false/null. No production host, deploy target, DNS, traffic, proxy, or live
process was contacted or mutated. The local verifier refused with exit 1 on
missing parity/proxy/clean-host evidence, and the Astro-removal verifier refused
with exit 1 on incomplete production cutover, rollback, and observation
evidence. Task 16 and Astro removal remain blocked.
