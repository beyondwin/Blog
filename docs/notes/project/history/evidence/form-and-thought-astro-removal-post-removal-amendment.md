# FORM & THOUGHT Astro removal post-removal amendment

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](../README.md)과 ADR을 본다.

## Authority and boundary

This evidence reconciles the Task 14 tracked diff after the authorized removal
and binds the review-fix round to the already sealed deletion ruling. It does
not replace the original manifest and does not authorize another deletion.

- Baseline: `095b89426b34aede0ce9fb29f0254bd1ba26aa0b`
- Pre-review Task 14 commit: `9ecfcff4a1e76745a67c606657a7d8facbed9a3a`
- Original manifest SHA-256: `dfcc1deb40ef4cdf23a5c21c45ad786ff6242ef3b84b6eebf55502adfc052bb0`
- Authorized sorted deletion-path SHA-256: `0b49eb8d5dd0a71a58a2ef9f66d7a018bc532c8fcfd4e5f1edebdaa35bd7617f`
- Authorized deletion count: 120 tracked paths; 120 present in the baseline,
  120 deleted, 0 missing and 0 extra
- Production canonical origin: `not_measured` / unset
- `production_cutover_authorized: false`
- Push, merge, deployment and traffic mutation: not performed

The original manifest is immutable. Its SHA-256 and deletion-list SHA-256 above
remain unchanged after this amendment.

## Reconciled tracked path sets

Each hash below is the SHA-256 of the corresponding exact, `LC_ALL=C` sorted,
newline-terminated path list. Added, rewritten and deleted sets are measured
against the baseline. Retained paths are a literal sorted list of unchanged
owners that the removal manifest deliberately preserves.

| Classification | Count | Sorted path-list SHA-256 |
|---|---:|---|
| Added | 13 | `9c3a03e93beac93526639f5fde6d1d80f49ee42ac1337a419103d8b45f265ae1` |
| Rewritten | 59 | `ba60e5d2ddcd9e42b3015af100deb8d3f83dc611358bd229b9c9131e2f9e81e1` |
| Retained unchanged | 11 | `d990d5ca120b4319db798bf7bcc1883c92923ed5cea40084043e54359bf74966` |
| Deleted | 120 | `0b49eb8d5dd0a71a58a2ef9f66d7a018bc532c8fcfd4e5f1edebdaa35bd7617f` |

### Added: exact 13

```text
apps/site/app/delivery.ts
apps/site/public/site.webmanifest
apps/site/serve-static.ts
apps/site/test/delivery.test.ts
apps/site/test/static-server.test.ts
docs/notes/project/evidence/form-and-thought-astro-removal-manifest.md
docs/notes/project/evidence/form-and-thought-astro-removal-post-removal-amendment.md
docs/notes/project/evidence/form-and-thought-pre-removal-acceptance.md
packages/content/src/media/media-manifest.d.mts
packages/content/src/media/media-manifest.d.ts
packages/content/src/media/media-manifest.mjs
packages/content/test/media-manifest.test.mjs
tests/e2e/performance-metrics.ts
```

### Rewritten: exact 59

```text
apps/site/app/release.server.ts
apps/site/app/root.tsx
apps/site/app/routes/articles-index.tsx
apps/site/app/routes/home.tsx
apps/site/app/routes/review.tsx
apps/site/app/routes/reviews-index.tsx
apps/site/app/routes/tag.tsx
apps/site/app/routes/thoughts-index.tsx
apps/site/build-static-export.ts
apps/site/package.json
apps/site/public/favicon.svg
apps/site/src/ui/articles/ArticleIndexPage.tsx
apps/site/src/ui/home/HomePage.tsx
apps/site/src/ui/reviews/bookshelfPresentation.ts
apps/site/src/ui/thoughts/ThoughtIndexPage.tsx
apps/site/test/emitted-output.test.ts
apps/site/test/routes.test.tsx
apps/site/test/static-export.test.ts
apps/site/test/ui/route-presentations.test.tsx
deploy/reverse-proxy/public-site.conf
docs/INDEX.md
docs/_index/catalog.yml
package-lock.json
package.json
packages/content/test/source-records.test.ts
playwright.form-thought.config.ts
scripts/agent-check.mjs
scripts/agent-check.test.mjs
scripts/content-migration.test.mjs
scripts/cutover/evidence-contracts.mts
scripts/cutover/evidence-contracts.test.ts
scripts/cutover/local-proxy.mts
scripts/cutover/local-proxy.test.ts
scripts/cutover/seal-performance-receipt.mts
scripts/cutover/verify-clean-host.mts
scripts/cutover/verify-public-site.mts
scripts/cutover/verify-public-site.test.ts
scripts/memory.project.test.mjs
scripts/memory/schema.mjs
scripts/publication-surfaces.test.mjs
scripts/site-content.test.mjs
scripts/validate-media.mjs
tests/e2e/accessibility.spec.ts
tests/e2e/direct-and-modified-navigation.spec.ts
tests/e2e/edge-cases.spec.ts
tests/e2e/form-thought-visual.spec.ts
tests/e2e/form-thought-visual.spec.ts-snapshots/article-detail-calibrated-1120x1400.png
tests/e2e/form-thought-visual.spec.ts-snapshots/articles-calibrated-1080x1440.png
tests/e2e/no-js.spec.ts
tests/e2e/performance-selection.ts
tests/e2e/performance.spec.ts
tests/e2e/reading-continuity.spec.ts
tests/e2e/search-return.spec.ts
tests/e2e/support.ts
tests/fixtures/public/no-relations-record.json
tests/performance-selection.test.ts
tests/playwright-contract.test.ts
tests/workspace-contract.test.ts
tsconfig.json
```

