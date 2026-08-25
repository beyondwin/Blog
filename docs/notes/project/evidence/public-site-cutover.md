# Public site cutover, rollback, and restore evidence

This record is the operational gate for the public renderer migration. It is
source-bound to one immutable implementation commit and one verified public
release. Local evidence does not authorize a deployment, traffic change, DNS
change, production process mutation, observation claim, or Astro removal.

## Gate state

```yaml
schema_version: 1
local_cutover_status: not_measured
clean_host_status: not_measured
production_cutover_authorized: false
production_cutover_at: null
rollback_drill_at: null
observation_started_at: null
observation_completed_at: null
observation_errors: null
astro_removal_ready: false
```

The machine-readable receipt is
[`public-site-cutover.json`](public-site-cutover.json). The local verifier
recomputes its release, build, inventory, Task 14, proxy lifecycle, and
clean-host bindings instead of trusting this summary.

## Local proof contract

- Use Node 24 and a clean immutable implementation commit.
- Build the selected React output and the Astro rollback output from the same
  verified public release.
- Compare all 80 sealed public paths. Canonical metadata and redirect
  destinations remain exact; redesigned body, link, and image differences use
  the explicit clean-link, resolving-media, public-boundary, and sealed Task 14
  browser contract.
- Check ports 4390, 4391, and 4392 once before starting anything. Never stop an
  occupant.
- Start only the selected preview, Astro preview, and local proxy; transition
  React → Astro → React; verify target-identifying headers and body hashes; stop
  only the recorded children; and prove all three ports are free afterward.
- Export the implementation commit with `git archive` into a fresh validated
  `/tmp/beyondwin-clean-host.*` directory. Exclude dependencies, generated
  output, secrets/local environment, controller scratch, and top-level private
  memory. Run fresh `npm ci`, public release build/verify, selected-site build,
  and all-route HTTP smoke, then remove only that validated temporary root.

## Authority boundary

`cutover:verify -- --mode astro-removal` must continue to refuse while any
production or observation field above is blank or false. A command-line flag or
local receipt is never a substitute for a direct authorization record naming
the exact production host and release.
