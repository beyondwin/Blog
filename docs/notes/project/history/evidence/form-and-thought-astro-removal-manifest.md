# FORM & THOUGHT Astro removal manifest

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](../README.md)과 ADR을 본다.

- Frozen at branch commit: `095b894`
- Status: pre-removal proposal; no deletion is authorized by this file alone
- Scope: repository renderer/runtime and its executable verification owners only
- Recovery after removal: Git revision plus the checksum-bound immutable public release artifact
- Production authority: none; `production_cutover_authorized: false` remains immutable historical evidence

## Preserved boundaries

The following tracked inputs are retained without moving or broad staging: every file under `src/content/`, every file under `src/assets/content/`, `src/data/memory.public.json`, `AGENTS.md`, `src/AGENTS.md`, and `src/content/AGENTS.md`. Private `memory/**`, curated `docs/**`, release artifacts, framework-neutral authoring scripts, and all current `packages/contracts/**` and `packages/content/**` owners are retained unless an exact rewrite appears below. RSS is explicitly out of scope: the tracked Astro renderer has no public RSS route, feed file, package script, or accepted RSS contract.

## Added replacement owners before deletion

| Path | Replacement responsibility | Proving test |
| --- | --- | --- |
| `apps/site/app/delivery.ts` | exact public origin, absolute canonical/OG metadata, sitemap/robots/security-header contracts | `apps/site/test/delivery.test.ts` |
| `apps/site/public/site.webmanifest` | final FORM & THOUGHT install metadata | `apps/site/test/delivery.test.ts` |
| `apps/site/serve-static.ts` | React-only static host with exact 404 status and sealed response headers | `apps/site/test/static-server.test.ts`, clean-host smoke |
| `apps/site/test/static-server.test.ts` | HTTP proof for route indexes, artifacts, headers, traversal and actual 404 | itself |
| `apps/site/public/robots.txt` | generated public-path sitemap pointer and crawl policy | `apps/site/test/delivery.test.ts`, `apps/site/test/static-export.test.ts` |
| `apps/site/test/delivery.test.ts` | delivery RED/GREEN contract | itself |
| `packages/content/src/media/media-manifest.d.mts` | framework-neutral media manifest type surface | `packages/content/test/media-manifest.test.mjs` |
| `packages/content/src/media/media-manifest.d.ts` | framework-neutral media manifest declarations | workspace typecheck |
| `packages/content/src/media/media-manifest.mjs` | `parseMediaManifest` and `findMediaItem` | `packages/content/test/media-manifest.test.mjs`, `scripts/validate-media.test.mjs` |
| `packages/content/test/media-manifest.test.mjs` | parser/path/locator/lookup behavior | itself |
| `tests/e2e/performance-metrics.ts` | React-only browser measurement helper formerly coupled to parity | `tests/performance-selection.test.ts`, `tests/e2e/performance.spec.ts` |
| `docs/notes/project/evidence/form-and-thought-pre-removal-acceptance.md` | frozen pre-removal replacement, performance, visual and full-browser acceptance | exact commands and artifact hashes recorded in the document |

## Exact rewrites and retained executable owners

