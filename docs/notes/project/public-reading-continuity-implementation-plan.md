# Public reading continuity React migration implementation plan

> **Required subskill:** Execute this plan with `superpowers:subagent-driven-development`; use a fresh implementation agent per task and an independent reviewer after Tasks 4, 8, 13, and 16.

**Goal:** Replace the Astro public renderer with one measured React renderer and ship one intuitive visual/navigation system from scene or collection entry through reading, continuation, and contextual return.

**Architecture:** Preserve Astro as a read-only parity and rollback baseline while extracting a framework-neutral public release. Build the same four-route current-behavior slice in Next.js App Router and React Router Framework Mode, select one through a deterministic quality gate, promote only the winner to `apps/site`, then implement the approved redesign once. Expand every public route, shadow-verify, cut over, observe, and only then delete Astro.

**Tech stack:** Node 24, npm workspaces, TypeScript 6 during Astro coexistence, React 19, Vitest, Playwright, MDX 3, Zod 4, Sharp; temporary Next.js 16 and React Router 8 renderer candidates.

**Specs:** [ADR-0005](adr/0005-node-react-modular-monolith.md), [ADR-0006](adr/0006-unified-public-reading-continuity.md), [Node/React design](node-react-modular-monolith-design.md), [approved reading-continuity design](public-reading-continuity-design.md).

## Global constraints

- Do not add the redesigned reading UI, new chrome, or navigation context to Astro. Astro may receive only instrumentation required to capture baseline evidence.
- Preserve all pre-existing dirty files and untracked research screenshots. Never clean, overwrite, stage, or commit unrelated work.
- Do not publish, delete, or change the status of any content record. Public selection remains `published && !draft`.
- Public build code may read `src/data/memory.public.json`; it must never read top-level `memory/**`.
- Do not implement Studio, Fastify, PostgreSQL, jobs, RAG, or authentication in this plan. Deployment configuration may be prepared, but no external production mutation occurs without explicit authorization.
- External production cutover is a separate user-impacting action and requires explicit authorization at execution time. Local shadow, rollback, and clean-host evidence may be prepared without that authority.
- Do not delete Astro until the Task 15 evidence record contains a successful cutover, rollback drill, clean-host restore, and completed observation window.
- Every behavior task follows RED → confirm failure → minimal GREEN → focused regression. Run `git diff --check` at every review boundary.
- The commit commands below are conditional. Run them only if the user explicitly authorizes commits during execution; otherwise leave verified changes uncommitted.
- Use Node `24.x`. Use exact dependency versions, never `latest`, caret, or tilde ranges in new workspace manifests.

## Version pins and source check

Registry values verified on 2026-08-23:

| Package | Pin |
| --- | --- |
| `next` | `16.3.2` |
| `react`, `react-dom` | `19.2.8` |
| `react-router`, `@react-router/dev` | `8.3.0` |
| `vite` | `8.2.2` |
| `typescript` | `6.0.3` while Astro remains; TypeScript 7 is a post-Astro compatibility decision, not part of this plan |
| `vitest` | `4.1.11` |
| `@playwright/test` | `1.62.1` |
| `@axe-core/playwright` | `4.13.0` |
| `@mdx-js/mdx`, `@mdx-js/react` | `3.1.1` |
| `remark-gfm` | `4.0.1` |
| `rehype-slug` | `6.0.0` |
| `gray-matter` | `2.0.1` during parity migration |
| `yaml` | `2.9.0` |
| `zod` | `4.4.3` |
| `sharp` | `0.35.3` |
| `tsx` | `4.23.12` |
| `parse5` | `8.0.1` |
| `@types/node` | `24.13.3` |
| `@types/react` | `19.2.18` |
| `@types/react-dom` | `19.2.4` |

Before installing, run the exact registry check below and compare every line with this table:

```bash
npm view next version
npm view react version
npm view react-dom version
npm view react-router version
npm view @react-router/dev version
npm view vite version
npm view typescript@6 version
npm view vitest version
npm view @playwright/test version
npm view @axe-core/playwright version
npm view @mdx-js/mdx version
npm view @mdx-js/react version
npm view remark-gfm version
npm view rehype-slug version
npm view gray-matter@2.0.1 version
npm view yaml@2.9.0 version
npm view zod version
npm view sharp version
npm view tsx version
npm view parse5 version
npm view @types/node@24 version
npm view @types/react version
npm view @types/react-dom version
```

A newer version is not permission to update the pin; record drift in the task log and keep the approved pins unless compatibility evidence requires an ADR amendment.

## Quality gates

### Task 8 renderer-selection gate

The following mandatory checks apply only to the four decision routes (`/`, `/articles/why-i-read-in-the-ai-era/`, `/reviews/black-swan/`, `/memory/agent-harnesses-are-operating-systems/`) before a renderer can be selected:

- Identical scoped route contract: canonical URL, title, description, Open Graph fields, headings, normalized body text, link destinations, selected public records, and selected public-memory record.
- All canonical anchors work with JavaScript disabled and with modified/new-tab clicks.
- Media has width, height, `srcset`, sizes, alt, provenance, and no broken asset.
- Zero hydration errors, console errors, serious/critical axe findings, private-path leaks, or viewport overflow at 390px and 426px.
- The accepted numeric CLS, LCP, JavaScript, image, and build-reproducibility budgets pass. The values below are proposed until Task 5 records baseline variance and the user approves them through an ADR-0005 amendment.

If only one renderer passes, select it. If both pass, Next.js must win at least two of these four categories to remain selected:

1. Median LCP improves by at least 10% and 75ms.
2. Initial JavaScript gzip is at least 15% and 10 KiB smaller.
3. Representative responsive-image transfer is at least 15% smaller at equal displayed dimensions and format.
4. Three clean builds produce the same route/asset contract with at least 20% lower median build time.

If Next.js does not win two categories, select React Router Framework Mode. The selector script must make this decision from the report; no manual preference override is allowed without a new ADR.

### Task 13/15 full cutover gate

After route expansion, the selected renderer must match the Astro baseline's entire public route inventory, canonical/metadata/body/link/image contracts, published inventory, and public-memory inventory. Full-inventory parity is not a Task 8 prerequisite because the candidates intentionally implement only four decision routes.

---

## Task 1: Freeze the Astro public baseline

**Files**

