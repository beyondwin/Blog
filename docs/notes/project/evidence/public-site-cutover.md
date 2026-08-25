# Public site cutover, rollback, and restore evidence

Task 15 local proof is complete for immutable implementation commit
`f0d0e990f1ecb2c068ea98813e20da141010d257`. The source-bound verifier derives
local **PASS** from the preserved performance receipt, the React → Astro → React
drill receipt, exact 80-route static and dynamic evidence, and the detached
exact-HEAD clean-host receipt. This is local evidence only; it does not authorize
deployment, traffic mutation, production observation, Task 16, or Astro removal.

Whole-branch review fixes changed app and release-source hashes after the earlier
Task 15 proof. The prior receipts remained valid historical evidence for their
own source commit, but could not bind the final implementation. The local and
clean-host proofs were therefore resealed against final commit `f0d0e99…d257`.

```yaml
schema_version: 2
implementation_commit: f0d0e990f1ecb2c068ea98813e20da141010d257
performance_commit: b8ed8fd914a468f11108509761857d694c5e44cb
changed_surface_performance_status: passed_preserved_without_rerun
changed_run_machine_environment_provenance: not_measured
changed_run_machine_exact_command_provenance: not_measured
local_cutover_status: passed
local_shadow_rollback_status: passed
dynamic_80_route_crawl_status: passed
clean_host_status: passed
production_host: null
production_cutover_authorized: false
production_cutover_at: null
rollback_drill_at: null
observation_started_at: null
observation_completed_at: null
observation_errors: null
astro_removal_ready: false
task_16_status: blocked
```

## Preserved performance evidence

Performance was not rerun. The tracked receipt still derives desktop LCP 24 ms
and mobile LCP 20 ms for `/reviews/black-swan/`, with CLS 0, 108,250 B gzip
initial JavaScript, 45,902 B image transfer, and zero mandatory issues against
the tracked Astro renderer baseline.

- Performance commit: `b8ed8fd914a468f11108509761857d694c5e44cb`.
- Receipt: [`public-site-review-performance.json`](public-site-review-performance.json), `sha256:c86f576974669516ae4d750ab726538bcb6d3002a524b1da2b1c6bc4f8f44081`.
- The stripped machine receipt does not reconstruct either its changed-run
  environment object or `selection.exactCommand`; both machine provenance
  fields remain honestly `not_measured`. The known human command remains in the
  Task 14 and Task 15 reports and is not synthesized into the machine receipt.

## Local shadow and rollback proof

The final local drill ran against implementation commit `f0d0e99…d257` and
sealed React → Astro → React transitions across the seven representative
routes. Static comparison checked all 80 routes, including two redirects. The
Chromium dynamic crawl recorded exactly 80 unique routes with zero console,
page, hydration, serious/critical axe, overflow, or private-boundary findings.
The delayed redirects resolved exactly as the baseline requires:
`/memory/map/` → `/memory/` and `/reviews/the-life-you-can-save/` →
`/reviews/doing-good-better/`.

The controller and exact owned React, Astro, and proxy groups were identity- and
command-bound. All group members became absent, the proxy worker stopped, ports
4390/4391/4392 became free, and the validated
`/tmp/beyondwin-cutover.uSI7a2` root (canonical
`/private/tmp/beyondwin-cutover.uSI7a2`) was removed.

- Receipt commit: `42b2147b357fb77497abd38d2731100042b06842`.
- Receipt: [`public-site-local-receipt.json`](public-site-local-receipt.json), `sha256:9a29e457f86dd850cd32425f79398c1b2711646043e8326c83d9ec15b27b9b12`.
- Route inventory: 80, `sha256:1dda2a3b837dcbbab650358cf145481cc81210470a6d5677c7b1958b7c275f18`.
- Selected build: `sha256:45fcdfbd64e990ccec5bf297fdace3cff4c54c8dc74988f22af572b0aee4d04c`.

## Immutable clean-host proof

The final clean-host proof ran at the exact final implementation commit. It
exported a 634-entry Git archive, verified
all exclusions, used isolated empty user and global npm configuration, ran the
six exact install/build/verify commands successfully, rebuilt the selected
site, and completed the exact 80-route HTTP smoke. Every owned command group
became empty and `/tmp/beyondwin-clean-host.ebhLFy` (canonical
`/private/tmp/beyondwin-clean-host.ebhLFy`) was safely removed.

- Receipt commit: `d9c7710e9bcd204d2d4d1953efdd99053de7105e`.
- Receipt: [`public-site-clean-host-receipt.json`](public-site-clean-host-receipt.json), `sha256:0abc3c94821c40dec838acf78736f8814e160c4e38beb92aeae04e3d753ecdfb`.
- Archive: `sha256:a48e2b624682679569b2f35a66f294893984b00cb3c4ac448bf102513862cd19`.
- Archive inventory: 634 entries, `sha256:f5885a595f7cc1d2538333e1c63ab1dfa894fc23ed5797bd911296269c687561`.
- Selected build: `sha256:45fcdfbd64e990ccec5bf297fdace3cff4c54c8dc74988f22af572b0aee4d04c`.

The two earlier clean-host preflight refusals remain historical evidence from
the prior proof cycle: one refused a dirty local receipt and one refused a HEAD
mismatch. Neither started a proof lifecycle, archive, temp root, or owned
command; they are not counted as clean-host proof runs.

## Final whole-branch validation

The final Node 24 validation passed 72 test files and 595 tests. Astro checked
250 files with zero diagnostics and built 79 pages. A focused real-browser
matrix covered article and review surfaces at desktop and mobile widths: all
4/4 cells passed with zero console errors, page errors, severe axe findings, or
overflow, and the incumbent article order was preserved. These results were
not rerun during this evidence-only reseal.

## Verifier and production boundary

Node 24 local verification exited 0 with:

```json
{"mode":"local","status":"passed","implementation_commit":"f0d0e990f1ecb2c068ea98813e20da141010d257"}
```

Astro-removal verification exited 1 as required: `Astro removal refused:
production cutover, rollback, and observation evidence is incomplete`.
Production host/auth/cutover/rollback/observation fields remain absent or
false/null. No deploy, production host, DNS, traffic, proxy, or live production
process was contacted or mutated. Task 16 and Astro removal remain blocked.
