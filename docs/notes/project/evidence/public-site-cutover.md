# Public site cutover, rollback, and restore evidence

This record is the operational gate for the public renderer migration. It is
source-bound to one immutable implementation commit and one verified public
release. Local evidence does not authorize a deployment, traffic change, DNS
change, production process mutation, observation claim, or Astro removal.

## Gate state

```yaml
schema_version: 1
local_cutover_status: blocked
local_shadow_rollback_status: passed
clean_host_status: passed
blocked_by: review mobile LCP 24ms > accepted 22ms maximum
production_cutover_authorized: false
production_cutover_at: null
rollback_drill_at: null
observation_started_at: null
observation_completed_at: null
observation_errors: null
astro_removal_ready: false
```

The source-bound summary is
[`public-site-cutover.json`](public-site-cutover.json). Its underlying immutable
receipts are [`public-site-local-receipt.json`](public-site-local-receipt.json)
and [`public-site-clean-host-receipt.json`](public-site-clean-host-receipt.json).
The local verifier recomputes the active release, build trees, exact route
contract, Task 14 source hashes, receipt hashes, and clean-host bindings rather
than trusting this prose.

## Immutable input and environment

- Implementation commit: `5f6ff22bfd22335e092f277c81b80a3965c8eccb`
- Public release: `84167f3be46bb747359c29e864516165bbd4212945498089ea1adb6ea4b59c7b`
- Release manifest: `sha256:5462764b984aa492eb6f4194988ddad035a25c9ef751a2857f4b6571ac978195`
- Release artifact: `sha256:38829f0d35c78c5777f1b094a1196fd17146c615c1d5982387c7b2a153c95a08`
- Active pointer: `sha256:cb6202e7ae0d6ab731b467464d733c5e332d53dc1ab900391b0d14a53806a5e2`
- Node `v24.18.0`, npm `11.16.0`, Darwin `25.5.0` arm64,
  Playwright `1.62.1`, Chromium `151.0.7922.34`
- React output: `sha256:ee4474c94a47dda0ffc3545e6083298f0519f8ab407fbb0ad428e88ba5e967e3`
- Astro/rollback output: `sha256:0a7687d29d5c8207f31f1883e1a95bacff38eb255d23e744cd5a7bc183220c37`

## Local shadow and rollback drill

The exact sealed inventory contained 80 paths with inventory hash
`sha256:1dda2a3b837dcbbab650358cf145481cc81210470a6d5677c7b1958b7c275f18`.
All 80 canonical/title/description checks, two redirect destinations, and all
80 scoped clean-link, no-JS anchor, media-dimension/candidate, and private
boundary checks passed with zero failures.

Ports 4390, 4391, and 4392 were confirmed free before the drill. The created
shell processes were React preview PID `21717`, Astro preview PID `21718`, and
proxy PID `21719`; the validated proxy PID-file named worker PID `21742`.
Representative scene, article, review, memory, search, tag, and redirect paths
matched their direct target body hashes and carried the expected target header
through React → Astro → React. Before TERM, each shell PID's command line was
matched to the created command. Only those three shell PIDs received TERM; the
proxy worker exited with its parent. The receipt records all three stopped,
all ports free afterward, and the validated `/tmp/beyondwin-cutover.*` root was
then removed.

An earlier orchestration attempt completed the route transitions but hit a zsh
colon-expansion error during post-drill reporting. Its safety trap stopped only
the created PIDs and removed its temporary root. That receipt is not used as
authority; the final receipt above comes from the immutable final commit.

## Clean-host restore

`git archive` exported only commit `5f6ff22bfd22335e092f277c81b80a3965c8eccb`
with archive hash
`sha256:b29986640fe6da37aea27c2f7b2c606595537aeb5cd6a2cb9d829395dcb3d950`.
Its 624-entry inventory excluded dependencies, generated build/output,
controller scratch, secrets/local environment, and top-level private memory;
the inventory hash is
`sha256:4609fc53c336d312007887fda2f2c393dc481704bca2a6d03b789fa451d81169`.

Inside a new `/tmp/beyondwin-clean-host.*` root, fresh `npm ci`, public release
build and verify, and selected React build all exited zero. The verified release
had 38 records, 24 assets, and zero private-boundary hits. A locally owned
ephemeral HTTP server smoked all 80 paths, including the seven representative
families, with nonempty 200 responses. The selected output hash matched the
drill output exactly. The server closed and only the validated clean-host root
was removed; that temporary archive/extraction is not recoverable, while the
Git commit and committed receipt remain reproducible.

The first clean-host attempt correctly refused to pass after `NODE_ENV=production`
caused npm to omit committed dev dependencies. A focused RED/GREEN removed
production/omit environment leakage for fresh installs. The final receipt is
from the corrected immutable commit. `npm ci` also reported five high-severity
audit findings; no automatic or forced dependency mutation was performed.

## Task 14 changed-surface boundary

Task 15 corrected 17 review meta descriptions to the sealed Astro verdict
contract. The 80-route metadata comparison then passed, but the required single
changed-surface performance run measured `/reviews/black-swan/` mobile LCP at
24ms median (`20, 24, 24, 24, 20`) against the accepted 22ms maximum. Desktop
LCP was 24ms; CLS was 0; initial JavaScript was 108,087 B gzip; image transfer
was 45,902 B; and console, hydration, serious/critical axe, image,
private-boundary, and overflow findings were all zero. The review source hash
is `sha256:5077e3447d307067b679dbafc54ffa0429381d950d46f5db2b15ba6f9219dd92`.
The failed cell was not rerun or waived, so `--mode local` remains blocked.

## Verification and authority boundary

The stabilized Node 24 full gate passed with 69 test files and 557 tests; Astro
checked 243 files with zero errors, warnings, or hints and built 79 pages. The
existing 17 media-rights warnings remain warnings. `git diff --check` passed.

`cutover:verify -- --mode astro-removal` refuses because every production and
observation field remains blank or false. Even after those fields exist, both
`--authorize-production` and a direct authorization record naming the exact
host and release are required. No production host, deploy target, DNS, proxy,
traffic, or live process was contacted or mutated, and Astro remains present.
