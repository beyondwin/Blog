# Public site cutover, rollback, and restore evidence

Task 15 local proof is complete for immutable implementation commit
`78e0907f5be86c6aeb8480516165f11c15ba2069`. The source-bound verifier derives
local **PASS** from the preserved performance receipt, the React → Astro → React
drill receipt, exact 80-route static and dynamic evidence, and the detached
exact-HEAD clean-host receipt. This is local evidence only; it does not authorize
deployment, traffic mutation, production observation, Task 16, or Astro removal.

```yaml
schema_version: 2
implementation_commit: 78e0907f5be86c6aeb8480516165f11c15ba2069
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

The local drill ran once against implementation commit `78e0907…2069` and
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
`/tmp/beyondwin-cutover.hdNDj6` root (canonical
`/private/tmp/beyondwin-cutover.hdNDj6`) was removed.

- Receipt commit: `235021977c584d0991b4af784735c86f3f305dbf`.
- Receipt: [`public-site-local-receipt.json`](public-site-local-receipt.json), `sha256:c1391d32c41186186da248cbd69d0e8758ac2098d8e7032fd2d57c8a57cc0f2a`.
- Route inventory: 80, `sha256:1dda2a3b837dcbbab650358cf145481cc81210470a6d5677c7b1958b7c275f18`.

## Immutable clean-host proof

Two invocations were correctly refused before any proof lifecycle, archive, or
owned command began. The first found the freshly generated local receipt as a
dirty worktree change. After that receipt was committed, the second found that
branch HEAD no longer equaled the requested implementation commit. These are
preflight refusals, not clean-host proof runs.

The worktree was then detached at the exact implementation commit and the one
actual clean-host proof ran once. It exported a 633-entry Git archive, verified
all exclusions, used isolated empty user and global npm configuration, ran the
six exact install/build/verify commands successfully, rebuilt the selected
site, and completed the exact 80-route HTTP smoke. Every owned command group
became empty and `/tmp/beyondwin-clean-host.9VZD8X` (canonical
`/private/tmp/beyondwin-clean-host.9VZD8X`) was safely removed.

- Receipt commit: `722c7f057366ecab8d3320c20f7bb5f64440c789`.
- Receipt: [`public-site-clean-host-receipt.json`](public-site-clean-host-receipt.json), `sha256:91274c388009cb7aa0cfcc400bdf0db5d7bf321374cd698ab20ad9e7f8809a9d`.
- Archive: `sha256:d6044dcce2c104fd7be56415a81645d64cdab0bda56ee5c3355921ff4f54863e`.
- Archive inventory: 633 entries, `sha256:82c13d2f6813bceba470dcbfdcd45ac166465413a153433b5231566bcec955c1`.
- Selected build: `sha256:601a874e6b655c09b6b99bdb0a2eca24bb0545f4b71670219c9687a9bdc72aee`.

## Verifier and production boundary

Node 24 local verification exited 0 with:

```json
{"mode":"local","status":"passed","implementation_commit":"78e0907f5be86c6aeb8480516165f11c15ba2069"}
```

Astro-removal verification exited 1 as required: `Astro removal refused:
production cutover, rollback, and observation evidence is incomplete`.
Production host/auth/cutover/rollback/observation fields remain absent or
false/null. No deploy, production host, DNS, traffic, proxy, or live production
process was contacted or mutated. Task 16 and Astro removal remain blocked.