### Retained unchanged: exact 11

```text
memory/sources.jsonl
playwright.config.ts
scripts/cutover/cutover-evidence.mts
scripts/cutover/owned-process-lifecycle.mts
scripts/cutover/owned-process-lifecycle.test.ts
scripts/memory/seed.mjs
scripts/memory.seed.test.mjs
src/data/memory.public.json
tests/e2e/form-thought-visual.spec.ts-snapshots/home-calibrated-1440x1080.png
tests/e2e/mobile-navigation.spec.ts
vitest.config.mjs
```

### Deleted: exact 120

The deletion set is exactly the 120-path `Exact sorted deletion block` in the
original manifest. Its independently recalculated sorted path-list SHA-256 is
`0b49eb8d5dd0a71a58a2ef9f66d7a018bc532c8fcfd4e5f1edebdaa35bd7617f`.
No review-fix path was deleted.

## Reconciliation of the original classification

- `apps/site/public/robots.txt` is generated inside the static build output. It
  is not a tracked addition; its owner is `apps/site/build-static-export.ts` and
  its built bytes are proven by `apps/site/test/emitted-output.test.ts`.
- The original removal manifest itself is a tracked addition and is counted in
  the actual added set. This amendment is the thirteenth tracked addition.
- `vitest.config.mjs` is retained byte-for-byte, not rewritten. It is the root
  Vitest owner exercised by `npm test` and the ordered validation contract.
- `docs/INDEX.md`, `docs/_index/catalog.yml`,
  `scripts/memory.project.test.mjs`, `scripts/memory/schema.mjs` and
  `tests/playwright-contract.test.ts` are actual rewrites omitted from the
  pre-removal table. They are now classified explicitly.
- The post-review bounded Home UI type owner
  `apps/site/src/ui/home/HomePage.tsx` raises the final rewrite total from 58 to
  59. No other actual added, rewritten or deleted path falls outside the exact
  lists above.
- `scripts/memory/seed.mjs` and `scripts/memory.seed.test.mjs` retain
  `astro-content` only as a stable historical provenance token. It is not an
  executable dependency, import, command, configuration or public renderer.

## Review-fix tracked allowlist and proof

| Path | Final responsibility | Proving test or gate |
|---|---|---|
| `apps/site/serve-static.ts` | Prevent symlink and realpath escape while serving normal files and the real 404 | `apps/site/test/static-server.test.ts` |
| `apps/site/test/static-server.test.ts` | Normal file, 404, final symlink and nested symlink regressions | focused Vitest; immutable clean-host |
| `package.json` | Run root full Vitest exactly once in the ordered validation chain | `tests/workspace-contract.test.ts`; `npm run validate` |
| `tests/workspace-contract.test.ts` | Seal full-test and validation ordering contract | focused Vitest; root Vitest |
| `apps/site/app/release.server.ts` | Exact bounded Home selection projection | `apps/site/test/routes.test.tsx`; built-output inspection |
| `apps/site/app/routes/home.tsx` | Emit four bounded selections, first-frame assets and absolute Home canonical/OG | `apps/site/test/routes.test.tsx`; `apps/site/test/emitted-output.test.ts` |
| `apps/site/src/ui/home/HomePage.tsx` | Consume only the bounded selection shape | site typecheck; route tests |
| `apps/site/test/routes.test.tsx` | Negative detail-field/body assertions and absolute Home metadata | focused Vitest |
| `apps/site/test/emitted-output.test.ts` | Built HTML/data negative byte/field proof and redirect metadata | site build; focused Vitest |
| `apps/site/build-static-export.ts` | Rewrite the compatibility redirect to canonical/OG `/memory/` | `apps/site/test/static-export.test.ts`; emitted-output test |
| `apps/site/test/static-export.test.ts` | Reject the generic/self-canonical compatibility redirect | focused Vitest |
| `scripts/cutover/local-proxy.mts` | Apply public security headers to proxy-generated 405 and 502 responses | `scripts/cutover/local-proxy.test.ts` |
| `scripts/cutover/local-proxy.test.ts` | 405/502 CSP, Referrer-Policy and nosniff regressions | focused Vitest; security reproduction |
| `docs/notes/project/evidence/form-and-thought-astro-removal-post-removal-amendment.md` | Bind the reconciled diff and review fix to the original checksums | agent/docs checks; controller ruling |
| `docs/_index/catalog.yml` | Catalog the amendment evidence | agent/docs checks |
| `docs/INDEX.md` | Make the amendment evidence discoverable | agent/docs checks |

The ignored implementation report
`.superpowers/sdd/form-and-thought-implementation-plan/task-14-report.md` records
the same status and final gate results but is not a tracked added or rewrite
owner.

## Acceptance boundary

The amended implementation remains React-only and release-derived. Production
sealing still requires the exact normalized HTTPS `FORM_THOUGHT_SITE_ORIGIN`;
the deterministic reserved `.invalid` origin remains local/test-only and fails
closed for production verification. The verified public inventory, security
headers, route metadata, bounded listing payload, performance receipt and
immutable clean-host proof must all be rerun against the final single Task 14
commit before completion. The controller-recorded SHA-256 of this amendment and
the exact counts above are the authority to amend that commit; they do not
authorize deployment or traffic mutation.
