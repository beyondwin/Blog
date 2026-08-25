# Public site cutover, rollback, and restore evidence

This record is the source-bound operational gate for the public renderer migration.
The previous local proof was superseded by independent review and is deliberately
reset before the bounded review-performance hypothesis is measured.

```yaml
schema_version: 2
local_cutover_status: not_measured
local_shadow_rollback_status: not_measured
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

The machine summary is [`public-site-cutover.json`](public-site-cutover.json).
The final local, clean-host, and changed-surface receipts are accepted only when
the verifier independently recomputes their exact immutable commit, release,
builds, routes, raw metrics, process lifecycle, archive, environment, and cleanup
bindings. Local evidence never authorizes deployment, traffic mutation,
production observation, or Astro removal.