| Decision | Exact path | Current responsibility | Replacement/result | Proving test |
| --- | --- | --- | --- | --- |
| rewrite | `apps/site/app/root.tsx` | relative canonical metadata and document head | absolute origin canonical, OG/social metadata, icon and manifest links | `apps/site/test/delivery.test.ts`, `apps/site/test/routes.test.tsx` |
| rewrite | `apps/site/app/release.server.ts` | verified release loading and full record selection | add listing-only record projection and the exact asset subset needed by index first frames | `apps/site/test/routes.test.tsx`, `apps/site/test/static-export.test.ts` |
| rewrite | `apps/site/app/routes/home.tsx` | home route metadata | absolute canonical metadata from the sole delivery-origin authority | `apps/site/test/routes.test.tsx`, `apps/site/test/emitted-output.test.ts` |
| rewrite | `apps/site/app/routes/review.tsx` | review detail metadata | absolute canonical metadata from the sole delivery-origin authority | `apps/site/test/routes.test.tsx`, `apps/site/test/emitted-output.test.ts` |
| rewrite | `apps/site/app/routes/tag.tsx` | tag detail metadata | absolute encoded tag canonical from the sole delivery-origin authority | `apps/site/test/routes.test.tsx`, `apps/site/test/emitted-output.test.ts` |
| rewrite | `apps/site/app/routes/articles-index.tsx` | article index release payload | listing-only records and exact visible asset subset | `apps/site/test/routes.test.tsx`, `apps/site/test/static-export.test.ts`, performance matrix |
| rewrite | `apps/site/app/routes/reviews-index.tsx` | review index release payload | listing-only records and exact visible asset subset | `apps/site/test/routes.test.tsx`, `apps/site/test/static-export.test.ts`, performance matrix |
| rewrite | `apps/site/app/routes/thoughts-index.tsx` | thought index release payload | listing-only records and exact visible asset subset | `apps/site/test/routes.test.tsx`, `apps/site/test/static-export.test.ts`, performance matrix |
| rewrite | `apps/site/src/ui/articles/ArticleIndexPage.tsx` | article index accepts full article records | accept the bounded listing projection without detail-only public fields | `apps/site/test/ui/route-presentations.test.tsx`, `apps/site/test/routes.test.tsx` |
| rewrite | `apps/site/src/ui/reviews/bookshelfPresentation.ts` | review listing types expose full review records | accept the bounded review listing projection | `apps/site/test/ui/route-presentations.test.tsx`, `apps/site/test/routes.test.tsx` |
| rewrite | `apps/site/src/ui/thoughts/ThoughtIndexPage.tsx` | thought index accepts full thought records | accept the bounded thought listing projection | `apps/site/test/ui/route-presentations.test.tsx`, `apps/site/test/routes.test.tsx` |
| rewrite | `apps/site/build-static-export.ts` | verified React static export | additionally emit release-derived `sitemap.xml`, generated `robots.txt`, actual `404.html`, and static-host header policy | `apps/site/test/static-export.test.ts`, `apps/site/test/delivery.test.ts` |
| rewrite | `apps/site/package.json` | React application build and Vite preview scripts | explicit local/production delivery modes and the header-aware static host | `apps/site/test/delivery.test.ts`, `apps/site/test/static-server.test.ts`, root workspace contract |
| rewrite | `apps/site/public/favicon.svg` | current public icon | final FORM & THOUGHT icon contract | `apps/site/test/delivery.test.ts` |
| rewrite | `apps/site/test/emitted-output.test.ts` | emitted document contract with relative canonical expectations | exact absolute canonical contract for locally sealed output | itself |
| rewrite | `apps/site/test/static-export.test.ts` | fail-closed static export | adds sitemap/robots/404/security header output behavior | itself |
| rewrite | `apps/site/test/routes.test.tsx` | route and metadata contract | absolute canonical/OG and 404 route behavior | itself |
| rewrite | `scripts/validate-media.mjs` | strict media validation using legacy parser owner | imports package-owned parser | `scripts/validate-media.test.mjs`, `packages/content/test/media-manifest.test.mjs` |
| rewrite | `scripts/content-migration.test.mjs` | corpus migration plus Astro redirect assertions | package schema/parser and React release/route inventory assertions; no compatibility redirect | itself |
| rewrite | `scripts/publication-surfaces.test.mjs` | Astro publication selector source scans | release-derived route, trusted-MDX, public-memory allowlist and private-negative behavior | itself, `packages/content/test/release-boundary.test.ts` |
| rewrite | `scripts/site-content.test.mjs` | legacy Astro shell/scene/source assertions mixed with content checks | retain only framework-neutral content/media/article facts; remove superseded renderer assertions | itself |
| rewrite | `scripts/agent-check.mjs` | agent contract and public-source private-path scan including Astro | React/packages public-source boundary and current agent contract | `scripts/agent-check.test.mjs` |
| rewrite | `scripts/agent-check.test.mjs` | Astro fixture and public-source security cases | React/package fixtures while preserving top-level private-memory negative cases | itself |
| rewrite | `scripts/cutover/evidence-contracts.mts` | Astro-comparison and rollback receipt validators | React-only budget, route inventory, release and process evidence | `scripts/cutover/evidence-contracts.test.ts` |
| rewrite | `scripts/cutover/evidence-contracts.test.ts` | rollback/Astro comparison receipt tests | React-only receipt forgery and fail-closed tests | itself |
| retain | `scripts/cutover/cutover-evidence.mts` | immutable typed evidence append/read helpers | unchanged framework-neutral helper | `scripts/cutover/evidence-contracts.test.ts` |
| rewrite | `scripts/cutover/local-proxy.mts` | local selected/rollback proxy | single React public origin and security headers | `scripts/cutover/local-proxy.test.ts` |
| rewrite | `scripts/cutover/local-proxy.test.ts` | selected/rollback proxy behavior | one-origin routing and required headers | itself |
| retain | `scripts/cutover/owned-process-lifecycle.mts` | owned-child lifecycle safety | unchanged framework-neutral helper | `scripts/cutover/owned-process-lifecycle.test.ts` |
| retain | `scripts/cutover/owned-process-lifecycle.test.ts` | lifecycle safety tests | unchanged | itself |
| rewrite | `scripts/cutover/seal-performance-receipt.mts` | comparison-era performance receipt | React-only predefined budgets and route matrix | `scripts/cutover/evidence-contracts.test.ts`, `tests/e2e/performance.spec.ts` |
| rewrite | `scripts/cutover/verify-public-site.mts` | production-era Astro/parity/rollback eligibility | local React release-derived route/delivery verification only; never mutates traffic | `scripts/cutover/verify-public-site.test.ts` |
| rewrite | `scripts/cutover/verify-public-site.test.ts` | Astro removal/production rollback evidence | React-only release, inventory, delivery and authorization boundary | itself |
| rewrite | `scripts/cutover/verify-clean-host.mts` | archive-based clean-host with Astro baseline | clean install, release build/verify, site build and React HTTP/static smoke | `tests/workspace-contract.test.ts`, direct clean-host run |
| rewrite | `deploy/reverse-proxy/public-site.conf` | prepared selected React origin | sole React public origin and required security headers | `scripts/cutover/local-proxy.test.ts`, clean-host smoke |
| rewrite | `tests/workspace-contract.test.ts` | workspace, selected renderer and Astro checks | zero-Astro RED/GREEN plus React-only workspace/build contracts | itself |
| rewrite | `tests/performance-selection.test.ts` | comparison-era performance selection and budget tests | React-only predefined route matrix and absolute budgets | itself, `tests/e2e/performance.spec.ts` |
| rewrite | `vitest.config.mjs` | root test exclusions | remove deleted parity workspace assumptions; continue excluding E2E | `npm test` |
| rewrite | `package.json` | Astro/parity/rollback scripts and packages | React-only validate order and cutover scripts | `tests/workspace-contract.test.ts`, `npm run validate` |
| rewrite | `package-lock.json` | Astro and parity workspace dependency graph | npm-generated React-only graph | `npm ci`, `npm run validate` |
| rewrite | `tsconfig.json` | root compiler contract extends `astro/tsconfigs/strict` | extend `tsconfig.base.json` and keep only repository path/exclusion overrides | `tests/workspace-contract.test.ts`, `npm run typecheck:workspaces` |
| rewrite | `packages/content/test/source-records.test.ts` | public/non-public corpus truth is partly reconciled against the Astro parity fixture | assert current source/release inventory directly; `apps/site/test/routes.test.tsx` proves `fullPublicPaths()` contains every public href and excludes every non-public href | itself, `apps/site/test/routes.test.tsx` |
| rewrite | `apps/site/test/ui/route-presentations.test.tsx` | secondary presentation inventory reads the Astro parity fixture | derive expected public and non-public paths from the verified release plus `fullPublicPaths()` | itself |
| rewrite | `tests/fixtures/public/no-relations-record.json` | current public no-relations navigation fixture | point to the current verified Graphify article route | `tests/e2e/edge-cases.spec.ts` |
| rewrite | `playwright.form-thought.config.ts` | full FORM & THOUGHT React acceptance currently discovers the sealed deletion-only Storyworld spec | exclude only `tests/e2e/scene-reading-flow.spec.ts`, which remains tracked until the deletion ruling; keep replacement reading-continuity, navigation, accessibility, delivery, visual and performance suites in the full run | `npx playwright test --config=playwright.form-thought.config.ts` |
| retain | `playwright.config.ts` | general repository Playwright configuration for the current React application | unchanged; it already owns only the React application server and does not import or invoke Astro/parity/rollback code | `npx playwright test --config=playwright.config.ts --list` |
| retain | `scripts/memory/seed.mjs` | emits the stable provenance token `astro-content` for historical memory candidate compatibility | token is data provenance, not an executable Astro import/runtime dependency; changing it would rewrite existing seed identity | `scripts/memory.seed.test.mjs` |
| retain | `scripts/memory.seed.test.mjs` | seals the historical `astro-content` provenance token | unchanged; explicitly allowed historical token | itself |
| retain | `memory/sources.jsonl` | private-memory source ledger includes the historical locator `src/pages/memory.astro` | unchanged provenance data, not an executable import/script/config; private memory stays private | `npm run memory:validate` |
| retain | `src/data/memory.public.json` | approved public-memory projection includes the same historical source locator | unchanged projected provenance data, not an executable import/script/config | `npm run memory:validate`, private-boundary tests |