- Create: `tools/parity/src/route-inventory.ts`
- Create: `tools/parity/src/capture-astro-baseline.ts`
- Create: `tools/parity/src/html-contract.ts`
- Create: `tools/parity/test/route-inventory.test.ts`
- Create: `tools/parity/test/html-contract.test.ts`
- Create: `tests/fixtures/parity/astro-public-baseline.json`
- Modify: `package.json`

**Step 1 — Write the failing inventory test**

```ts
import { describe, expect, it } from 'vitest';
import { buildPublicRouteInventory } from '../src/route-inventory';

describe('Astro public route inventory', () => {
  it('contains every required route family and no draft records', async () => {
    const inventory = await buildPublicRouteInventory(process.cwd());
    expect(inventory.routes).toContain('/');
    expect(inventory.routes).toContain('/articles/why-i-read-in-the-ai-era/');
    expect(inventory.routes).toContain('/reviews/black-swan/');
    expect(inventory.routes).toContain('/memory/');
    expect(inventory.routes.some((route) => route.includes('example-article'))).toBe(false);
  });
});
```

Run `npx vitest run tools/parity/test/route-inventory.test.ts`. Expected: FAIL because the module does not exist.

**Step 2 — Build and capture the current site**

- Add `legacy:build`, `legacy:dev`, `legacy:preview`, and `parity:capture:astro` scripts without changing the existing `build` or `validate` behavior yet.
- Make `capture-astro-baseline.ts` run after `npm run legacy:build`, walk `dist/**/*.html`, parse with `parse5`, and store stable contracts rather than full HTML.
- Each route record must contain path, canonical, title, description, headings, normalized body text hash, internal hrefs, image attributes, and output asset paths.

Run:

```bash
npm run legacy:build
npm run parity:capture:astro
npx vitest run tools/parity/test/route-inventory.test.ts tools/parity/test/html-contract.test.ts
```

Expected: PASS and `tests/fixtures/parity/astro-public-baseline.json` contains all built routes.

**Step 3 — Prove the fixture detects drift**

Temporarily change one expected title in the test fixture through the test setup, not the checked-in fixture. Confirm the contract test fails with the route and field name, then revert the test-only mutation.

**Step 4 — Review boundary**

Run `git diff --check` and inspect only Task 1 files. If commit authority exists:

```bash
git add package.json tools/parity tests/fixtures/parity/astro-public-baseline.json
git commit -m "test: freeze Astro public parity baseline"
```

## Task 2: Introduce Node 24 workspaces without moving Astro

