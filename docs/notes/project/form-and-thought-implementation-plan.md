# FORM & THOUGHT React-only Public Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- Status: approved implementation plan, not yet executed
- Approved: 2026-08-28
- Approval evidence: [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md)

**Goal:** 승인된 일곱 reference와 같은 FORM & THOUGHT 공개 사이트를 React Router에 구현하고, 콘텐츠를 서평·아티클·생각·검색으로 재분류·편집한 뒤 Astro와 legacy rollback surface를 제거한다.

**Architecture:** `packages/contracts`와 `packages/content`가 `thoughts`를 포함한 public content contract와 immutable release를 소유하고 `apps/site`가 유일한 renderer가 된다. 디자인은 token만 먼저 추상화하지 않고 foundation과 홈·아티클 목록·상세의 representative vertical slice를 함께 만들어 reference와 대조한 후 component contract를 고정하고 나머지 route에 확장한다.

**Tech Stack:** Node 24, TypeScript 6, React 19, React Router 8 Framework Mode static prerender, Zod 4, MDX 3, Sharp, Vitest, Playwright, repository media manifest.

**Spec:** [docs/notes/project/form-and-thought-public-site-design.md](form-and-thought-public-site-design.md)

## Global Constraints

- Visible brand는 두 줄 `FORM & THOUGHT`만 사용한다.
- Primary navigation visible order는 `서평 · 아티클 · 생각 · 검색`이다.
- Canonical primary routes는 `/reviews/`, `/articles/`, `/thoughts/`, `/search/`다.
- Secondary canonical routes `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/`와 현재 유효한 detail/map route는 새 shell로 보존하되 primary nav/search에는 넣지 않는다.
- `AI 시대에, 나는 왜 책을 읽는가`의 canonical은 `/thoughts/why-i-read-in-the-ai-era/`이고 article redirect는 만들지 않는다.
- 실제 아티클 17편, 실제 서평 18편, 생각 1편만 편집 대상으로 삼고 example content는 공개하지 않는다.
- 생각 index는 desktop 3×2 중 한 cell만 채우고 다섯 cell은 accessible content와 focus target 없이 비운다.
- 공개 subtype `조사 · 근거`, `에세이` badge를 제거한다.
- 좋아요와 댓글은 count 없는 비활성 준비 상태이며 링크 복사만 실제 동작한다.
- 승인되지 않은 생성 이미지를 public release에 포함하지 않는다.
- Public code는 top-level `memory/**`를 읽지 않는다.
- 기존 review cover는 crop하지 않고 `object-fit: contain`을 사용한다.
- 레퍼런스에 없는 gradient, glass, large radius, floating shadow, decorative motion을 추가하지 않는다.
- dependency 추가와 font asset 반입은 라이선스·출처·checksum을 기록하고 사용자 승인 후 수행한다.
- 커밋 단계는 실행 시 사용자가 명시적으로 커밋을 승인한 경우에만 실행한다. 승인 전에는 변경을 working tree에 유지한다.
- 기존 local server를 종료하거나 재설정하지 않는다. browser 검증은 사용하지 않는 별도 port를 쓴다.
- Content/media 변경 뒤에는 `public-release:build`와 `public-release:verify`를 실행한다. `public-release:clean-test`는 임시-directory 삭제 안전성만 확인하며 release build를 대신하지 않는다.
- 모든 stage/commit 명령은 task 시작 시 확정한 exact file allowlist만 사용하고 staged diff를 검토한다. `git add docs`, `git add apps/site`, `git add src`, `git add packages` 같은 broad staging은 예시로도 사용하지 않는다.
- Production deploy, push, traffic mutation은 이 계획의 권한 밖이다. repository 안의 Astro 제거 승인과 production cutover 승인을 혼동하지 않는다.

---

### Task 1: `thoughts`를 framework-neutral content contract에 추가한다

**Files:**

- Modify: `packages/contracts/src/content.ts`
- Modify: `packages/contracts/src/media.ts`
- Modify: `packages/content/src/schemas.ts`
- Modify: `packages/content/src/source-records.ts`
- Modify: `packages/content/src/release/build-release.ts`
- Modify: `packages/content/src/release/read-release.ts`
- Modify: `packages/content/src/media/build-responsive-media.ts`
- Modify: `scripts/validate-content.mjs`
- Modify: `packages/contracts/test/content.test.ts`
- Modify: `packages/contracts/test/public-release.test.ts`
- Modify: `packages/content/test/source-records.test.ts`
- Modify: `packages/content/test/build-release.test.ts`
- Modify: `packages/content/test/release-boundary.test.ts`
- Modify: `apps/site/src/ui/collections/CollectionPage.tsx`
- Modify: matching `apps/site` collection contract test
- Move: `src/content/articles/why-i-read-in-the-ai-era.mdx` → `src/content/thoughts/why-i-read-in-the-ai-era.mdx`
- Move: `src/assets/content/articles/why-i-read-in-the-ai-era/` → `src/assets/content/thoughts/why-i-read-in-the-ai-era/`

**Interfaces:**

- Produces: `PublicCollection` and `SourceRecord` member `'thoughts'`.
- Produces: thought record with common fields and optional `featuredMedia`.
- Preserves: `published && !draft`, MDX rendering, media checksum and rights boundary.
- Resolves: `CollectionLane`/`ORIGIN_KIND` ownership so adding `thoughts` does not create an unhandled strict-union member. Thoughts either receives an explicit origin contract or remains outside the generic secondary `CollectionPage` union.

- [ ] **Step 1: Write failing source/public contract tests**

```ts
const thought = parsePublicRecord({
  collection: 'thoughts',
  id: 'why-i-read-in-the-ai-era',
  href: '/thoughts/why-i-read-in-the-ai-era/',
  title: 'AI 시대에, 나는 왜 책을 읽는가',
  description: '빠른 답이 넘칠수록 읽는 시간은 판단의 근육이 된다.',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
  tags: ['reading'],
  media: [],
  relationships: [],
  memoryLinks: [],
  bodyHtml: '<p>읽기는 판단을 늦추는 일이다.</p>',
});
expect(thought.href).toBe('/thoughts/why-i-read-in-the-ai-era/');
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm exec vitest run packages/contracts/test/content.test.ts packages/content/test/source-records.test.ts packages/content/test/build-release.test.ts
```

Expected: FAIL because `thoughts` is not in the discriminated unions.

- [ ] **Step 3: Extend source and public schemas**

Add `thoughts` to collection constants, route regexes, relationship targets and discriminated unions. Use `sharedFields('thoughts')` plus optional `featuredMedia`; update `referencedMedia()` and `publicRecordInput()` to resolve thought media.

- [ ] **Step 4: Move the source and media atomically**