## E2E classification (every tracked `tests/e2e/**` path)

| Decision | Exact path | Result |
| --- | --- | --- |
| rewrite | `tests/e2e/accessibility.spec.ts` | retain current React accessibility/runtime/overflow and all-image failure acceptance; add bounded first-frame helper regression proving below-fold lazy exclusion and visible/eager failure reporting |
| rewrite | `tests/e2e/direct-and-modified-navigation.spec.ts` | current canonical transport acceptance, rebased to the verified Graphify article and current continuation label |
| rewrite | `tests/e2e/edge-cases.spec.ts` | replace migration-era parity wording with final React-only residue check |
| rewrite | `tests/e2e/form-thought-visual.spec.ts` | preserve the approved geometry evidence while using bounded first-frame readiness instead of decoding below-fold lazy images |
| rewrite | `tests/e2e/form-thought-visual.spec.ts-snapshots/article-detail-calibrated-1120x1400.png` | exact independently approved current-release detail golden, SHA-256 `1a5fc17b86c6f902f687c13df64ead0df9a035c928cbd46d9697c70cae905032` |
| rewrite | `tests/e2e/form-thought-visual.spec.ts-snapshots/articles-calibrated-1080x1440.png` | exact independently approved current-release article-index golden, SHA-256 `821c2d15cf4bc462876fe09690595feef39ffbde394be39f5a19b562d76bf486` |
| retain | `tests/e2e/form-thought-visual.spec.ts-snapshots/home-calibrated-1440x1080.png` | approved immutable golden |
| retain | `tests/e2e/mobile-navigation.spec.ts` | current React mobile menu acceptance |
| rewrite | `tests/e2e/no-js.spec.ts` | retain canonical/no-JS tests and add static sitemap/robots/404 behavior |
| rewrite | `tests/e2e/performance-selection.ts` | React-only full matrix: home, articles, reviews, thoughts, search and one detail per primary lane |
| rewrite | `tests/e2e/performance.spec.ts` | absolute budgets for desktop/mobile LCP, CLS, JS gzip, fonts and first-frame images; no Astro comparison |
| rewrite | `tests/e2e/reading-continuity.spec.ts` | remove retired scene origin; preserve current tag/search/list origin-return flows |
| delete | `tests/e2e/scene-reading-flow.spec.ts` | only tests removed Storyworld/Continuity Zoom runtime; replacement is home/navigation/detail current suites |
| rewrite | `tests/e2e/search-return.spec.ts` | current React search origin-return acceptance with absolute canonical assertion |
| rewrite | `tests/e2e/support.ts` | retain current React server/route helpers and add bounded viewport-intersecting/explicit-eager image readiness without waiting on below-fold lazy images |