**Files**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/content/package.json`
- Create: `packages/content/tsconfig.json`
- Create: `tools/parity/package.json`
- Create: `tests/workspace-contract.test.ts`

**Step 1 — Write the failing workspace test**

Assert that root workspaces are exactly `apps/*`, `packages/*`, `spikes/*`, and `tools/*`; every manifest is private; Node is `>=24 <25`; new version strings have no range prefix; and no public package declares Astro.

Run `npx vitest run tests/workspace-contract.test.ts`. Expected: FAIL because workspaces and manifests do not exist.

**Step 2 — Add manifests and pinned tools**

- Keep Astro dependencies at root during migration.
- Add the pinned TypeScript 6, Vitest, Playwright, axe, parse5, and tsx tooling. Keep TypeScript 6 until Astro has been removed because `@astrojs/check` currently peers on TypeScript 5 or 6.
- Add `test:workspaces`, `typecheck:workspaces`, and `validate:migration` scripts.
- Do not add Nx or Turborepo.

Run `npm install --package-lock-only`, then `npm ci` to prove the lockfile is complete.

**Step 3 — Pass the workspace gate**

Run:

```bash
npx vitest run tests/workspace-contract.test.ts
npm run agent:check
npm run legacy:build
```

Expected: all PASS; the original Astro output remains buildable.

**Step 4 — Review boundary**

Run `git diff --check`. If commit authority exists, commit as `build: introduce Node 24 public-site workspaces`.

## Task 3: Extract framework-neutral public contracts

**Files**

- Create: `packages/contracts/src/content.ts`
- Create: `packages/contracts/src/media.ts`
- Create: `packages/contracts/src/public-release.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/content.test.ts`
- Create: `packages/contracts/test/public-release.test.ts`
- Create: `packages/content/src/schemas.ts`
- Create: `packages/content/src/source-records.ts`
- Create: `packages/content/test/source-records.test.ts`

**Step 1 — Write RED tests for defaults and allowlists**

```ts
it('normalizes missing draft to false and strips private fields', () => {
  const parsed = parseSourceRecord({
    collection: 'articles', id: 'safe', title: 'Safe', description: 'Safe',
    createdAt: '2026-08-23', updatedAt: '2026-08-23', status: 'published',
    privatePath: '/Users/user/private/source.md', jobPrompt: 'secret',
  });
  expect(parsed.draft).toBe(false);
  expect('privatePath' in parsed).toBe(false);
});

it('publishes only published and non-draft records', () => {
  expect(isPublicRecord({ status: 'published', draft: false })).toBe(true);
  expect(isPublicRecord({ status: 'review', draft: false })).toBe(false);
  expect(isPublicRecord({ status: 'published', draft: true })).toBe(false);
});
```

Run `npx vitest run packages/contracts/test packages/content/test/source-records.test.ts`. Expected: FAIL.

**Step 2 — Implement exact public types**

`PublicRecord` is a collection-discriminated union. Every variant contains collection, id, href, title, description, ISO dates, tags, resolved media, approved relationships, public-memory links, and body HTML, then only these collection fields:

- `articles`: `recordKind`, `evidenceState`, `featuredMedia`.
- `reviews`: `itemType`, public author list, `isbn13`, `editionLabel`, `readEditionVerified`, `publisher`, `coverState`, `coverMedia`, `verdict`, `rating`, `completedAt`, `sourceUrl`.
- `analysis`: `sourceTitle`, `sourceUrl`, `comment`, `format`.
- `ideas`: `maturity`, public `prompt` only when the existing Astro route renders it.
- `travel`: public `location`, `visitedAt`, `leadMedia`; coordinates appear only when the existing publication contract marks them safe, and the default is omission.
- `memory`: projection-only claim, body, public topics/theses, safe public sources, and companion relations from `src/data/memory.public.json`.

It must not contain filesystem paths, raw prompts from ingestion/AI jobs, raw source bytes, embeddings, job payloads, or private memory records. Each allowed field needs a fixture proving a current public render use and a sibling negative fixture proving unknown/private keys are stripped. Add an analysis fixture that preserves `sourceTitle`, `sourceUrl`, and `format`; Task 13 must assert the analysis source colophon survives parity.

**Step 3 — Parse the existing corpus without Astro imports**

- Use `gray-matter`, Zod, `node:fs/promises`, and `node:path`.
- Reproduce collection-specific defaults from `src/content.config.ts` and `src/lib/content/contracts.ts`.
- Read only `src/content/**`, `src/assets/content/**`, and `src/data/memory.public.json`.
- Keep the Astro source untouched for baseline comparability.

Run focused tests, then compare record counts and publication IDs to `tests/fixtures/parity/astro-public-baseline.json`.

**Step 4 — Negative boundary test**

Create an in-memory malicious fixture containing `privatePath`, `jobPrompt`, `embedding`, and a `memory/**` locator. Assert none survive `JSON.stringify(publicRecord)`. Do not create or read a real private-memory fixture.

**Step 5 — Review boundary**

Run typecheck, focused tests, `npm run legacy:build`, and `git diff --check`. If authorized, commit as `feat: extract framework-neutral public contracts`.

## Task 4: Build an immutable filesystem public release

**Files**

- Create: `packages/content/src/mdx/render.tsx`
- Create: `packages/content/src/mdx/components.tsx`
- Create: `packages/content/src/media/build-responsive-media.ts`
- Create: `packages/content/src/release/build-release.ts`
- Create: `packages/content/src/release/read-release.ts`
- Create: `packages/content/src/cli.ts`
- Create: `packages/content/test/mdx-render.test.tsx`
- Create: `packages/content/test/build-release.test.ts`
- Create: `packages/content/test/release-boundary.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Step 1 — Write failing release tests**

Test that the same source bytes produce the same release ID, a changed public field changes the ID, figures emit width/height/srcset/alt/provenance, Callout renders semantic `<aside>`, and the active pointer refers to an immutable directory.

```ts
expect(first.releaseId).toBe(second.releaseId);
expect(first.records['articles/why-i-read-in-the-ai-era'].bodyHtml)
  .toContain('<figure');
expect(firstJson).not.toMatch(/\/Users\/|memory\/thoughts|embedding|jobPrompt|rawPrompt/i);
```

Run `npx vitest run packages/content/test/build-release.test.ts`. Expected: FAIL.

**Step 2 — Render trusted repository MDX at build time**

- Compile with MDX 3, `remark-gfm`, and `rehype-slug`, then render with `react-dom/server` inside the release builder so tables and heading anchors retain current public behavior.
- Support only the existing `Figure` and `Callout` components.
- Reject imports, exports, unknown JSX components, script/style tags, and JavaScript expressions outside the allowed component props.
- Never ship the MDX compiler to the browser.

**Step 3 — Produce renderer-neutral responsive media**

- Use Sharp to emit AVIF/WebP/original fallbacks at the widths already required by the content figure and cover contracts.
- Preserve manifest alt, caption, credit, provenance URL, source checksum, and original dimensions.
- Store generated public assets under the computed `build/public-releases/${releaseId}/assets/` directory and records under its `manifest.json`.
- Store only `{ "releaseId": "...", "path": "..." }` in `build/public-releases/active.json`; `path` is a validated relative child of `build/public-releases/`, never absolute and never containing traversal.
- Activate by writing and fsyncing `active.json.tmp`, atomically renaming it over `active.json`, then fsyncing the parent directory. A reader validates that the referenced directory and manifest exist and that both manifest and pointer carry the same release ID.
- Test partial pointer, nonexistent release, absolute/traversal path, and release-ID mismatch rejection. Simulate a crash before rename and assert the previous pointer remains readable; after rename, readers must see only the complete new release.

**Step 4 — Add deterministic scripts**

Add `public-release:build`, `public-release:verify`, and `public-release:clean-test`. The cleanup test may delete only a root returned by `fs.mkdtemp()` inside the test; it must reject `build/public-releases/`, the active pointer, rollback artifacts, the repository root, home, and any caller-supplied non-test directory. Ignore generated `build/public-releases/`, but keep test fixtures tracked.

Run:

```bash
npm run public-release:build
npm run public-release:verify
npx vitest run packages/content/test
```

Expected: PASS, deterministic release ID across two builds, zero private boundary hits.

**Step 5 — Independent review**

Reviewer checks source allowlists, MDX rejection cases, public-memory boundary, media parity, and hash inputs. Fix findings before proceeding. If authorized, commit as `feat: build immutable public release artifact`.

## Task 5: Create the renderer comparison harness

**Files**

- Create: `tools/parity/src/serve-static.ts`
- Create: `tools/parity/src/capture-renderer.ts`
- Create: `tools/parity/src/measure-browser.ts`
- Create: `tools/parity/src/compare-contracts.ts`
- Create: `tools/parity/src/select-renderer.ts`
- Create: `tools/parity/test/compare-contracts.test.ts`
- Create: `tools/parity/test/select-renderer.test.ts`
- Create: `tests/fixtures/parity/renderer-report-pass.json`
- Create: `tests/fixtures/parity/renderer-report-next-one-win.json`

**Step 1 — RED-test selection rules**

Test three cases: only Next mandatory-pass selects Next; both pass and Next wins one category selects React Router; both pass and Next wins two selects Next.

```ts
expect(selectRenderer(reportWithOneNextWin)).toEqual({ winner: 'react-router' });
expect(selectRenderer(reportWithTwoNextWins)).toEqual({ winner: 'next' });
```

Run focused tests. Expected: FAIL.

**Step 2 — Implement stable HTML and browser comparison**

- Compare the four decision routes only: `/`, `/articles/why-i-read-in-the-ai-era/`, `/reviews/black-swan/`, and `/memory/agent-harnesses-are-operating-systems/`.
- Normalize framework-generated IDs and asset hashes, but never normalize semantic content, hrefs, image dimensions, canonical metadata, or headings.
- After one discarded warm-up, measure five cold production samples per route at desktop 1440×960 and mobile 390×844 for each report run.
- Record gzip JS bytes, image bytes, LCP, CLS, console, hydration, axe, overflow, build duration, and artifact hash.

**Step 3 — Prove failure messages are actionable**

Fixture-test title mismatch, missing no-JS href, one serious axe issue, and a private path leak. Each failure must name renderer, route, viewport, metric, expected, and actual.

**Step 4 — Measure and approve numeric budgets**

- Pin the Playwright Chromium version from `package-lock.json` and record it in the comparison evidence.
- Use a fresh browser context and empty HTTP cache for each sample, run one discarded warm-up, then record five samples per route/viewport and compare medians.
- Record median absolute deviation. A metric can count as a renderer advantage only when the winning margin exceeds both the proposed threshold and twice the larger candidate's median absolute deviation.
- Capture the Astro baseline first, then present the proposed `CLS <= 0.05`, `LCP <= Astro + 10%`, detail-route initial JavaScript `<= 110 KiB gzip`, and four advantage thresholds from the Quality gates section.
- Before Task 6, obtain explicit user approval for those numeric budgets and amend ADR-0005's open question with the accepted values and protocol. Until then the report is measurement-only and renderer selection is blocked.

**Step 5 — Review boundary**

Run tests and `git diff --check`. If authorized, commit as `test: add deterministic renderer quality gate`.

## Task 6: Build the Next.js current-behavior decision slice

**Files**

- Create: `spikes/site-next/package.json`
- Create: `spikes/site-next/next.config.ts`
- Create: `spikes/site-next/tsconfig.json`
- Create: `spikes/site-next/app/layout.tsx`
- Create: `spikes/site-next/app/page.tsx`
- Create: `spikes/site-next/app/articles/[slug]/page.tsx`
- Create: `spikes/site-next/app/reviews/[slug]/page.tsx`
- Create: `spikes/site-next/app/memory/[slug]/page.tsx`
- Create: `spikes/site-next/app/current-parity.css`
- Create: `spikes/site-next/test/routes.test.tsx`

**Step 1 — RED-test the four route adapters**

Assert each adapter reads the active public release, returns static params for public records only, emits clean canonical metadata, and hands the record to candidate-local pure presentation without reading `src/content` directly.

**Step 2 — Configure static export**

Use `output: 'export'`, `trailingSlash: true`, and no Route Handlers, Server Actions, ISR, cookies, headers, rewrites, or default image optimizer. Use plain responsive image contracts from the release.

**Step 3 — Implement current behavior only**

- Port only enough existing Storyworld/press presentation to make the comparison fair.
- Do not add ReadingThreshold, ContextReturn, ContinueReading, unified chrome, or the approved new tokens.
- Use `generateStaticParams()` for all three dynamic route families.

Run:

```bash
npm run public-release:build
npm run build --workspace @beyondwin/site-next-spike
npx vitest run spikes/site-next/test
```

Expected: static output for exactly the four route shapes and no runtime server dependency.

**Step 4 — Capture report input**

Run the parity harness against the Next output. Fix mandatory parity errors only; do not visually redesign. If authorized, commit as `spike: render public parity slice with Next`.

## Task 7: Build the React Router current-behavior decision slice

**Files**

- Create: `spikes/site-react-router/package.json`
- Create: `spikes/site-react-router/react-router.config.ts`
- Create: `spikes/site-react-router/vite.config.ts`
- Create: `spikes/site-react-router/tsconfig.json`
- Create: `spikes/site-react-router/app/root.tsx`
- Create: `spikes/site-react-router/app/routes.ts`
- Create: `spikes/site-react-router/app/routes/home.tsx`
- Create: `spikes/site-react-router/app/routes/article.tsx`
- Create: `spikes/site-react-router/app/routes/review.tsx`
- Create: `spikes/site-react-router/app/routes/memory.tsx`
- Create: `spikes/site-react-router/app/current-parity.css`
- Create: `spikes/site-react-router/test/routes.test.tsx`

**Step 1 — RED-test the same route contract**

Use the same assertions as Task 6 against React Router loaders/meta functions and public release access.

**Step 2 — Configure full static prerender**

Set `ssr: false` and return every decision-slice URL from `prerender()` using the active release manifest. Configure explicit routes with `@react-router/dev/routes`; do not introduce file-route conventions or a runtime server.

**Step 3 — Implement current behavior only**

Keep semantic markup and CSS inputs equivalent to the Next slice. Canonical links remain normal anchors under no-JS. Do not add the redesign.

Run build, focused tests, and the parity capture. Fix mandatory parity errors only.

**Step 4 — Review boundary**

Run `git diff --check`. If authorized, commit as `spike: render public parity slice with React Router`.

## Task 8: Select and promote exactly one renderer

**Files**

- Create: `docs/notes/project/evidence/public-renderer-comparison.md`
- Create: `docs/notes/project/evidence/public-renderer-report.json`
- Modify: `docs/notes/project/adr/0005-node-react-modular-monolith.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Move one: `spikes/site-next/` or `spikes/site-react-router/` → `apps/site/`
- Move the loser out of the active workspace to `spikes/rejected/site-next/` or `spikes/rejected/site-react-router/`; delete it only with explicit user cleanup authorization

**Step 1 — Run the full report three times**

```bash
npm run parity:compare-renderers
npm run parity:compare-renderers
npm run parity:compare-renderers
npm run parity:select-renderer
```

Expected: identical winner and no mandatory failure. Do not proceed on flaky selection.

**Step 2 — Record the decision**

The evidence note must include machine/Node/browser versions, release ID, route set, all five samples from each of three report runs, mandatory results, variance and advantage calculations, selected renderer, rejected renderer, and exact commands.

Update ADR-0005's open renderer question with the measured result; do not rewrite its historical alternatives.

**Step 3 — Promote the winner**

- If winner is Next: move `spikes/site-next` to `apps/site`; move `spikes/site-react-router` to `spikes/rejected/site-react-router`; remove React Router-only dependencies from active manifests/lockfile.
- If winner is React Router: move `spikes/site-react-router` to `apps/site`; move `spikes/site-next` to `spikes/rejected/site-next`; remove Next-only dependencies from active manifests/lockfile.
- Rename the selected package to `@beyondwin/site` and root scripts to `site:dev`, `site:build`, `site:preview`, and `site:test`.
- Keep Astro root scripts under `legacy:*` only.
- `spikes/rejected/` is not a workspace and is excluded from build/test scripts. The report records its exact files and source hash. Deleting this rejected evidence requires an explicit cleanup request; winner promotion does not imply deletion authority.

Use `apply_patch` for manifest/dependency pruning and verify the exact target list first. Never use a broad cleanup command.

**Step 4 — Independent review**

Reviewer reruns selection from the JSON report, confirms no preference override, and checks the losing framework is absent from manifests and lockfile. If authorized, commit as `build: select measured public React renderer`.

## Task 9: Implement safe reading-origin navigation

**Files**

- Create: `apps/site/src/ui/navigation/origin.ts`
- Create: `apps/site/src/ui/navigation/fallback.ts`
- Create: `apps/site/src/ui/navigation/transport.ts`
- Create: `apps/site/src/ui/navigation/OriginLink.tsx`
- Create: `apps/site/test/ui/origin.test.ts`
- Create: `apps/site/test/ui/fallback.test.ts`
- Create: `apps/site/test/ui/transport.test.ts`

**Step 1 — RED-test the approved union**

Cover scene, articles, reviews, search, analysis, ideas, travel, tags, invalid kind, query over 120 characters, unsafe IDs, arbitrary URL injection, modified click, new tab, and missing predecessor.

```ts
expect(parseOrigin({ kind: 'search', query: 'AI', anchorId: 'result-2' }))
  .toEqual({ kind: 'search', query: 'AI', anchorId: 'result-2' });
expect(parseOrigin({ kind: 'search', query: 'x'.repeat(121), anchorId: 'a' }))
  .toBeNull();
expect(parseOrigin({ kind: 'articles', anchorId: 'a', returnUrl: 'https://evil.test' }))
  .toEqual({ kind: 'articles', anchorId: 'a' });
```

**Step 2 — Implement bounded transport**

- Canonical anchor `href` is always the clean content URL.
- `OriginLink` defines and stores this exact session record:

  ```ts
  type StoredOrigin = {
    origin: ReadingOrigin;
    targetPath: string;
    issuedAt: number;
  };
  ```

- Only an unmodified primary-button same-tab internal click may create a cryptographically random 128-bit token, store the record at `sessionStorage["bw:origin:" + token]`, and add `__bw_from`, bounded origin fields, and `__bw_token` to the document navigation.
- Detail bootstrap validates the origin schema, requires the stored `targetPath` to equal the clean destination pathname, and requires `issuedAt` to be no more than 10 minutes old. It then writes `history.state.bwOrigin` plus `history.state.bwHistoryReturnEligible = true`, deletes the session record for one-time consumption, and removes temporary parameters with `replaceState`. The validated history-state marker, not the deleted token, is the durable same-tab return proof across refresh.
- Same-origin referrer is a supporting signal, not an authentication dependency. A missing Referrer header does not block a valid, target-bound, unexpired session record.
- Missing, expired, mismatched, or reused token; refreshed/copied contextual URL; invalid payload; or unavailable session storage all fall back to the record's collection.
- Explicit return calls `history.back()` only when the current entry has validated `bwOrigin` and `bwHistoryReturnEligible: true`; otherwise it follows the derived safe fallback. Referrer may be logged as a supporting signal but is not the return gate.
- Never carry origin state into a continuation link.

**Step 3 — Pass unit and DOM tests**

Test no-JS by rendering `OriginLink` to static markup and asserting the clean href. Test modified clicks without mocking router APIs. Add RED/GREEN cases for target mismatch, 10-minute expiry boundary, one-time consumption, refresh, copied contextual URL, missing referrer, and storage denial.

**Step 4 — Review boundary**

Run focused tests, typecheck, and `git diff --check`. If authorized, commit as `feat: add safe contextual reading origin`.

## Task 10: Build the shared visual tokens, chrome, and mobile navigation

**Files**

- Create: `apps/site/src/ui/styles/tokens.css`
- Create: `apps/site/src/ui/styles/shell.css`
- Create: `apps/site/src/ui/components/SiteShell.tsx`
- Create: `apps/site/src/ui/components/SiteHeader.tsx`
- Create: `apps/site/src/ui/components/SiteFooter.tsx`
- Create: `apps/site/src/ui/components/MobileNavigation.tsx`
- Create: `apps/site/test/ui/site-header.test.tsx`
- Delete after replacement: `apps/site/app/current-parity.css`
- Create: `tests/e2e/mobile-navigation.spec.ts`

**Step 1 — RED-test chrome semantics**

Assert `장면 · 글 · 책 · 찾기`, one `nav` label, semantic button with `aria-expanded`, route-specific `aria-current`, a 44px minimum target class, and no `+` mark, crop marks, or CMYK production bar.

**Step 2 — Implement two modes in one shell**

- Tokens: mineral `#F2F4F7`, white `#FFFFFF`, ink `#151619`, cobalt `#2B63E8`.
- `SiteShell` accepts only `mode: 'scene' | 'reading'` and current public section.
- Mobile navigation closes on Escape, outside pointer, and selection; restores focus to the menu button.
- Keep labeled header/footer landmarks, visible focus, reduced motion, and no decorative brand glyph.
- Replace and remove `apps/site/app/current-parity.css` as soon as the selected route adapters import the new token/shell CSS. No `current-parity` import or selector may survive Task 10.

**Step 3 — Browser GREEN**

At 390px, use Playwright to open menu, Escape-close, assert hidden panel and focus restoration; repeat for outside click and selection. At desktop, assert no mobile button and the active route state.

**Step 4 — Review boundary**

Run unit/e2e tests, `rg -n 'current-parity' apps/site`, and inspect screenshots at 1440, 390, and 426. The residue search must return no result. If authorized, commit as `feat: unify public chrome and visual tokens`.

## Task 11: Port the Storyworld and clarify entry actions

**Files**

- Create: `apps/site/src/ui/scene/ScenePage.tsx`
- Create: `apps/site/src/ui/scene/SceneObject.tsx`
- Create: `apps/site/src/ui/scene/scene-state.ts`
- Create: `apps/site/src/ui/styles/scene.css`
- Create: `apps/site/test/ui/scene-state.test.ts`
- Create: `tests/e2e/scene-reading-flow.spec.ts`
- Modify if Next won: `apps/site/app/page.tsx`
- Modify if React Router won: `apps/site/app/routes/home.tsx`

**Step 1 — RED-test scene state and labels**

Assert overview/focus/Escape/exact focus restoration, bounded objects, and destination labels: article objects use `글 읽기`, review objects use `책 읽기`, secondary focus action is `장면으로 돌아가기`, and inspect controls use `살펴보기`. Reject ambiguous `전체 보기` for focus entry/return.

**Step 2 — Port the approved interaction**

- Preserve Staged Aperture geometry, real media, 2–4 support objects, Continuity Zoom, reduced-motion fallback, native mobile snap, edge peek, focus management, and canonical no-JS anchors.
- Use React only in the selected renderer. Do not edit `src/components/PublicScene*.astro` or `src/styles/storyworld.css`.
- Connect record entry through `OriginLink` with `{ kind: 'scene', focusId }`.

**Step 3 — Browser GREEN**

Verify overview → focus → read → detail → explicit scene return restores focus and horizontal viewport at 1440 and 390. Disable JS and confirm object anchors still open canonical details.

**Step 4 — Review boundary**

Run focused regression and screenshot comparison. If authorized, commit as `feat: port Storyworld entry flow to React`.

## Task 12: Implement the quiet reading surface and continuation

**Files**

- Create: `apps/site/src/ui/reading/ReadingThreshold.tsx`
- Create: `apps/site/src/ui/reading/ContextReturn.tsx`
- Create: `apps/site/src/ui/reading/ContinueReading.tsx`
- Create: `apps/site/src/ui/reading/ArticleReadingPage.tsx`
- Create: `apps/site/src/ui/reading/ReviewReadingPage.tsx`
- Create: `apps/site/src/ui/reading/select-continuations.ts`
- Create: `apps/site/src/ui/styles/reading.css`
- Create: `apps/site/test/ui/reading-threshold.test.tsx`
- Create: `apps/site/test/ui/continuations.test.ts`
- Modify if Next won: `apps/site/app/articles/[slug]/page.tsx`, `apps/site/app/reviews/[slug]/page.tsx`
- Modify if React Router won: `apps/site/app/routes/article.tsx`, `apps/site/app/routes/review.tsx`

**Step 1 — RED-test detail contracts**

Cover text-only threshold, resolved cover/thumbnail, origin-specific labels, direct-link collection fallback, stale origin, fewer than three relationships, missing reason, non-public target, and cap at three.

```ts
expect(selectContinuations(record, publicIndex)).toEqual([
  { href: '/reviews/siddhartha/', title: '싯다르타', reason: '...', kind: 'review' },
]);
expect(renderThreshold({ media: undefined })).not.toContain('<img');
```

**Step 2 — Implement one threshold, then quiet prose**

- Threshold contains return, optional media, identity, and one decorative-hidden 3px cobalt marker.
- Body remains around 42em, 17px/1.9 desktop and 16px mobile.
- Review covers may keep an object shadow; no other generic card shadow.
- Remove gray booth, crop marks, CMYK bar, and `+` mark from the new renderer.
- Render trusted release `bodyHtml`; no compiler or raw MDX reaches the browser.

**Step 3 — Implement continuation selection**

Use explicit authored public relationships first, then exact public-memory relations only when they provide a truthful reason. Never recent-fill or synthesize a reason. Render zero to three items and a separate explicit collection link.

**Step 4 — Browser GREEN**

Test list-origin, search-origin, scene-origin, and direct URL detail at desktop/mobile. Confirm browser Back remains intact and continuation does not inherit origin.

**Step 5 — Review boundary**

Run focused unit/e2e, visual review, typecheck, and `git diff --check`. If authorized, commit as `feat: add unified quiet reading continuity`.

## Task 13: Expand every public route family

**Files**

- Create: `apps/site/src/ui/collections/CollectionPage.tsx`
- Create: `apps/site/src/ui/collections/RecordRow.tsx`
- Create: `apps/site/src/ui/search/SearchPage.tsx`
- Create: `apps/site/src/ui/memory/MemoryIndexPage.tsx`
- Create: `apps/site/src/ui/memory/MemoryDetailPage.tsx`
- Create: `apps/site/src/ui/memory/MemoryMapPage.tsx`
- Create: `apps/site/src/ui/tags/TagsPage.tsx`
- Create: `apps/site/src/ui/reading/SecondaryReadingPage.tsx`
- Create: `apps/site/test/ui/route-presentations.test.tsx`
- Modify if Next won: `apps/site/app/articles/page.tsx`, `apps/site/app/articles/[slug]/page.tsx`, `apps/site/app/reviews/page.tsx`, `apps/site/app/reviews/[slug]/page.tsx`, `apps/site/app/search/page.tsx`, `apps/site/app/memory/page.tsx`, `apps/site/app/memory/[slug]/page.tsx`, `apps/site/app/memory/map/page.tsx`, `apps/site/app/tags/page.tsx`, `apps/site/app/tags/[tag]/page.tsx`, `apps/site/app/analysis/page.tsx`, `apps/site/app/analysis/[slug]/page.tsx`, `apps/site/app/ideas/page.tsx`, `apps/site/app/ideas/[slug]/page.tsx`, `apps/site/app/travel/page.tsx`, `apps/site/app/travel/[slug]/page.tsx`
- Modify if React Router won: `apps/site/app/routes.ts`, `apps/site/app/routes/articles-index.tsx`, `apps/site/app/routes/article.tsx`, `apps/site/app/routes/reviews-index.tsx`, `apps/site/app/routes/review.tsx`, `apps/site/app/routes/search.tsx`, `apps/site/app/routes/memory-index.tsx`, `apps/site/app/routes/memory.tsx`, `apps/site/app/routes/memory-map.tsx`, `apps/site/app/routes/tags-index.tsx`, `apps/site/app/routes/tag.tsx`, `apps/site/app/routes/analysis-index.tsx`, `apps/site/app/routes/analysis.tsx`, `apps/site/app/routes/ideas-index.tsx`, `apps/site/app/routes/idea.tsx`, `apps/site/app/routes/travel-index.tsx`, `apps/site/app/routes/travel.tsx`

**Step 1 — RED-test the full route manifest**

Generate expected routes from the public release and assert the selected renderer exposes exactly the same set as the Astro baseline, including list routes, details, `/memory/map/`, tag indexes/details, and secondary lanes. Draft/review-only records must be absent.

**Step 2 — Implement collection and search origins**

- Every record has a stable DOM anchor derived from validated collection/id.
- Article/review/secondary lists send their allowlisted origin through `OriginLink`.
- Search sends bounded query and result anchor; stale anchor restores query without forced scroll.
- Empty search remains the normal empty state.

**Step 3 — Implement memory and secondary detail modes**

- Read only the release's public-memory projection.
- Memory and secondary details share the reading shell and text-only threshold when no media exists.
- Preserve the approved memory map behavior; do not introduce private graph data or workbench controls.

**Step 4 — Add selected-framework adapters**

- Next winner: add the explicit adapter paths listed above; every dynamic adapter uses `generateStaticParams` and `dynamicParams = false`.
- React Router winner: add explicit entries in `app/routes.ts`, route modules, and every dynamic URL to `prerender()`.
- In both cases, adapters only load release data, set metadata, and render shared public-site components.

**Step 5 — Independent review**

Reviewer compares route inventory, metadata, publication filtering, memory boundary, and no-JS links. If authorized, commit as `feat: migrate all public routes to React`.

## Task 14: Run the complete browser, accessibility, and performance matrix

**Files**

- Create: `playwright.config.ts`
- Create: `tests/e2e/reading-continuity.spec.ts`
- Create: `tests/e2e/direct-and-modified-navigation.spec.ts`
- Create: `tests/e2e/search-return.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/edge-cases.spec.ts`
- Create: `tests/e2e/no-js.spec.ts`
- Create: `tests/e2e/performance.spec.ts`
- Create: `tests/fixtures/public/long-title-record.json`
- Create: `tests/fixtures/public/missing-media-record.json`
- Create: `tests/fixtures/public/no-relations-record.json`

**Step 1 — Encode all approved flows**

Test at 1440×960, 390×844, and 426×926:

1. Scene overview → focus → read → exact scene return.
2. Article list → detail → exact list position.
3. Review list → detail → exact list position.
4. Search query → result → detail → same query/result.
5. Direct detail → collection fallback.
6. Modified click/new tab → clean canonical detail.
7. JavaScript-disabled record link → canonical detail.
8. Mobile menu Escape/outside/selection and focus restore.
9. Long Korean/English title, missing media, zero relations, stale anchor.
10. Keyboard focus, reduced motion, console, axe, overflow, LCP, CLS, and JS bytes.

Add a source-residue assertion that `apps/site` contains no `current-parity` import, stylesheet, or selector.

**Step 2 — Confirm tests fail against incomplete behavior**

Run each new spec before fixing remaining issues and preserve RED output in the execution log. Fix product code, not assertions, unless an assertion contradicts ADR-0006.

**Step 3 — Run production browser GREEN**

```bash
npm run public-release:build
npm run site:build
npx playwright test
```

Configure Playwright `webServer` with command `npm run site:preview -- --host 127.0.0.1 --port 4391`, readiness URL `http://127.0.0.1:4391/`, `timeout: 120_000`, and `reuseExistingServer: false`. Fail if the port is occupied; do not kill or reuse another server. Expected: all projects PASS, zero console/hydration/serious axe/overflow failures, performance within the mandatory budget.

**Step 4 — Review boundary**

Keep machine-readable Playwright artifacts ignored; record commands, browser versions, release ID, and summary metrics in the Task 15 evidence note. If authorized, commit as `test: verify public reading continuity end to end`.

## Task 15: Prepare and prove local cutover, rollback, and clean-host restore

**Files**

- Create: `deploy/reverse-proxy/public-site.conf`
- Create: `deploy/reverse-proxy/public-site-rollback.conf`
- Create: `scripts/cutover/verify-public-site.mts`
- Create: `scripts/cutover/verify-rollback.mts`
- Create: `scripts/cutover/verify-clean-host.mts`
- Create: `scripts/cutover/local-proxy.mts`
- Create: `scripts/cutover/local-proxy.test.ts`
- Create: `docs/notes/project/evidence/public-site-cutover.md`
- Modify: `package.json`

**Step 1 — RED-test gate refusal**

`verify-public-site.mts --mode local` must refuse when release ID, Astro baseline, React build, rollback build, scoped/full route parity, or eligible clean-host restore evidence is absent. `--mode astro-removal` additionally requires authorized production cutover, rollback drill, observation start/end, zero blocking observation errors, and `astro_removal_ready: true`. Any production target also requires both a direct user authorization record in the execution log and `--authorize-production`; the flag alone is insufficient.

**Step 2 — Prove the local proxy lifecycle**

- `local-proxy.mts` is the only local drill proxy; do not depend on a globally installed Nginx or Docker daemon.
- `--check` validates target URLs, state-file values (`react` or `astro` only), loopback-only listen address, and port availability without starting a listener.
- Refuse if `127.0.0.1:4390`, `4391`, or `4392` is already occupied. Never stop or reconfigure the occupying process.
- Start the selected preview on `4391`, Astro preview on `4392`, and the proxy on `4390`. `apps/site` must define a framework-specific `preview` script that serves its static output, so the root `site:preview` command is identical after selection.
- Store proxy state and PID only under a new `mktemp -d` directory. Capture the exact process IDs created by this drill and stop only those IDs after verifying each PID file and command line still match.

Exact lifecycle:

```bash
cutover_tmp_dir="$(mktemp -d /tmp/beyondwin-cutover.XXXXXX)"
npm run cutover:proxy -- --check --listen 127.0.0.1:4390 --react http://127.0.0.1:4391 --astro http://127.0.0.1:4392 --state "$cutover_tmp_dir/target"
npm run site:preview -- --host 127.0.0.1 --port 4391 &
react_preview_pid=$!
npm run legacy:preview -- --host 127.0.0.1 --port 4392 &
astro_preview_pid=$!
npm run cutover:proxy -- --listen 127.0.0.1:4390 --react http://127.0.0.1:4391 --astro http://127.0.0.1:4392 --state "$cutover_tmp_dir/target" --pid-file "$cutover_tmp_dir/proxy.pid" &
cutover_proxy_pid=$!
```

After React → Astro → React smoke, validate the recorded PIDs and commands, send TERM only to `cutover_proxy_pid`, `react_preview_pid`, and `astro_preview_pid`, wait for them, and remove only `cutover_tmp_dir` after verifying it begins with `/tmp/beyondwin-cutover.`.

**Step 3 — Prove local shadow and rollback**

- Build Astro baseline and selected React output from the same commit and public release.
- Serve both on separate local ports without stopping the existing server.
- Compare full route/metadata/link/image/accessibility contracts.
- Switch the local proxy state React → Astro → React, smoke the representative route set after each transition, and verify config/state refusal cases.

**Step 4 — Prove clean-host restore**

Clean-host proof is eligible only from an immutable implementation commit. Use a new `mktemp -d` path, `git archive` of that exact commit, `npm ci`, release build, selected site build, and route smoke. Do not copy `node_modules`, build output, top-level private memory, untracked files, or local environment secrets. If commit authorization is absent, record `blocked_by: no immutable implementation snapshot` and do not treat Task 15 or Task 16 as complete; an ad-hoc dirty-worktree snapshot is not an allowed substitute.

**Step 5 — Record the operational gate**

The evidence note contains local results plus blank production fields:

```yaml
production_cutover_authorized: false
production_cutover_at: null
rollback_drill_at: null
observation_started_at: null
observation_completed_at: null
observation_errors: null
astro_removal_ready: false
```

Do not invent or prefill those values. Actual deployment/cutover waits for explicit authorization and real evidence. `--authorize-production` is accepted only when the execution log contains the user's direct production-cutover authorization for the exact host/release; the flag itself is not evidence of permission.

**Step 6 — Review boundary**

Run local verification and `git diff --check`. If authorized, commit as `ops: prepare public renderer cutover and rollback`.

## Task 16: Remove Astro only after the operational gate passes

**Precondition:** `docs/notes/project/evidence/public-site-cutover.md` truthfully records authorized production cutover, successful rollback drill, clean-host restore, completed observation window, zero blocking errors, and `astro_removal_ready: true`. If any field is missing or false, stop; this is not a test failure to bypass.

**Files to delete after exact inventory verification**

- `astro.config.mjs`
- `src/content.config.ts`
- All `.astro` files under `src/components/`, `src/layouts/`, and `src/pages/` listed by `rg --files src | rg '\.astro$'`
- `src/styles/global.css`, `src/styles/press.css`, `src/styles/storyworld.css`, and `src/styles/press.tokens.test.mjs` only after their required behavior exists in `apps/site/src/ui/`
- Astro-only declarations/tests/imports identified by `rg -n 'astro:|Astro\.|\.astro' src scripts tests`

**Files to modify**

- `package.json`, `package-lock.json`
- `README.md`, `PRODUCT.md`, `DESIGN.md`, `SYNC.md`
- `AGENTS.md`, `src/AGENTS.md`
- `.agents/skills/site-change/SKILL.md`
- `docs/notes/project/getting-started.md`
- `docs/notes/project/publishing-workflows.md`
- `docs/notes/project/agent-runbook.md`
- `docs/notes/project/architecture-reference.md`
- `docs/notes/project/design-and-content-rationale.md`
- `docs/notes/project/node-react-modular-monolith-design.md`
- `docs/notes/project/public-reading-continuity-design.md`
- `docs/notes/project/adr/0005-node-react-modular-monolith.md`
- `docs/notes/project/adr/0006-unified-public-reading-continuity.md`
- `docs/_index/catalog.yml`, `docs/_index/topics.yml`, `docs/INDEX.md`
- `scripts/agent-check.mjs`, relevant tests

**File to create before any deletion**

- `docs/notes/project/evidence/astro-removal-manifest.md`

**Step 1 — Inventory before deletion**

Generate a checked migration manifest from:

```bash
rg --files src | rg '\.astro$|src/styles/(global|press|storyworld)'
rg -n "astro:|from ['\"]astro['\"]|Astro\.|import\.meta\.glob|\.astro|@astrojs|\"astro\"" . --glob '!node_modules/**' --glob '!docs/notes/project/evidence/**'
```

For every match, `astro-removal-manifest.md` records current path, coupling symbol, replacement owner/path, focused verification, and one disposition: retain, move, or delete. It explicitly covers current non-`.astro` couplings such as `src/lib/content.ts`, `src/lib/content/mediaRegistry.ts`, `src/lib/bookshelfPresentation.ts`, and `src/lib/recordsPresentation.ts`, while retaining Astro-free source rules such as `src/lib/content/mediaManifest.mjs` and publication validators until their package replacements are verified. Confirm every public route, MDX component behavior, CSS token, validation rule, and content loader has a selected-stack replacement. Do not delete `src/content.config.ts` or renderer files until every manifest row has an owner and passing focused test.

**Step 2 — RED-test Astro absence**

Add an agent-check test asserting no package declares Astro/@astrojs, no `.astro` files remain, no code imports `astro:*`, and root `build/dev/preview/validate` target `apps/site`.

Run it before deletion. Expected: FAIL.

**Step 3 — Delete exact legacy targets and update scripts**

Use `apply_patch` or explicit file-by-file `git rm` only if commit/deletion authority is current. Do not delete `src/content/**`, `src/assets/content/**`, or `src/data/memory.public.json`; they remain source inputs until the later database migration.

Remove Astro, `@astrojs/mdx`, and `@astrojs/check` from manifests/lockfile. Rename selected site commands to the root defaults and make `validate` run agent check, content/media/article/memory checks, all Vitest workspaces, selected-site typecheck/build, and Playwright smoke.

**Step 4 — Update built truth**

- `DESIGN.md` now describes the shipped unified React public world, not the old press-proof split.
- `PRODUCT.md` and architecture reference name the selected renderer and public release boundary.
- ADR-0005 records the selected renderer and completed Astro removal evidence; ADR-0006 records implementation status without rewriting the decision.
- Runbook, skill, setup, and publishing docs stop instructing agents to edit Astro files.
- Update all doc indexes in the same change.

**Step 5 — Full verification before completion**

```bash
npm ci
npm run validate
npx playwright test
git diff --check
rg -n "astro:|from ['\"]astro['\"]|Astro\.|import\.meta\.glob|\.astro|@astrojs|\"astro\"" . --glob '!node_modules/**' --glob '!docs/notes/project/evidence/**'
```

Expected: validation and browsers PASS; final residue search returns no implementation/config/dependency hits. Historical ADR prose may mention Astro only where it explains the migration history.

**Step 6 — Independent final review**

Reviewer maps every ADR-0006 requirement to a test or browser artifact, confirms no private/public boundary regression, checks unrelated dirty files were preserved, and reruns `npm run validate`. If authorized, commit as `feat: cut over public site and remove Astro`.

---

## Spec coverage map

| Approved requirement | Plan evidence |
| --- | --- |
| Astro receives no redesign | Global constraint; Tasks 6–7 current-behavior only; Tasks 9–13 after winner promotion |
| Measured Next vs React Router gate | Tasks 5–8 |
| One visual world, scene and reading modes | Tasks 10–12 |
| Explicit entry actions | Task 11 |
| Safe contextual return and clean canonical URL | Task 9; Tasks 12–14 |
| Bounded truthful continuation | Task 12 |
| All public routes | Tasks 13–14 |
| Mobile, no-JS, focus, reduced motion | Tasks 10–14 |
| Public/private boundary | Tasks 3–5, 13, 16 |
| Shadow, rollback, clean-host proof | Task 15 |
| Astro removed last | Task 16 precondition and residue gate |

## Execution stopping points

1. After Task 8, stop if no renderer passes mandatory parity or the selector is flaky. Repair the foundation; do not start the redesign.
2. After Task 14, the React implementation can be locally complete, but do not claim Astro removal complete.
3. After Task 15 local evidence, stop before any external cutover unless the user explicitly authorizes production mutation.
4. Task 16 starts only after real observation evidence satisfies its precondition.