```bash
mkdir -p src/content/thoughts src/assets/content/thoughts
git mv src/content/articles/why-i-read-in-the-ai-era.mdx src/content/thoughts/why-i-read-in-the-ai-era.mdx
git mv src/assets/content/articles/why-i-read-in-the-ai-era src/assets/content/thoughts/why-i-read-in-the-ai-era
```

Remove article-only `recordKind` and `evidenceState`, preserve authored fields and update relationship/media targets to `thoughts/why-i-read-in-the-ai-era`. Update every moved `media.yml` `sourcePath` and the historical `docs/notes/project/assets/public-atlas/provenance.yml` locator with current and former paths; do not rewrite the historical fact.

- [ ] **Step 5: Make standalone validation consume the shared schema**

Add `thoughts` to discovery and call `parseSourceRecord()` for every MDX entry instead of duplicating field rules. Keep the 25-word blockquote gate as a separate editorial rule.

- [ ] **Step 6: Run GREEN and release tests**

```bash
npm exec vitest run packages/contracts/test/content.test.ts packages/content/test/source-records.test.ts packages/content/test/build-release.test.ts packages/content/test/release-boundary.test.ts
node scripts/validate-content.mjs
npm run media:validate -- --strict
npm run public-release:build
npm run public-release:verify
npm run public-release:clean-test
```

Expected: release contains `thoughts/why-i-read-in-the-ai-era` and not the old article record.

- [ ] **Step 7: Commit if authorized**

Stage only the exact files declared for this task, including moved files and the two updated provenance/media manifests. Review `git diff --cached --name-status` before `git commit -m "feat: add public thoughts collection"`.

---

### Task 2: React routes, inventory and metadata를 새 공개 명사에 맞춘다

**Files:**

- Modify: `apps/site/app/routes.ts`
- Modify: `apps/site/app/release.server.ts`
- Modify: `apps/site/app/root.tsx`
- Create: `apps/site/app/routes/thoughts-index.tsx`
- Create: `apps/site/app/routes/thought.tsx`
- Create: `apps/site/src/ui/thoughts/ThoughtIndexPage.tsx`
- Create: `apps/site/src/ui/thoughts/ThoughtReadingPage.tsx`
- Delete: `apps/site/app/routes/review-legacy-redirect.tsx`
- Modify: `apps/site/test/routes.test.tsx`
- Modify: `apps/site/test/static-export.test.ts`
- Modify: `apps/site/test/emitted-output.test.ts`

**Interfaces:**

- Produces: `recordsForCollection(release, 'thoughts')` and `recordForRoute(release, 'thoughts', slug)`.
- Produces: `/thoughts/` and `/thoughts/:slug` prerender paths.
- Removes: `/reviews/the-life-you-can-save/` compatibility route.

- [ ] **Step 1: Write failing route tests**

```ts
expect(routesModule.default).toEqual(expect.arrayContaining([
  expect.objectContaining({ path: 'thoughts', file: './routes/thoughts-index.tsx' }),
  expect.objectContaining({ path: 'thoughts/:slug', file: './routes/thought.tsx' }),
]));
expect(routesModule.default).not.toEqual(expect.arrayContaining([
  expect.objectContaining({ path: 'reviews/the-life-you-can-save' }),
]));
```

- [ ] **Step 2: Run the route tests and verify RED**

```bash
npm exec vitest run apps/site/test/routes.test.tsx apps/site/test/static-export.test.ts
```

- [ ] **Step 3: Add thought routes and remove compatibility routing**

Add the two explicit routes. Delete the review compatibility route and remove `VERIFIED_COMPATIBILITY_ROUTES` from `fullPublicPaths()`.

- [ ] **Step 4: Implement minimal semantic thought pages**

The index loader returns `{ records, assets }`; detail returns `{ record, featuredAsset }` or 404. Render real title, description, date, body and canonical anchors without decorative placeholders.

- [ ] **Step 5: Rename public metadata**

Change metadata suffixes from `beyondwin` to `FORM & THOUGHT` and set `theme-color` to `#F2EFE9`. Internal package names remain unchanged.

- [ ] **Step 6: Run route, export and build checks**

```bash
npm exec vitest run apps/site/test/routes.test.tsx apps/site/test/static-export.test.ts apps/site/test/emitted-output.test.ts
npm run public-release:build
npm run public-release:verify
npm run site:build
```

- [ ] **Step 7: Commit if authorized**

Stage only the exact route, release-loader, root metadata, thought UI and named test files from Task 2. Review the staged allowlist before `git commit -m "feat: add canonical thought routes"`.

---

### Task 3: 서체 후보를 실제 문장으로 비교하고 foundation token을 고정한다

**Files:**

- Create: `docs/notes/project/assets/form-and-thought-type-calibration/README.md`
- Create: `docs/notes/project/assets/form-and-thought-type-calibration/type-calibration.html`
- Create: `docs/notes/project/assets/form-and-thought-type-calibration/type-calibration.png`
- Create: `docs/notes/project/assets/form-and-thought-reference/calibration.yml`
- Create after approval: `apps/site/public/fonts/LICENSES.md`
- Create after approval: `apps/site/public/fonts/form-thought-display-ko.woff2`
- Create after approval: `apps/site/public/fonts/form-thought-wordmark.woff2`
- Create after approval: `apps/site/public/fonts/form-thought-ui-ko.woff2`
- Modify: `apps/site/src/ui/styles/tokens.css`
- Modify: `apps/site/src/ui/styles/shell.css`
- Modify: `apps/site/app/root.tsx`
- Modify: `apps/site/test/css-source-accounting.test.ts`

**Interfaces:**

- Produces the approved `--ft-*` color tokens from the visual spec.
- Produces `--ft-font-display`, `--ft-font-wordmark`, `--ft-font-ui` backed by local licensed WOFF2 files.
- Produces reproducible reference region, CSS viewport, DPR, browser/OS and font calibration without treating bitmap pixels as a CSS viewport.

- [ ] **Step 1: Calibrate the approved references**

Record each primary region's page-shell crop, comparison CSS viewport, DPR, browser version and reference-specific authority. Do not alter composition to make the numbers convenient. `reference-07` remains a secondary tone board.

- [ ] **Step 2: Build a three-stack typography comparison**

Render `FORM & THOUGHT`, `아티클`, `AI 시대에, 나는 왜 책을 읽는가` and two real body paragraphs with:

1. MaruBuri + Cormorant Garamond + Pretendard.
2. Noto Serif KR + Cormorant Garamond + Noto Sans KR.
3. KoPub Batang + Libre Baskerville + Pretendard.

Record official URL, license, source filename, checksum, width and line count. Do not add the fonts to the public app yet.