## Exact parity, rollback, Astro renderer, and obsolete-test deletions

Every path below is an exact deletion. Its responsibility is obsolete only after the replacement rows above are green.

### Astro configuration, renderer source, and legacy renderer tests

Replacement owners are `packages/content`, `packages/contracts`, `apps/site`, current E2E suites, and the React release/private-boundary tests named above.

```text
astro.config.mjs
src/content.config.ts
src/components/ArticleBriefTable.astro
src/components/Callout.astro
src/components/EmptyLane.astro
src/components/Figure.astro
src/components/PublicScene.astro
src/components/PublicSceneObject.astro
src/components/SiteFooter.astro
src/components/SiteHeader.astro
src/layouts/AnalysisLayout.astro
src/layouts/ArticleLayout.astro
src/layouts/BaseLayout.astro
src/layouts/ReviewLayout.astro
src/pages/analysis/[slug].astro
src/pages/analysis/index.astro
src/pages/articles/[slug].astro
src/pages/articles/index.astro
src/pages/ideas/[slug].astro
src/pages/ideas/index.astro
src/pages/index.astro
src/pages/memory.astro
src/pages/memory/[slug].astro
src/pages/memory/map.astro
src/pages/reviews/[slug].astro
src/pages/reviews/index.astro
src/pages/search/index.astro
src/pages/tags/[tag].astro
src/pages/tags/index.astro
src/pages/travel/[slug].astro
src/pages/travel/index.astro
src/styles/global.css
src/styles/press.css
src/styles/press.tokens.test.mjs
src/styles/storyworld.css
```

