# FORM & THOUGHT pre-removal acceptance

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](../README.md)과 ADR을 본다.

- Status: accepted pre-removal GREEN; awaiting the controller's separate deletion ruling
- Repository pre-removal HEAD: `095b89426b34aede0ce9fb29f0254bd1ba26aa0b`
- Verified release: `2ceb7d0aa4595a290845aae97815452a2fced4ab35f647abaf7aa63f7f372874`
- Release inventory: 43 records / 18 assets / 0 private-boundary hits
- Renderer under acceptance: React Router static export only
- Production canonical origin: `not_measured` (no approved public domain is recorded)
- Production cutover authorization: `false`
- Deletion authorization: not granted by this document

## Replacement-owner acceptance

The pre-removal implementation supplies React-only owners for exact public
origin handling, canonical/OG metadata, sitemap, robots, favicon, manifest,
static-host 404 behavior, security headers, trusted-MDX/private-negative
checks, full release-derived route inventory, and performance measurement.
`FORM_THOUGHT_SITE_ORIGIN` is the sole production origin authority. Production
mode rejects a missing, non-HTTPS, inexact, or reserved `.invalid` origin; the
deterministic `https://form-thought.local.invalid` value is accepted only in
explicit local/test mode and is never production evidence.

RSS remains out of scope because the tracked renderer has no RSS route, feed,
script, dependency, or accepted public contract.

Focused replacement evidence:

| Command/owner | Result |
| --- | --- |
| media-manifest parser plus strict media validation | 59 passed |
| delivery plus actual static-host tests | 8 passed |
| no-JS/navigation/static discovery suite | 9 passed |
| current route/source owners | 54 passed |
| cutover evidence/proxy/public-site owners | 19 passed |
| performance selection/budget unit contract | 12 passed |
| current edge and reading-continuity browser owners | 13 passed in 24.8s |
| bounded first-frame image-readiness regression | 1 passed in 19.8s |
| React acceptance excluding only the sealed deletion-only scene spec | 46 passed in 1.9m |
| performance receipt seal | sealed, 8 routes / 16 cells |
| React-only public-site verification | passed |

The zero-Astro workspace contract was intentionally recorded RED before
deletion: five assertions still identify the root package name, Astro packages
and scripts, tracked Astro sources/config, and the Astro root tsconfig extend.
Those assertions must turn GREEN only after the controller authorizes the
sealed manifest deletion.

## Performance protocol and budgets

The route matrix is fixed before capture and covers home, all three primary
indexes, search, and one detail per primary lane at desktop 1440x900 and mobile
390x844. Every cell discards one warmup and records five fresh cold contexts
with the HTTP cache cleared. Initial JavaScript is gzip level 9 over inline
plus unique initial executable responses; fonts and first-frame images are
unique successful response bodies.

| Budget | Maximum |
| --- | ---: |
| LCP | 2,500 ms |
| CLS | 0.05 |
| initial JavaScript gzip | 131,072 bytes |
| font bytes | 256,000 bytes |
| first-frame image bytes | 524,288 bytes |

Measured medians from
`output/playwright/task14/performance-matrix.json`:

| Route | Viewport | LCP ms | CLS | JS gzip B | Font B | First-frame image B |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/` | desktop | 28 | 0.0005024691358024692 | 123967 | 247368 | 95493 |
| `/` | mobile | 24 | 0 | 123967 | 247368 | 34734 |
| `/articles/` | desktop | 32 | 0.0005024691358024692 | 113780 | 247368 | 265052 |
| `/articles/` | mobile | 24 | 0 | 113780 | 247368 | 127641 |
| `/reviews/` | desktop | 28 | 0.0005024691358024692 | 109676 | 247368 | 0 |
| `/reviews/` | mobile | 24 | 0 | 109676 | 247368 | 0 |
| `/thoughts/` | desktop | 24 | 0.0005024691358024692 | 103990 | 247368 | 60759 |
| `/thoughts/` | mobile | 20 | 0 | 103990 | 247368 | 60759 |
| `/search/` | desktop | 32 | 0.0005024691358024692 | 114682 | 247368 | 34734 |
| `/search/` | mobile | 24 | 0 | 114682 | 247368 | 0 |
| article detail | desktop | 40 | 0.0005024691358024692 | 123799 | 247368 | 127641 |
| article detail | mobile | 36 | 0 | 123799 | 247368 | 127641 |
| review detail | desktop | 28 | 0.0005024691358024692 | 109883 | 247368 | 0 |
| review detail | mobile | 24 | 0 | 109883 | 247368 | 0 |
| thought detail | desktop | 28 | 0.0005024691358024692 | 109303 | 247368 | 60759 |
| thought detail | mobile | 24 | 0 | 109303 | 247368 | 60759 |

All 16 cells are within every budget. The report contains no console,
hydration, image, private-boundary, or overflow failure. The production
canonical origin is correctly reported `not_measured`; the reserved local
origin is not promoted as production evidence.

## Visual and browser acceptance

The `/articles/` 1080x1440 Task 7 golden differed from the current verified
release by 248,125 Playwright pixels (`0.16`). Two update-free runs reproduced
the same actual image hash. All approved geometry, typography, containment and
overflow metrics remained exact. The stable delta was the truthful post-Task 7
addition of approved featured imagery to article rows visible below the
Graphify lead, not an environment/paint fluctuation or the Task 14 payload
reduction. Exact artifacts, hashes and cause are recorded in
`output/playwright/task14/articles-golden-analysis.md`. Independent visual
review and the controller recorded `APPROVE_UPDATE`; only that golden was
updated to the approved actual bytes with SHA-256
`821c2d15cf4bc462876fe09690595feef39ffbde394be39f5a19b562d76bf486`.

The detail golden's second, smaller current-release delta was independently
reviewed and recorded `APPROVE_DETAIL_UPDATE`: the only intentional change is
the Task 13 `글 목록으로` recovery control in the action rail, while the hero,
prose geometry, desktop/mobile containment, focus treatment and readability
remain unchanged. Only that golden was updated to the approved actual bytes
with SHA-256
`1a5fc17b86c6f902f687c13df64ead0df9a035c928cbd46d9697c70cae905032`.
The home golden was not changed and remains SHA-256
`84d7c0596a70688199377cfb122a4bd85a46a9e345204abd84274d0623fc59ce`.

The visual readiness helper now decodes only viewport-intersecting or
explicitly eager/first-frame images. Its focused regression proves that a
below-fold lazy image cannot block readiness while visible/eager decode
failures remain bounded and reported; the existing all-image failure assertion
is unchanged. The exact full command then passed update-free:

```text
PATH=/opt/homebrew/opt/node@24/bin:$PATH npx playwright test --config=playwright.form-thought.config.ts
```

Result: 46 passed in 1.9 minutes. The run includes accessibility, bounded image
readiness, calibrated and responsive visual matrices, navigation, no-JS,
static 404/headers, current reading continuity, search, edge cases and all 16
performance cells. The performance receipt was resealed from that run and the
React-only public-site verifier passed. No snapshot-update flag was used.

## Warnings and boundaries

- Strict media validation reports the same 17 known review-cover warnings;
  public review details truthfully remain text-led without an approved cover.
- Static export reports the duplicate Sharp/libvips
  `GNotificationCenterDelegate` warning; the build completes and browser image
  decoding checks pass.
- The post-deletion clean install must record the npm audit result, including
  any five high-severity findings, without implying that Task 14 silently
  remediated dependency vulnerabilities outside its renderer-removal scope.
- No push, merge, deployment, production-domain guess, traffic mutation, or
  production authorization occurred.