- [ ] **Step 3: Capture and present the typography sheet**

Capture at 1440×900 and 390×844 and present the combined sheet. Stop until one stack is explicitly approved.

- [ ] **Step 4: Add only the approved font files**

Store the chosen WOFF2 files under the fixed semantic filenames and record provenance in `LICENSES.md`. The public page makes no remote font request.

- [ ] **Step 5: Write failing token tests**

```ts
expect(tokens).toContain('--ft-paper: #F2EFE9');
expect(tokens).toContain('--ft-terracotta: #AF6047');
expect(tokens).toContain('--ft-on-terracotta: #FFFFFF');
expect(tokens).toContain('@font-face');
```

- [ ] **Step 6: Add tokens and shell foundation without breaking remaining consumers**

Apply the visual-spec values, approved font faces, warm canvas, centered paper shell, the one allowed outer-shell shadow/radius, ink/terracotta focus and selection. Keep temporary legacy-token aliases while old scene/route CSS still consumes them; the final zero-legacy-token assertion belongs to Task 13 after all consumers move. Add allowed contrast-pair tests and font-display/preload/subset byte accounting.

- [ ] **Step 7: Run focused tests**

```bash
npm exec vitest run apps/site/test/css-source-accounting.test.ts apps/site/test/ui/site-header.test.tsx
npm run typecheck --workspace @beyondwin/site
```

- [ ] **Step 8: Commit if authorized**

Stage the calibration manifest, approved font evidence/files, token/shell files and named tests only. Review the staged allowlist before `git commit -m "feat: establish form and thought visual foundation"`.

---

### Task 4: 공통 header와 editorial primitives를 실제 화면 요구에서 만든다

**Files:**

- Modify: `apps/site/src/ui/components/MobileNavigation.tsx`
- Modify: `apps/site/src/ui/components/SiteHeader.tsx`
- Modify: `apps/site/src/ui/components/SiteShell.tsx`
- Delete: `apps/site/src/ui/components/SiteFooter.tsx`
- Create: `apps/site/src/ui/editorial/EditorialPageHeader.tsx`
- Create: `apps/site/src/ui/editorial/EditorialListRow.tsx`
- Create: `apps/site/src/ui/editorial/EditorialDetailFrame.tsx`
- Create: `apps/site/src/ui/editorial/DetailActionRail.tsx`
- Create: `apps/site/src/ui/editorial/copyCanonicalUrl.ts`
- Create: `apps/site/src/ui/styles/editorial.css`
- Modify: `apps/site/test/ui/site-header.test.tsx`
- Create: `apps/site/test/ui/editorial-components.test.tsx`

**Interfaces:**

- Produces `PublicSection = 'reviews' | 'articles' | 'thoughts' | 'search' | null`.
- Produces `EditorialPageHeader`, `EditorialListRow`, `EditorialDetailFrame`, `DetailActionRail`.
- Produces `copyCanonicalUrl(url, clipboard): Promise<'copied' | 'failed'>`.

- [ ] **Step 1: Write failing shared-component tests**

```tsx
const header = renderToStaticMarkup(<SiteHeader currentSection="articles" />);
expect(header).toContain('FORM &amp;');
expect(header).toMatch(/서평[\s\S]*아티클[\s\S]*생각[\s\S]*검색/u);
expect(header).not.toMatch(/beyondwin|장면|>글<|>책<|찾기/u);
```

Assert action rail labels `좋아요 · 준비 중`, `댓글 · 준비 중`, `링크 복사`, no counts, and only the copy control is enabled.

- [ ] **Step 2: Run the component tests and verify RED**

```bash
npm exec vitest run apps/site/test/ui/site-header.test.tsx apps/site/test/ui/editorial-components.test.tsx
```

- [ ] **Step 3: Implement the wordmark and navigation**

```tsx
<a className="site-brand" href="/" aria-label="FORM & THOUGHT 홈">
  <span>FORM &amp;</span><span>THOUGHT</span>
</a>
```

Render three hamburger lines. Home uses the reference's inverse header; inner routes use the off-white header. Desktop retains the four visible tabs plus a non-modal hamburger popover. Mobile drawer receives initial focus, traps Tab/Shift+Tab, makes the background inert, closes on Escape/outside interaction and restores trigger focus. SSR canonical anchors remain reachable with JavaScript disabled.

- [ ] **Step 4: Implement primitives without invented data**

Rows receive resolved media and `YYYY.MM.DD` dates. The whole row is one semantic canonical anchor and its arrow is decorative. Detail omits its media column when absent. Action rail renders like/comment as clearly noninteractive unavailable status and one copy button with `aria-live="polite"` status.

- [ ] **Step 5: Remove the shared footer**

`SiteShell` renders header and main only and no longer accepts `mode`; the approved pages do not repeat navigation in a footer.

- [ ] **Step 6: Run shared tests**

```bash
npm exec vitest run apps/site/test/ui/site-header.test.tsx apps/site/test/ui/editorial-components.test.tsx apps/site/test/ui/transport.test.ts
```

- [ ] **Step 7: Commit if authorized**

Stage only the named component, style and test files plus the explicit `SiteFooter.tsx` deletion. Review the staged allowlist before `git commit -m "feat: add form and thought editorial primitives"`.

---

### Task 5: 대표 이미지 첫 묶음을 생성하고 승인된 asset만 연결한다

**Files:**

- Generate ignored: `output/form-and-thought-image-candidates/calibration/`
- Create after approval: `docs/notes/project/assets/form-and-thought-generated/calibration/decision-manifest.yml`
- Create after approval: `docs/notes/project/assets/form-and-thought-generated/calibration/approved-contact-sheet.png`
- Modify: `packages/content/src/schemas.ts`
- Modify: `packages/content/src/release/build-release.ts`
- Modify: `packages/content/src/release/read-release.ts`
- Modify: `packages/contracts/src/media.ts`
- Modify: matching media/release schema and boundary tests
- Create after approval: `src/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-hero.png`
- Create after approval: `src/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png`
- Modify after approval: corresponding `media.yml` and `featuredMedia` fields

**Interfaces:**

- Produces one approved home hero, one approved article landscape and one approved thought image.
- Preserves checksum, dimensions, sourcePath, rightsNote and verifiedAt in source `media.yml`; preserves generator/model, prompt version, placement crops, approval and rights decision in the docs-only decision manifest.
- Produces an explicit source schema for repository-generated media approval/provenance and makes release build fail closed unless generation approval and rights review are approved. Public asset JSON exposes only safe public fields; the immutable build receipt preserves the decision-manifest checksum/evidence locator.

- [ ] **Step 1: Use fixed calibration content**