### Legacy `src/lib` implementation and tests

`parseMediaManifest`/`findMediaItem` move first to the package owner listed above. Public selection, schema, release, MDX, media, memory projection and presentation are already owned by `packages/content`, `packages/contracts`, and `apps/site`; current package/site tests prove those replacements.

```text
src/lib/bookshelfPresentation.test.mjs
src/lib/bookshelfPresentation.ts
src/lib/content.ts
src/lib/content/contracts.test.ts
src/lib/content/contracts.ts
src/lib/content/figureContext.test.ts
src/lib/content/figureContext.ts
src/lib/content/figurePresentation.test.ts
src/lib/content/figurePresentation.ts
src/lib/content/mediaManifest.d.mts
src/lib/content/mediaManifest.d.ts
src/lib/content/mediaManifest.mjs
src/lib/content/mediaManifest.test.mjs
src/lib/content/mediaManifest.typecheck.ts
src/lib/content/mediaRegistry.test.ts
src/lib/content/mediaRegistry.ts
src/lib/content/publication.test.ts
src/lib/content/publication.ts
src/lib/content/publicationState.ts
src/lib/content/viewModels.test.ts
src/lib/content/viewModels.ts
src/lib/homeData.ts
src/lib/indexPresentation.test.mjs
src/lib/indexPresentation.ts
src/lib/memory/articleLinks.test.mjs
src/lib/memory/articleLinks.ts
src/lib/memory/contentLinks.test.mjs
src/lib/memory/contentLinks.ts
src/lib/memory/filters.test.mjs
src/lib/memory/filters.ts
src/lib/memory/graphModel.test.mjs
src/lib/memory/graphModel.ts
src/lib/memory/index.ts
src/lib/memory/lookup.test.mjs
src/lib/memory/lookup.ts
src/lib/memory/pagePayload.test.mjs
src/lib/memory/pagePayload.ts
src/lib/memory/publicData.test.mjs
src/lib/memory/publicData.ts
src/lib/memory/reading.test.mjs
src/lib/memory/reading.ts
src/lib/memory/testFixture.mjs
src/lib/memoryData.test.mjs
src/lib/memoryData.ts
src/lib/recordsPresentation.test.mjs
src/lib/recordsPresentation.ts
src/lib/scenes/judgmentScene.ts
src/lib/scenes/publicScene.test.ts
src/lib/scenes/publicScene.ts
src/lib/scenes/sceneState.test.ts
src/lib/scenes/sceneState.ts
src/lib/searchData.ts
src/lib/searchPresentation.test.mjs
src/lib/searchPresentation.ts
src/lib/siteChrome.test.ts
src/lib/siteChrome.ts
```