Use `graphify-code-knowledge-graph-deep-dive` for the article and `why-i-read-in-the-ai-era` for the thought. The home hero may reuse the approved article image only when it supplies the reference split and text-safe area.

- [ ] **Step 2: Generate three candidates per slot**

At execution invoke the project image workflow with `form-and-thought-image-art-direction.md`. Save nine candidates in ignored local output, never directly in durable docs or public media.

- [ ] **Step 3: Build and present the contact sheet**

Normalize candidates to `homeHero`, `homePick/indexLandscape` and `detailHero` slot crops. Label candidate IDs and placement crops and stop until explicit approval. One physical asset may serve multiple placements only when each crop/focal/safe-area record passes.

- [ ] **Step 4: Integrate only approved originals**

Add source media and exact manifest records, update `featuredMedia`, then run:

```bash
npm run media:validate -- --strict
npm run public-release:build
npm run public-release:verify
npm run public-release:clean-test
```

- [ ] **Step 5: Commit if authorized**

Commit only approved contact sheet/decision manifest, approved originals, exact `media.yml` and exact MDX bindings. Rejected candidate originals stay ignored. Review the staged allowlist before `git commit -m "feat: add approved form and thought imagery"`.

---

### Task 6: 홈·아티클 목록·아티클 상세 vertical slice를 reference와 맞춘다

**Files:**

- Create: `apps/site/src/ui/home/HomePage.tsx`
- Create: `apps/site/src/ui/articles/articleTopics.ts`
- Rewrite: `apps/site/src/ui/articles/ArticleIndexPage.tsx`
- Rewrite: `apps/site/src/ui/reading/ArticleReadingPage.tsx`
- Modify: `apps/site/app/routes/home.tsx`
- Modify: `apps/site/app/routes/articles-index.tsx`
- Modify: `apps/site/app/routes/article.tsx`
- Modify: `apps/site/src/ui/articles/articlePresentation.ts`
- Create: `apps/site/src/ui/styles/route-home.css`
- Create: `apps/site/src/ui/styles/route-index.css`
- Create: `apps/site/src/ui/styles/route-detail.css`
- Modify: `apps/site/app/root.tsx`
- Create: `apps/site/test/ui/home.test.tsx`
- Rewrite: `apps/site/test/ui/article-index.test.tsx`
- Rewrite: `apps/site/test/ui/article-reading.test.tsx`

**Interfaces:**

- Produces `ArticleTopic = '에이전트' | '디자인' | '데이터' | '아키텍처' | '검증'`.
- Produces `articleTopic(id): ArticleTopic`, throwing on an unclassified public article.
- Produces the representative home, article list and article detail used for the visual gate.
- Produces fixed `HOME_SELECTIONS` with one published item per lane; a missing selection fails the release instead of changing the three-pick composition.

- [ ] **Step 1: Write failing vertical-slice tests**

Assert one home hero plus exactly three lane picks, the six filter labels, all 17 article rows without pagination, no public subtype labels, GET-filter anchors, and a `reference-03` detail page with action rail, hero metadata, real body and optional colophon.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm exec vitest run apps/site/test/ui/home.test.tsx apps/site/test/ui/article-index.test.tsx apps/site/test/ui/article-reading.test.tsx
```

- [ ] **Step 3: Add the exhaustive 17-article topic map**

```ts
export const ARTICLE_TOPICS = {
  'agents-md-vs-agent-skills-evidence': '검증',
  'ai-design-references': '디자인',
  'andrej-karpathy-skills-analysis': '에이전트',
  'aws-static-frontend-serverless-bff': '아키텍처',
  'codex-ui-mockup-workflow': '디자인',
  'context-refinement-system-design': '에이전트',
  'graphify-code-knowledge-graph-deep-dive': '데이터',
  'hermes-agent-persistent-worker-runtime': '에이전트',
  'karpathy-delete-everything-keep-graph': '아키텍처',
  'lazycodex-agent-harness-analysis': '에이전트',
  'oh-my-pi-deep-review': '검증',
  'open-design-repo-analysis': '디자인',
  'pgvector-hybrid-search': '데이터',
  'ponytail-agent-minimalism-analysis': '에이전트',
  'postgresql-bm25-pg-search': '데이터',
  'shared-ai-conversation-evidence-boundaries': '검증',
  'uncle-bob-ai-code-review-evidence': '검증',
} as const;
```

- [ ] **Step 4: Replace the home Scene loader and component**

Load fixed IDs for one lead article, one review, one distinct article pick and the single thought from the verified release. Render the approved inverse-header black/text and terracotta/media hero followed by exactly three editorial picks. The CTA is `이 글 읽기`, not `최근`. Remove focus query, SceneObject, history checkpoint and Continuity Zoom behavior.

- [ ] **Step 5: Replace the article ledger with editorial rows**

Every public article appears once in a single non-paginated ledger. The visible title is `아티클`; filters are `전체 · 에이전트 · 디자인 · 데이터 · 아키텍처 · 검증` and use canonical GET query URLs. A missing approved image uses the text-led variant without placeholder art. Only the first visible media may be eager; remaining rows are lazy with intrinsic dimensions.

- [ ] **Step 6: Replace the article threshold with the detail frame**

Keep `articleStake`, TOC extraction and `확인한 자료` colophon, but visible type is `아티클`. Preserve verified figures and render prose in the approved narrow measure.

- [ ] **Step 7: Replace route critical CSS accounting**

`/` loads home CSS, collection indexes load index CSS, article/review/thought detail loads detail CSS, and search loads search CSS. Remove scene/reading mode assumptions.

- [ ] **Step 8: Run the vertical-slice suite**

```bash
npm exec vitest run apps/site/test/ui/home.test.tsx apps/site/test/ui/article-index.test.tsx apps/site/test/ui/article-reading.test.tsx apps/site/test/routes.test.tsx apps/site/test/css-source-accounting.test.ts
npm run public-release:build
npm run public-release:verify
npm run site:build
```

- [ ] **Step 9: Commit if authorized**

Stage only the Task 6 file list and review `git diff --cached --name-status` before `git commit -m "feat: build form and thought vertical slice"`.

---

### Task 7: representative vertical slice를 브라우저에서 승인받고 golden으로 고정한다

**Files:**

- Create: `tests/e2e/form-thought-visual.spec.ts`
- Create: `playwright.form-thought.config.ts`
- Create: `tests/e2e/form-thought-visual.spec.ts-snapshots/`
- Create: `docs/notes/project/evidence/form-and-thought-vertical-slice.md`
- Generate ignored evidence: `output/playwright/form-and-thought-reference-comparison/`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `tests/e2e/mobile-navigation.spec.ts`
- Modify: `tests/e2e/no-js.spec.ts`
- Modify only for parity corrections: exact Task 6 home/article/reading/style/test files changed in Step 3

**Interfaces:**

- Produces approved screenshots for `/`, `/articles/`, one article detail.
- Produces geometry evidence for shell, header, hero/list/detail columns and overflow.

- [ ] **Step 1: Give Playwright one isolated preview**

Create a dedicated Playwright config whose `webServer` builds and verifies the current public release, builds the site, then owns an unused selected port. The same config supplies its base URL to tests; do not start a manual 4397 server while the repository config still targets 4391 and do not reuse an unrelated existing server.

- [ ] **Step 2: Capture desktop and mobile comparisons**

Capture the calibrated primary desktop viewport, 1440×900, 768px, 390×844 and 320px/200% zoom. Place each actual screenshot beside its canonical reference region and record block rectangles plus computed font/color values.

- [ ] **Step 3: Correct differences in a fixed order**

1. page shell and header;
2. major block ratios;
3. type scale and wrapping;
4. whitespace and rules;
5. image crop and color;
6. icon details.

Do not add a new visual idea to hide a mismatch.

- [ ] **Step 4: Run accessibility and interaction checks**

```bash
npx playwright test --config=playwright.form-thought.config.ts tests/e2e/accessibility.spec.ts tests/e2e/mobile-navigation.spec.ts tests/e2e/no-js.spec.ts tests/e2e/form-thought-visual.spec.ts
```

Expected: no serious accessibility issue, console/hydration error or horizontal overflow; focus is visible.

- [ ] **Step 5: Present captures and stop for explicit visual approval**

If rejected, edit only the representative slice and repeat Steps 2–5. Do not expand the component system before approval.

- [ ] **Step 6: Save approved screenshots as goldens**

Record viewport, Git revision, release id and reference IDs in the evidence document.

- [ ] **Step 7: Commit if authorized**

Stage only the dedicated config, updated three E2E contracts, visual spec/snapshots, evidence, and exact Task 6 correction files actually changed in Step 3. Review the staged allowlist before `git commit -m "test: seal form and thought visual baseline"`.

---

### Task 8: 서평 목록과 판정 중심 상세를 확장한다

**Files:**

- Rewrite: `apps/site/src/ui/reviews/BookIndexPage.tsx`
- Modify: `apps/site/src/ui/reviews/bookshelfPresentation.ts`
- Rewrite: `apps/site/src/ui/reading/ReviewReadingPage.tsx`
- Modify: `apps/site/app/routes/reviews-index.tsx`
- Modify: `apps/site/app/routes/review.tsx`
- Rewrite: `apps/site/test/ui/book-index.test.tsx`
- Modify: `apps/site/test/ui/bookshelf-presentation.test.ts`
- Rewrite: `apps/site/test/ui/route-presentations.test.tsx`
- Modify: media/release tests that exclude unapproved cover bytes

**Interfaces:**

- Produces one row per review ordered by `completedAt ?? createdAt` descending.
- Preserves authors, verdict, edition, rights warning and body.
- Enforces `object-fit: contain` only for covers whose edition identity and public redistribution rights are both approved; warning/hold/unverified covers are excluded from public artifact bytes and use text-led fallback.

- [ ] **Step 1: Write failing review tests**

Assert `서평`, title/verdict/date per row, intrinsic dimensions for rights-approved covers, no synthetic cover box, no public asset binding for rights-warning covers, and detail labels that never expose `책` as the lane name.

- [ ] **Step 2: Run and verify RED**

```bash
npm exec vitest run apps/site/test/ui/book-index.test.tsx apps/site/test/ui/bookshelf-presentation.test.ts apps/site/test/ui/route-presentations.test.tsx
```

- [ ] **Step 3: Replace shelf/diary with editorial rows**

Reuse `EditorialPageHeader` and `EditorialListRow`. Keep one-sentence verdict and date sorting; remove shelf tiers and generated `book-cover--set`.

- [ ] **Step 4: Replace review detail**

Use the `reference-06:review-detail-right` template rather than the article split template. Place a rights-approved real cover in its `contain` stage; otherwise use the approved title-led no-media variant and do not emit cover bytes. Show verdict before prose and preserve authors, edition, rights state and completed date. Continuation copy is `서평 전체 보기`.

- [ ] **Step 5: Run focused tests and build**

```bash
npm exec vitest run apps/site/test/ui/book-index.test.tsx apps/site/test/ui/bookshelf-presentation.test.ts apps/site/test/ui/route-presentations.test.tsx apps/site/test/routes.test.tsx
npm run site:build
```

- [ ] **Step 6: Commit if authorized**

Stage only the Task 8 named source and test files. Review the staged allowlist before `git commit -m "feat: redesign public reviews"`.

---

### Task 9: 생각 목록과 상세의 빈 공간 계약을 완성한다

**Files:**

- Modify: `apps/site/src/ui/thoughts/ThoughtIndexPage.tsx`
- Modify: `apps/site/src/ui/thoughts/ThoughtReadingPage.tsx`
- Create: `apps/site/src/ui/styles/route-thought.css`
- Create: `apps/site/test/ui/thought-index.test.tsx`
- Create: `apps/site/test/ui/thought-reading.test.tsx`

**Interfaces:**

- Produces six layout cells with one interactive record and five inert cells.
- Produces short-form detail with no forced TOC or source panel.

- [ ] **Step 1: Write the empty-space contract test**

```tsx
const html = renderToStaticMarkup(<ThoughtIndexPage records={[thought]} assets={new Map()} />);
expect(html.match(/data-thought-cell/gu)).toHaveLength(6);
expect(html.match(/href="\/thoughts\//gu)).toHaveLength(1);
expect(html).not.toMatch(/준비 중|곧 공개|placeholder|skeleton/iu);
```

- [ ] **Step 2: Run and verify RED**

```bash
npm exec vitest run apps/site/test/ui/thought-index.test.tsx apps/site/test/ui/thought-reading.test.tsx
```

- [ ] **Step 3: Implement the grid and mobile translation**

Only the first cell contains the thought card. The five empty cells are `<li data-thought-cell aria-hidden="true" />` with no text, image, accessible name, link, button or role. Wide is near-square 3×2, intermediate is 2×3, and mobile is 1×6; each mobile empty cell is 18–24% of the real-card height and all five together are no taller than one real card.

- [ ] **Step 4: Implement thought detail**

Use the same `reference-03` split detail template as articles and the action rail, omit forced TOC and colophon, preserve body HTML and media omission behavior.

- [ ] **Step 5: Run tests and build**

```bash
npm exec vitest run apps/site/test/ui/thought-index.test.tsx apps/site/test/ui/thought-reading.test.tsx apps/site/test/routes.test.tsx
npm run site:build
```

- [ ] **Step 6: Commit if authorized**

Stage only the Task 9 named source and test files. Review the staged allowlist before `git commit -m "feat: add form and thought thought pages"`.

---

### Task 10: 검색을 keyword discovery와 통합 결과 화면으로 바꾼다

**Files:**

- Modify: `apps/site/app/release.server.ts`
- Modify: `apps/site/app/routes/search.tsx`
- Rewrite: `apps/site/src/ui/search/SearchPage.tsx`
- Create: `apps/site/src/ui/search/popularKeywords.ts`
- Create: `apps/site/src/ui/styles/route-search.css`
- Create: `apps/site/test/ui/search-page.test.tsx`
- Modify: `apps/site/test/routes.test.tsx`
- Modify: `tests/e2e/search-return.spec.ts`

**Interfaces:**

- Produces `SearchKind = 'article' | 'review' | 'thought'`.
- Produces up to eight deterministic public keywords.
- Preserves bounded query and title→tag→description match order.

- [ ] **Step 1: Write failing search tests**

Assert empty query renders `검색`, an accessible GET search form, up to eight real keyword chips and one fixed discovery card per primary lane; results combine only primary lanes; analysis/ideas/travel/memory/tag/topic cannot appear; zero results suggest real keywords; old `글`, `책`, `문장` group headings are absent.

- [ ] **Step 2: Run and verify RED**

```bash
npm exec vitest run apps/site/test/ui/search-page.test.tsx apps/site/test/routes.test.tsx
```

- [ ] **Step 3: Keep matching pure and flatten presentation**

Keep `boundedSearchQuery()` and `matchSearchItem()` pure. Render one relevance-ordered list with visible plain-text type, not badges.

- [ ] **Step 4: Implement popular keyword selection**

Count normalized tags from active public article/review/thought records only, map internal English tags to approved Korean display labels, sort count descending then Korean label ascending, exclude `source-grounded`, `review`, `published`, and return eight. Call them corpus-frequency keywords, not analytics popularity.

- [ ] **Step 5: Build the approved search composition**

Use large title, full-width input, keyword row and three real discovery cards. The bottom quote/image closure appears only with approved copy and media.

- [ ] **Step 6: Run focused and browser tests**

```bash
npm exec vitest run apps/site/test/ui/search-page.test.tsx apps/site/test/routes.test.tsx
npx playwright test --config=playwright.form-thought.config.ts tests/e2e/search-return.spec.ts tests/e2e/no-js.spec.ts
```

- [ ] **Step 7: Commit if authorized**

Stage only the Task 10 named source/test files and review the staged allowlist before `git commit -m "feat: redesign public search"`.

---

### Task 11: 실제 콘텐츠 36편을 새 읽기 구조에 맞게 편집한다

**Files:**

- Modify: `src/content/articles/*.mdx` excluding `example-article.mdx`
- Modify: `src/content/reviews/*.mdx` excluding `example-book-review.mdx`
- Modify: `src/content/thoughts/why-i-read-in-the-ai-era.mdx`
- Modify when claims change: matching `docs/notes/article-factory/*.md`
- Create: `docs/notes/project/evidence/form-and-thought-editorial-ledger.md`

**Interfaces:**

- Produces a 36-record ledger whose outcome is `edited` or `verified-no-change`: 17 editorial-guide articles, 18 verdict-led reviews and one short-form thought.
- Preserves verified facts, opinion direction, quote meaning, URLs, createdAt and source boundary.

- [ ] **Step 1: Freeze the 36-record inventory**

Record slug, collection, createdAt, original title, original core claim, source-grounded flag and evidence packet. Assert counts are exactly 17/18/1 before editing.

- [ ] **Step 2: Edit 17 articles in the five topic batches**

For each article record original claim, revised structure, removed repetition, retained sources and unsupported sentences. Use the project research-and-publish workflow for time-sensitive claims and primary sources. Keep validator-required headings while improving their contents and transitions. If no edit is justified, record `verified-no-change` and preserve `updatedAt`.

- [ ] **Step 3: Edit 18 reviews in book-sized batches**

Lead with the existing verdict, reduce plot-summary dominance and make remaining value, objection and recommendation explicit only where supported. Omit an unsupported objection/recommendation section rather than inventing one. Never invent a reading event or rating.

- [ ] **Step 4: Edit the thought**

Remove article-like scaffolding, keep the slower-reading judgment argument and split long paragraphs into deliberate breaths. Preserve dates and authored meaning.

- [ ] **Step 5: Validate every batch**

```bash
node scripts/validate-content.mjs
npm run article:quality
npm run public-release:build
npm run public-release:verify
npm run public-release:clean-test
```

- [ ] **Step 6: Browser-check the riskiest content**

Inspect the longest article, table-heavy article, longest review title, cover-hold review and thought at 1440×900 and 390×844. Record overflow, broken links, paragraph rhythm and source-panel findings in the ledger.

- [ ] **Step 7: Commit reviewed batches if authorized**

Stage only records marked `edited`, their changed evidence packets, and the ledger. Do not stage `verified-no-change` source files. Review the staged allowlist before the authorized batch commit.

---

### Task 12: 나머지 article imagery를 batch approval로 완성한다

**Files:**

- Generate ignored: `output/form-and-thought-image-candidates/articles/<batch-id>/`
- Create after approval: `docs/notes/project/assets/form-and-thought-generated/articles/decision-manifest-*.yml`
- Create after approval: `docs/notes/project/assets/form-and-thought-generated/articles/approved-contact-sheet-*.png`
- Create after approval: source images under the 17 article directories named by the exact `ARTICLE_TOPICS` keys from Task 6
- Modify after approval: matching `media.yml` and article `featuredMedia`

**Interfaces:**

- Produces approved landscape media where it materially improves reference parity.
- Preserves text-led row for every record without approved media.

- [ ] **Step 1: Group articles into four visual batches**

Use 에이전트, 디자인, 데이터·검색, 아키텍처·검증 groups. Each batch shares light, camera and material grammar but uses distinct compositions.

- [ ] **Step 2: Generate and present one contact sheet per batch**

Keep raw candidates in ignored local output. Show title, candidate ID and `indexLandscape`/`detailHero` crops. After approval retain only the approved contact sheet, decision manifest and approved originals; a rejected slot remains text-led.

- [ ] **Step 3: Integrate approved assets non-destructively**

Add new media IDs, checksums and `sourcePath`. Do not overwrite earlier media or modify review covers.

- [ ] **Step 4: Validate media and crops**

```bash
npm run media:validate -- --strict
npm run public-release:build
npm run public-release:verify
npm run public-release:clean-test
npm run site:build
```

- [ ] **Step 5: Commit each approved batch if authorized**

Stage only the approved batch evidence, exact approved originals, exact media manifests and exact MDX bindings before the authorized batch commit.

---

### Task 13: secondary public routes를 새 shell에 적응시키고 old scene code를 제거한다

**Files:**

- Modify: `apps/site/app/routes/secondary-shared.tsx`
- Modify: `apps/site/src/ui/collections/CollectionPage.tsx`
- Modify: `apps/site/src/ui/collections/RecordRow.tsx`
- Modify: `apps/site/src/ui/memory/MemoryIndexPage.tsx`
- Modify: `apps/site/src/ui/memory/MemoryDetailPage.tsx`
- Modify: `apps/site/src/ui/memory/MemoryMapPage.tsx`
- Modify: `apps/site/src/ui/tags/TagsPage.tsx`
- Delete: `apps/site/src/ui/scene/ScenePage.tsx`
- Delete: `apps/site/src/ui/scene/SceneObject.tsx`
- Delete: `apps/site/src/ui/scene/scene-state.ts`
- Delete: `apps/site/src/ui/styles/scene.css`
- Delete: `apps/site/src/ui/styles/route-scene.css`
- Delete: `apps/site/src/ui/styles/reading.css`
- Delete: `apps/site/src/ui/styles/route-reading.css`
- Delete: `apps/site/src/ui/styles/route-article.css`
- Delete: `apps/site/src/ui/styles/route-review.css`
- Modify/Delete: superseded tests under `apps/site/test/ui/`

**Interfaces:**

- Preserves `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/` and current valid detail/map URLs plus the public/private boundary.
- Removes React Scene and Continuity Zoom code.
- Applies FORM & THOUGHT shell without new primary nav tabs or inclusion in primary search.

- [ ] **Step 1: Write source-accounting assertions**

Assert no rendered copy/metadata contains `public-scene`, `Continuity Zoom`, `data-surface-mode`, `mineral`, visible `장면` or visible `beyondwin` brand copy, and no active CSS contains the retired scene/mineral/cobalt tokens. Do not fail on internal package names such as `@beyondwin/*`, test origins or historical evidence strings.

- [ ] **Step 2: Run and verify RED**

```bash
npm exec vitest run apps/site/test/css-source-accounting.test.ts apps/site/test/ui/route-presentations.test.tsx
```

- [ ] **Step 3: Adapt secondary routes**

Use the paper shell, editorial page header, record rows and detail frame. Preserve canonical URLs and data; keep them outside primary navigation.

- [ ] **Step 4: Delete superseded React source**

Remove imports first, delete scene and old CSS second, then update critical-CSS tests.

- [ ] **Step 5: Run the entire site suite**

```bash
npm run site:test
npm run typecheck --workspace @beyondwin/site
npm run site:build
```

- [ ] **Step 6: Commit if authorized**

Stage only the Task 13 exact source/removal/test manifest and review its replacement-owner table before `git commit -m "refactor: remove superseded public scene UI"`.

---

### Task 14: React-only delivery를 먼저 증명하고 Astro를 exact manifest로 제거한다

**Files:**

- Create: `docs/notes/project/evidence/form-and-thought-astro-removal-manifest.md`
- Create: `docs/notes/project/evidence/form-and-thought-pre-removal-acceptance.md`
- Create/Modify: React sitemap, robots, `404.html`, canonical/OG generation and tests under the exact `apps/site` owners discovered at execution
- Modify: `scripts/cutover/verify-public-site.mts`
- Modify: `scripts/cutover/verify-clean-host.mts`
- Modify/Delete by manifest: Astro/parity/rollback-bound cutover scripts and tests
- Modify: `deploy/reverse-proxy/public-site.conf`
- Modify/Delete by manifest: `deploy/reverse-proxy/public-site-rollback.conf`
- Modify: `scripts/validate-media.mjs`
- Modify/Delete: `scripts/content-migration.test.mjs`
- Replace: `scripts/publication-surfaces.test.mjs` with React release/route/private-boundary ownership
- Modify: `scripts/agent-check.mjs`
- Modify: `scripts/agent-check.test.mjs`
- Modify: `tests/workspace-contract.test.ts`
- Modify: every active `tests/e2e/**` file classified by the removal manifest
- Modify: `vitest.config.mjs`, `package.json`, `package-lock.json`
- Delete only after replacement and acceptance: exact tracked Astro source/config/dependency/parity files listed in the removal manifest

**Interfaces:**

- Proves the React renderer while Astro still exists, then produces React Router as the only public renderer.
- Preserves immutable release build/verify, static export, sitemap/robots/404, canonical/OG, content/media validation, trusted-MDX/private-boundary negative tests, security headers and clean-host recovery.
- Replaces Astro/parity performance comparison with React-only budgets for home, indexes, search and one detail per primary lane.
- Does not authorize deployment, production traffic change or push.

- [ ] **Step 1: Freeze an exact responsibility and deletion manifest**

Use `git ls-files` and import/script searches to list every proposed deletion as an exact path. For each path record its current responsibility, replacement owner and proving test. Explicitly classify `scripts/cutover/verify-public-site.mts`, `scripts/cutover/verify-clean-host.mts`, every `tests/e2e/**` file, package script, parity fixture/tool and reverse-proxy rollback file as retain/rewrite/delete. Broad patterns such as `src/lib/**`, `src/pages/**/*.astro` or directory-wide staging are not executable deletion instructions.

Preserve `src/content/**`, `src/assets/content/**`, `src/data/memory.public.json`, root and scoped `AGENTS.md`, and any framework-neutral helper until a named replacement is green.

- [ ] **Step 2: Implement and test React-only delivery contracts before deletion**

Generate sitemap and robots from verified `fullPublicPaths()`. Define absolute site origin, canonical, OG/social metadata, final FORM & THOUGHT icon/manifest, static-host `404.html` or equivalent actual 404 status, and response headers including CSP, `Referrer-Policy` and `X-Content-Type-Options`. Preserve trusted-MDX injection and private artifact negative tests. Decide RSS explicitly as out of scope unless it already has a public contract that must be preserved.

- [ ] **Step 3: Run the full pre-removal acceptance while Astro still exists**

```bash
npm run public-release:build
npm run public-release:verify
npm run site:build
npx playwright test --config=playwright.form-thought.config.ts
```

The full Chromium suite includes no-JS primary navigation/search, mobile focus trap, direct/modified navigation, reading continuity where still intended, all new route geometry, edge cases and static-host behavior. Record desktop/mobile LCP, CLS, initial JS gzip, font bytes and first-frame image bytes for home, three primary indexes, search and one detail per lane. Define budgets before capture and report unmeasured fields honestly.

- [ ] **Step 4: Migrate cutover and clean-host tools to React-only recovery**

Remove assumptions about Astro baseline, parity tools, rollback renderer and exactly 80 routes. Derive route inventory from the verified React release. Make clean-host verification run clean install → public release build → release verify → site build → HTTP/static-host smoke. Update deployment config to a single React public origin and document Git revision + immutable release artifact as repository recovery. Keep existing public-site cutover evidence immutable and explicitly historical; its `production_cutover_authorized: false` remains true until separate authority exists.

- [ ] **Step 5: Write and run the final no-Astro RED contract**

```ts
expect(declaredDependencies(rootManifest)).not.toHaveProperty('astro');
expect(declaredDependencies(rootManifest)).not.toHaveProperty('@astrojs/mdx');
expect(declaredDependencies(rootManifest)).not.toHaveProperty('@astrojs/check');
expect(rootScripts).not.toHaveProperty('legacy:build');
expect(rootScripts.validate).toContain('npm run public-release:build');
expect(rootScripts.validate).toContain('npm run public-release:verify');
expect(rootScripts.validate).toContain('npm run site:build');
```

Add filesystem/import assertions for `.astro`, `astro.config.mjs` and `astro(?:/|:)`. Confirm RED before deletion.

- [ ] **Step 6: Move reusable validators and negative tests to named owners**

Move `parseMediaManifest`, `findMediaItem` and every still-needed helper from each exact former `src/lib` path to `packages/content` or `packages/contracts`; update callers first. Replace Astro publication-surface tests with React release/route tests without weakening trusted-MDX, source-map, private path, raw prompt/job and public-memory allowlist checks.

- [ ] **Step 7: Delete only the sealed manifest and remove Astro packages**

Delete exact paths after every replacement test is green, then uninstall `astro`, `@astrojs/mdx` and `@astrojs/check`. Reject the task if a proposed deletion lacks a replacement owner or an explicit obsolete rationale. Inspect dangling imports and package scripts before proceeding.

- [ ] **Step 8: Rewrite the root validation contract**

The final `validate` order includes agent/content/media/article/memory checks, workspace tests and typechecks, then `public-release:build`, `public-release:verify`, `public-release:clean-test`, and `site:build`. `clean-test` remains a separate safety test and never supplies the active release.

- [ ] **Step 9: Prove the post-removal clean state**

```bash
npm ci
npm run validate
npx playwright test --config=playwright.form-thought.config.ts
```

Verify the React-only clean-host tool, sitemap/robots/404/security headers, full route inventory, performance budgets, and zero Astro dependency/config/source/import/script. A passing unit suite without the E2E command is incomplete.

- [ ] **Step 10: Commit if authorized**

Stage exactly the paths in the sealed removal/replacement manifest, compare `git diff --cached --name-status` to it, and only then commit `chore: remove astro legacy renderer`.

---

### Task 15: built-truth 문서와 최종 browser acceptance를 맞춘다

**Files:**

- Rewrite: `DESIGN.md`
- Rewrite: `docs/notes/project/architecture-reference.md`
- Modify: `docs/notes/project/agent-runbook.md`
- Modify: `docs/notes/project/getting-started.md`
- Modify: `docs/notes/project/publishing-workflows.md`
- Modify: `README.md`
- Modify: `PRODUCT.md`
- Modify: `SYNC.md`
- Modify: `AGENTS.md`
- Modify: `src/AGENTS.md`
- Modify: `src/content/AGENTS.md`
- Modify: `.agents/skills/site-change/SKILL.md`
- Modify: `docs/notes/project/README.md`
- Modify: `docs/_index/catalog.yml`
- Modify: `docs/_index/topics.yml`
- Modify: `docs/INDEX.md`
- Create: `docs/notes/project/evidence/form-and-thought-final-acceptance.md`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `tests/e2e/mobile-navigation.spec.ts`
- Modify: `tests/e2e/edge-cases.spec.ts`
- Modify: `tests/e2e/no-js.spec.ts`
- Modify: all other E2E files classified as retained by Task 14

**Interfaces:**

- Produces React-only FORM & THOUGHT built-truth documentation.
- Produces desktop/mobile accessibility, empty state, long title, image failure, link and visual evidence.

- [ ] **Step 1: Update built truth after Task 14 passes**

Document the real React route map, primary versus secondary routes, thoughts schema, release flow, commands, removed Astro boundary and approved tokens. Update root/scoped agent guidance and the project site-change skill so none instructs future agents to use Astro. Mark prior visual plans historical without deleting ADR/evidence facts.

- [ ] **Step 2: Run the full browser matrix**

Use 1440×900, calibrated primary reference width, 768px, 390×844 and 320px/200% zoom. Verify home, four primary indexes, one detail per primary lane, retained secondary routes, longest article, longest review title, cover-hold review, empty/non-empty search, no-JS, reduced motion, keyboard-only navigation, menu containment/restore, image failure, table/code overflow and static-host 404.

- [ ] **Step 3: Record exact evidence**

For every checked route record URL, viewport, release id, screenshot, console errors, accessibility, overflow and reference ID. Do not mark an unrun check passed.

- [ ] **Step 4: Run final gates**

```bash
npm run agent:check
npm run validate
git diff --check
git status --short --branch
```

- [ ] **Step 5: Review the complete diff**

Confirm 17 article sources, 18 review sources, one thought; no example is public; no Astro source/dependency/script remains; no unapproved generated candidate is public; unrelated dirty files are unchanged.

- [ ] **Step 6: Commit if authorized**

Stage only the named built-truth docs, agent guidance/skill, acceptance evidence and exact retained E2E files. Review the staged allowlist before `git commit -m "docs: record form and thought built truth"`.

## Execution checkpoints

필수 시각 승인 지점은 Task 3의 typography sheet와 Task 7의 representative vertical slice다. Task 5와 Task 12의 생성 이미지는 contact sheet마다 asset 승인을 받는다. 기능과 구조를 다시 논의하기 위한 checkpoint가 아니라 승인되지 않은 시각 결과를 public release에 넣지 않기 위한 provenance gate다. Reference viewport calibration은 측정 기록이며 새 composition을 선택하는 checkpoint가 아니다.

## Why this sequence

모든 화면을 먼저 정적인 이미지로 다시 그리면 실제 한글 제목, 책 표지, MDX 표·코드, 검색 빈 상태가 뒤늦게 디자인을 깨뜨린다. 반대로 component library부터 만들면 reference에 없는 generic abstraction이 굳어진다. Foundation과 대표 세 화면을 실제 콘텐츠로 함께 구현해 geometry를 검증하고, 승인된 결과에서 component contract를 추출한 뒤 나머지 화면을 확장한다.