### Parity tools and fixtures

The accepted renderer selection evidence under `docs/notes/project/evidence/` remains immutable historical documentation. Executable comparison machinery is replaced by React-only delivery/performance owners.

```text
tools/parity/package.json
tools/parity/src/capture-astro-baseline.ts
tools/parity/src/capture-renderer.ts
tools/parity/src/compare-contracts.ts
tools/parity/src/html-contract.ts
tools/parity/src/measure-browser.ts
tools/parity/src/promotion-contract.ts
tools/parity/src/renderer-layouts.ts
tools/parity/src/route-inventory.ts
tools/parity/src/select-renderer.ts
tools/parity/src/serve-static.ts
tools/parity/src/verify-promotion.ts
tools/parity/test/compare-contracts.test.ts
tools/parity/test/html-contract.test.ts
tools/parity/test/promotion-contract.test.ts
tools/parity/test/renderer-boundaries.test.ts
tools/parity/test/renderer-cli.test.ts
tools/parity/test/renderer-harness.test.ts
tools/parity/test/route-inventory.test.ts
tools/parity/test/select-renderer.test.ts
tools/parity/tsconfig.json
tests/fixtures/parity/astro-public-baseline.json
tests/fixtures/parity/astro-renderer-baseline.json
tests/fixtures/parity/renderer-report-next-one-win.json
tests/fixtures/parity/renderer-report-pass.json
```

### Rollback-only executable owners

```text
deploy/reverse-proxy/public-site-rollback.conf
scripts/cutover/verify-rollback.mts
scripts/cutover/verify-rollback.test.ts
```

## Package-script classification

- Delete scripts: `legacy:dev`, `legacy:build`, `legacy:preview`, `parity:capture:astro`, `parity:capture:renderer`, `parity:compare-renderers`, `parity:select-renderer`, `parity:verify-selection`, `cutover:rollback`.
- Retain scripts: `site:dev`, `site:build` (explicit reserved local/test origin), `site:preview`, `site:test`, `public-release:build`, `public-release:verify`, `public-release:clean-test`, `cutover:proxy`, `cutover:clean-host`, `cutover:seal-performance`, `cutover:verify`, `sync`, `content:new`, `article:new`, `article:quality`, `memory:seed`, `memory:review`, `memory:project`, `memory:validate`, `media:validate`, `agent:check`.
- Add script: `site:build:production` invokes the production build mode and fails closed unless `FORM_THOUGHT_SITE_ORIGIN` is an exact non-reserved HTTPS origin; `apps/site/test/delivery.test.ts` proves the local/production split.
- Rewrite scripts: `test` remains root Vitest; `test:workspaces` drops `tools/parity/test`; `typecheck:workspaces` remains; `validate:migration` is renamed/reframed if retained; `validate` becomes ordered agent/content/media/article/memory/workspace/typecheck/release build/release verify/release clean-test/site build.
- Remove dependencies: `astro`, `@astrojs/mdx`, `@astrojs/check`; retain all currently used React/content/test dependencies.

## Sealing rule

Deletion may begin only after: (1) the replacement files and focused tests are green, (2) release build/verify, site build and the full FORM & THOUGHT Playwright suite pass while Astro still exists, (3) the pre-removal acceptance document records the defined budgets and measured results, and (4) the controller records an explicit ledger ruling that this exact manifest is complete. Any new deletion discovered later requires an amended exact path plus controller ruling before removal.
