# 서평 제외 아티클 전면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서평과 예시 파일을 제외한 실제 아티클 18편을 최신 1차 자료로 재검증하고, 장르별 목소리를 보존한 채 한국어 문장과 구조를 개선하며, 근거와 검증을 통과한 review 상태 5편만 로컬에서 `published && !draft`로 전환한다.

**Architecture:** 이 작업은 새 schema, route, component, layout, dependency를 만들지 않는다. 각 글은 기존 URL·파일명을 유지한 채 MDX와 (해당 시) evidence packet만 갱신한다. 공개 조건은 기존 `published && !draft`이며, 묶음 A의 5편만 검증 통과 시 로컬 frontmatter를 전환한다. 렌더 확인은 기존 Astro article route를 별도 port에서 사용한다.

**Tech Stack:** Node 24 (`/opt/homebrew/opt/node@24/bin`), npm workspaces, Astro MDX collections, `scripts/validate-content.mjs`, `scripts/article-quality.mjs`, Vitest, Playwright CLI (`$HOME/.codex/skills/playwright/scripts/playwright_cli.sh`).

**Spec:** [docs/notes/project/non-review-article-improvement-design.md](non-review-article-improvement-design.md)

## Global Constraints

- 서평 전체(`src/content/reviews/**`)와 예시 파일 4개(`src/content/articles/example-article.mdx`, `src/content/analysis/example-url-analysis.mdx`, `src/content/ideas/example-idea.mdx`, `src/content/travel/example-travel-note.mdx`)는 수정 금지.
- 기존 URL과 파일명을 유지한다. 글 병합·분할·삭제를 하지 않는다.
- 새 schema, route, component, layout, dependency를 추가하지 않는다.
- top-level `memory/**`와 `src/data/memory.public.json`을 수정하지 않는다.
- Graphify 명령을 실행하지 않는다. Graphify 글은 공식 저장소·문서·이슈만 읽는다.
- 외부 primary source만 최신 사실 검증에 사용한다. 기술 질문의 웹 조사는 공식 문서, 공식 저장소, 릴리스, 소스 코드, 공식 이슈만 사용한다.
- 출처 접근이 막히면 주장이나 근거를 만들어내지 않는다. 그 글은 hold하고 다른 task를 계속한다.
- 긴 직접 인용을 추가하지 않는다. `scripts/validate-content.mjs`는 blockquote 한 줄이 25단어를 넘으면 실패한다.
- verified fact, inference, opinion, unresolved uncertainty를 구분한다.
- 사실·부정·확신·의무·가능성·인과·수량·고유명사·인용·URL을 보존한다.
- 이미 정확하고 자연스러운 문장은 억지로 바꾸지 않는다.
- 모든 장르를 같은 보고서형 문체로 통일하지 않는다. source-grounded 분석, 기술·워크플로 글, 개인 에세이의 장르 차이를 보존한다.
- code span, code block, 명령, structured data는 확인된 오류가 없으면 보존한다.
- 현재 서버(127.0.0.1:3000, 127.0.0.1:4327, *:5173)를 종료하거나 재설정하지 않는다. 미리보기는 4381 이상 별도 port를 사용한다.
- Node는 반드시 24를 사용한다: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- 모든 글의 기존 `createdAt`을 보존한다. 실제로 개선된 글만 `updatedAt: "2026-08-26"`으로 바꾼다. 문장·구조·근거가 전혀 바뀌지 않은 글은 `updatedAt`을 유지한다.
- 묶음 A 5편은 핵심 근거, content validation, route/browser 검증을 모두 통과한 경우에만 `status: "published"`, `draft: false`로 전환한다. 통과하지 못하면 `review`를 유지하고 이유를 보고한다.
- 기존 published 글은 근거 문제만으로 임의 비공개 전환하지 않는다. 핵심 논지가 뒤집히면 polish로 위장하지 말고 hold한다.
- 로컬 frontmatter의 published 전환은 승인됐지만 원격 배포·push·main 병합은 하지 않는다.
- 한국어 편집은 `$korean-writing-editor`의 `polish` 모드를 따른다. 규범 근거는 `https://www.korean.go.kr/kornorms/m/m_regltn.do`이며, 허용된 대안은 오류로 고치지 않는다.
- source-grounded 글은 `tags`에 `source-grounded`를 유지하고, `scripts/article-quality.mjs`가 요구하는 9개 heading을 모두 유지한다:
  - `## 먼저 알아야 할 개념`
  - `## 실제 구조`
  - `## 핵심 기능`
  - `## 좋은 점`
  - `## 조심해야 할 점`
  - `## 언제 쓰면 좋은가`
  - `## 주니어 개발자가 배울 점`
  - `## 내 결론`
  - `## 확인한 자료`
- 기존 extra heading(예: LazyCodex의 `## Hephaestus라는 작업자 모델`)은 독자 흐름을 도우면 유지한다. 9개 필수 heading을 삭제하거나 중복하지 않는다.
- 공개 조건은 `src/lib/content/publicationState.ts`의 `isPublicEntry`: `status === "published" && draft === false`. Astro article listing/detail은 `src/pages/articles/index.astro`와 `src/pages/articles/[slug].astro`에서 이 selector만 사용한다.
- 한 글의 source 접근 실패나 hold는 다른 task를 막지 않는다.
- 현재 baseline의 review cover 권리 warning 17개는 서평 범위이므로 고치지 않는다.
- 커밋은 해당 task 파일만 staged한다. 범위 밖 파일을 `git add`하지 않는다.

### Shared Editorial Procedure

모든 article task는 아래 절차를 해당 글에 적용한다. 값은 각 task의 Files/Primary sources에서 가져온다.

1. **Read set.** 아티클 MDX, 매칭 evidence packet(있으면), `src/content/AGENTS.md`, `docs/notes/project/publishing-workflows.md`의 source-grounded 절, 이 plan의 Global Constraints를 읽는다.
2. **Evidence.** 공식 문서/저장소/릴리스/소스/이슈만 연다. 소셜 담화·3차 블로그는 담화 신호로만 쓰고 구현 증명으로 쓰지 않는다. 주장마다 fact / inference / opinion / unresolved를 작업 중 구분한다. 시간이 민감한 버전·API·가격·상태·링크를 확인 기준일 `2026-08-26`으로 다시 연다.
3. **Conflict handling.** 공식 자료가 바뀌면 최신 내용과 확인 기준일 또는 버전을 본문과 packet에 반영한다. 기존 주장과 충돌하면 확인 가능한 범위로 축소하거나 조건을 붙인다. 핵심 논지가 뒤집히면 일반 polish로 위장하지 말고 hold한다.
4. **Structure.** 제목과 description은 본문 논지를 더 정확히 안내할 때만 바꾼다. 도입부는 질문과 결론을 빠르게 보이게 다듬는다. 문단과 소제목은 문제→판단 순서를 우선하되, 개인 에세이를 기술 보고서 구조로 바꾸지 않는다. 표·목록은 기존 근거가 뒷받침하고 독자 판단을 도울 때만 유지하거나 재배치한다. 모든 글에 같은 요약표나 같은 결론 형식을 강제하지 않는다.
5. **Korean polish.** 맞춤법·띄어쓰기·문법을 국소 교정한다. 어색한 절, 불필요한 중복, 반복적인 보고서형 전환을 다듬는다. 1인칭, 의도적 단문·반복·간접성·강도를 복원한다. 원문과 비교해 의미·확신·인과·의무·수량이 달라진 수정은 되돌린다. 이미 적절한 문장은 그대로 둔다.
6. **Metadata.** `createdAt`은 task에 적힌 원본 값을 유지한다. 실제 개선이 있으면 `updatedAt: "2026-08-26"`. tags, `recordKind`, `evidenceState`, `featuredMedia`, `relationships`, `draft`(묶음 A 공개 전환 전)는 확인된 변경이 아니면 보존한다.
7. **Packet.** source-grounded 글은 evidence packet의 Source Inventory, Evidence Ledger, Blind Spots, Editorial Decisions, Quality Gate Notes를 본문과 일치시킨다. 원문의 의미를 별도 fixture로 저장하지 않는다. packet metadata가 크게 바뀌면 `docs/_index/catalog.yml`과 `docs/INDEX.md`의 해당 packet 행만 날짜/summary가 틀어졌을 때 고친다.
8. **Publish decision (묶음 A only).** 핵심 근거가 살아 있고, focused validation이 통과하고, 해당 slug의 detail route와 `/articles/` listing을 desktop 1280 / mobile 390에서 확인한 뒤에만 `status: "published"`와 `draft: false`를 쓴다. `karpathy-delete-everything-keep-graph.mdx`는 현재 `draft: true`이므로 공개 시에만 `draft: false`로 바꾼다. 실패하면 `review`를 유지하고 report에 이유를 적는다.
9. **Focused validation.**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/validate-content.mjs
npm run article:quality
git diff --check
```

Expected: `Content validation passed.` 와 `Article quality validation passed.` 와 `git diff --check` empty. 새 실패가 해당 글에서 나면 고친다. review cover warning 17개는 기존이며 고치지 않는다.

10. **Route/browser.** 기존 서버를 건드리지 말고 별도 port에서 Astro를 띄운다. published 글만 route가 생긴다. 묶음 A를 아직 `review`로 둔 동안 detail route는 존재하지 않으므로, 공개 전환 후에만 detail을 연다. hold한 글은 `/articles/`에 나타나지 않는지만 확인한다.

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export PWCLI="$HOME/.codex/skills/playwright/scripts/playwright_cli.sh"
command -v npx
PORT=<task-port>
npm run legacy:dev -- --port "$PORT" --host 127.0.0.1 --strictPort
```

Then:

```bash
"$PWCLI" open "http://127.0.0.1:${PORT}/articles/<slug>/"
"$PWCLI" screenshot
"$PWCLI" eval "JSON.stringify({title: document.title, width: innerWidth, h1: document.querySelector('h1')?.textContent, h2: [...document.querySelectorAll('h2')].map(h => h.textContent), links: [...document.querySelectorAll('article a')].slice(0, 20).map(a => a.href), tables: [...document.querySelectorAll('table')].map(t => ({overflow: t.scrollWidth > t.clientWidth, cols: t.querySelectorAll('th,td').length})), consoleHint: 'check page errors in later snapshot'})"
```

Repeat at mobile width 390 after resizing the viewport if the CLI supports it; otherwise open a second headed session sized to 390. Check title, description/meta, heading rhythm, links, table overflow, console errors. Stop the **this-task** Astro process only (`kill` the PID you started). Do not touch PID listeners on 3000, 4327, or 5173.

11. **Scope check before commit.**

```bash
git diff --name-only
git diff -- src/content/reviews src/content/articles/example-article.mdx src/content/analysis/example-url-analysis.mdx src/content/ideas/example-idea.mdx src/content/travel/example-travel-note.mdx
```

Expected: excluded paths empty. Only this task's allowlisted files changed.

12. **Commit** with the exact `git add` paths and message in the task. Do not `git add -A`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/content/articles/agents-md-vs-agent-skills-evidence.mdx` | 묶음 A. AGENTS.md vs Skills 근거 글. createdAt `2026-07-26`. |
| `docs/notes/article-factory/agents-md-vs-agent-skills-evidence.md` | 위 글 evidence packet. |
| `src/content/articles/aws-static-frontend-serverless-bff.mdx` | 묶음 A. AWS 정적 프론트+BFF. createdAt `2026-07-26`. |
| `docs/notes/article-factory/aws-static-frontend-serverless-bff.md` | 위 글 evidence packet. |
| `src/content/articles/karpathy-delete-everything-keep-graph.mdx` | 묶음 A. Karpathy graph 원전 대조. createdAt `2026-08-18`. 현재 `draft: true`. |
| `docs/notes/article-factory/karpathy-delete-everything-keep-graph.md` | 위 글 evidence packet. |
| `src/content/articles/shared-ai-conversation-evidence-boundaries.mdx` | 묶음 A. 공유 AI 대화 근거 경계. createdAt `2026-07-26`. |
| `docs/notes/article-factory/shared-ai-conversation-evidence-boundaries.md` | 위 글 evidence packet. |
| `src/content/articles/uncle-bob-ai-code-review-evidence.mdx` | 묶음 A. CRAP/crap4java 근거 글. createdAt `2026-07-26`. |
| `docs/notes/article-factory/uncle-bob-ai-code-review-evidence.md` | 위 글 evidence packet. |
| `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx` | 묶음 B. Graphify. createdAt `2026-07-12`. 이미 published. |
| `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md` | 위 글 evidence packet. |
| `src/content/articles/hermes-agent-persistent-worker-runtime.mdx` | 묶음 B. Hermes Agent. createdAt `2026-06-29`. |
| `docs/notes/article-factory/hermes-agent-persistent-worker-runtime.md` | 위 글 evidence packet. |
| `src/content/articles/lazycodex-agent-harness-analysis.mdx` | 묶음 B. LazyCodex. createdAt `2026-06-24`. |
| `docs/notes/article-factory/lazycodex-agent-harness-analysis.md` | 위 글 evidence packet. |
| `src/content/articles/oh-my-pi-deep-review.mdx` | 묶음 B. oh-my-pi. createdAt `2026-07-12`. |
| `docs/notes/article-factory/oh-my-pi-deep-review.md` | 위 글 evidence packet. |
| `src/content/articles/ponytail-agent-minimalism-analysis.mdx` | 묶음 B. Ponytail. createdAt `2026-06-25`. |
| `docs/notes/article-factory/ponytail-agent-minimalism-analysis.md` | 위 글 evidence packet. |
| `src/content/articles/ai-design-references.mdx` | 묶음 C. 짧은 디자인 도구 워크플로. createdAt `2026-05-16`. |
| `src/content/articles/codex-ui-mockup-workflow.mdx` | 묶음 C. 목업→UI 순서. createdAt `2026-05-16`. |
| `src/content/articles/context-refinement-system-design.mdx` | 묶음 C. Context refinement 설계. createdAt `2026-05-16`. |
| `src/content/articles/andrej-karpathy-skills-analysis.mdx` | 묶음 C. andrej-karpathy-skills 저장소 분석. createdAt `2026-05-16`. |
| `src/content/articles/open-design-repo-analysis.mdx` | 묶음 C. nexu-io/open-design 분석. createdAt `2026-05-16`. |
| `src/content/articles/pgvector-hybrid-search.mdx` | 묶음 C. pgvector 장문. createdAt `2026-07-09`. |
| `src/content/articles/postgresql-bm25-pg-search.mdx` | 묶음 C. PostgreSQL BM25 장문. createdAt `2026-07-09`. |
| `src/content/articles/why-i-read-in-the-ai-era.mdx` | 묶음 D. 개인 에세이. createdAt `2026-08-16`. `featuredMedia: reading-desk-cobalt` 보존. |
| `docs/_index/catalog.yml` | packet summary/date가 실제로 바뀐 경우에만 해당 행 수정. Task 16은 최종 범위 확인만. |
| `docs/INDEX.md` | catalog와 같은 조건. |

Do not create new content files. Do not edit `docs/_index/topics.yml` unless a topic id/description actually changes; this plan does not change the topic set.

---

### Task 1: AGENTS.md vs Agent Skills 근거 재검증

**Files:**
- Modify: `src/content/articles/agents-md-vs-agent-skills-evidence.mdx`
- Modify: `docs/notes/article-factory/agents-md-vs-agent-skills-evidence.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/agents-md-vs-agent-skills-evidence/` (only if published)

**Interfaces:**
- Consumes: createdAt `"2026-07-26"`; current `status: "review"`; tags `["AI", "agents", "workflow", "source-grounded"]`; packet status `verified`.
- Produces: 동일 slug의 개선된 MDX와 packet. 검증 통과 시 `status: "published"`, `draft: false`, `updatedAt: "2026-08-26"`. 실패 시 `status: "review"` 유지.
- Primary sources (open these, not secondary recaps):
  - https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
  - https://nextjs.org/evals
  - https://agents.md/
  - https://agentskills.io/specification
  - https://developers.openai.com/blog/eval-skills
  - https://arxiv.org/html/2606.15828v2
- Local intake `/Users/user/Downloads/agents_md_skills_review.html` is an intake artifact, not a publishable primary source. If it is missing, do not invent its contents; use the primary URLs.

- [ ] **Step 1: Read the current article, packet, and Global Constraints.** Confirm the nine required headings and that percentages in the body are scoped to Vercel vs Next.js public table.

- [ ] **Step 2: Re-open every primary source listed above.** Record current numbers, dates, and any changed wording. Do not treat Next.js public evals as a reproduction of Vercel’s 53/53/79/100 result.

- [ ] **Step 3: Apply Shared Editorial Procedure structure + Korean polish.** Keep the hybrid-architecture conclusion. Do not upgrade “this experiment” into “AGENTS.md is always better.”

- [ ] **Step 4: Align the evidence packet.** Update Source Inventory, Evidence Ledger, Blind Spots, Editorial Decisions, and Quality Gate Notes to the 2026-08-26 check. If publication is justified, change packet editorial note from “keep at review” to “local published after verification.”

- [ ] **Step 5: Set metadata.** Preserve `createdAt: "2026-07-26"`. If the article actually changed, set `updatedAt: "2026-08-26"`. Publish only after Step 6–7 pass.

- [ ] **Step 6: Focused validation.**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/validate-content.mjs
npm run article:quality
git diff --check
```

Expected: both validators pass; `git diff --check` silent.

- [ ] **Step 7: Browser check on port 4381.** If publishing, confirm `/articles/` lists the title and `/articles/agents-md-vs-agent-skills-evidence/` renders title, description, headings, links, no table overflow, no console error at 1280 and 390. If holding, confirm it is absent from `/articles/`. Stop only the 4381 process.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/agents-md-vs-agent-skills-evidence.mdx docs/notes/article-factory/agents-md-vs-agent-skills-evidence.md
git commit -m "$(cat <<'EOF'
content: re-verify AGENTS.md vs Skills article

Refresh primary-source claims, preserve the hybrid conclusion, and publish locally only after validation and route checks pass.
EOF
)"
```

If catalog summary/date for this packet is now wrong, include `docs/_index/catalog.yml` and `docs/INDEX.md` in the same commit with a one-line summary fix only.

---

### Task 2: AWS 정적 프론트엔드와 서버리스 BFF

**Files:**
- Modify: `src/content/articles/aws-static-frontend-serverless-bff.mdx`
- Modify: `docs/notes/article-factory/aws-static-frontend-serverless-bff.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/aws-static-frontend-serverless-bff/`

**Interfaces:**
- Consumes: createdAt `"2026-07-26"`; `status: "review"`; tags `["AWS", "frontend", "architecture", "source-grounded"]`.
- Produces: 개선된 MDX/packet. 검증 통과 시 local published. Time-sensitive AWS quota/pricing numbers must be dated.
- Primary sources:
  - https://nextjs.org/docs/app/guides/static-exports
  - https://nextjs.org/docs/app/guides/backend-for-frontend
  - https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html
  - https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
  - https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html
  - https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html
  - https://aws.amazon.com/cloudfront/pricing/
  - https://aws.amazon.com/api-gateway/pricing/
  - https://aws.amazon.com/lambda/pricing/
  - https://github.com/beyondwin/ReadMates/blob/main/docs/development/adr/0001-cloudflare-pages-functions-bff.md (ReadMates precedent only; if private/unavailable, keep the existing scoped claim and mark the access limit in the packet)

- [ ] **Step 1: Read article, packet, Global Constraints.** Note current Next.js static-export exclusions, 30s HTTP API timeout, 10 MB payload, OAC vs S3 website endpoint, CloudFront first-match behavior.

- [ ] **Step 2: Re-open official Next.js and AWS docs.** Update numbers that changed. Keep ReadMates ADR as project-specific, not a universal AWS rule. If a pricing table changed, qualify with the check date instead of inventing a new price.

- [ ] **Step 3: Structure + Korean polish via Shared Editorial Procedure.** Keep security/cost/ops caveats. Do not convert possibility into obligation.

- [ ] **Step 4: Align packet ledger and time-sensitive flags.**

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-07-26"`. `updatedAt: "2026-08-26"` only if changed. Publish only after validation and browser pass.

- [ ] **Step 6: Focused validation** — same commands as Task 1 Step 6. Expected: pass.

- [ ] **Step 7: Browser check on port 4382** for `/articles/aws-static-frontend-serverless-bff/` after publish, or listing absence if held. Stop only 4382.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/aws-static-frontend-serverless-bff.mdx docs/notes/article-factory/aws-static-frontend-serverless-bff.md
git commit -m "$(cat <<'EOF'
content: re-verify AWS static frontend and BFF article

Refresh official Next.js and AWS constraints, keep project-specific caveats scoped, and publish locally only after checks pass.
EOF
)"
```

---

### Task 3: Karpathy graph 원전 대조

**Files:**
- Modify: `src/content/articles/karpathy-delete-everything-keep-graph.mdx`
- Modify: `docs/notes/article-factory/karpathy-delete-everything-keep-graph.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/karpathy-delete-everything-keep-graph/`
- Do not edit `docs/notes/karpathy-graph/delete-everything-keep-graph.html` unless a broken in-article link requires a factual caption fix; default is leave it.

**Interfaces:**
- Consumes: createdAt `"2026-08-18"`; `status: "review"`; `draft: true`; `recordKind: "research"`; `evidenceState: "source-grounded"`; two `relationships` entries targeting `articles/graphify-code-knowledge-graph-deep-dive` and `articles/andrej-karpathy-skills-analysis`. Preserve those relationship targets and reasons unless a factual error is proven.
- Produces: 개선된 MDX/packet. 공개 시에만 `draft: false` and `status: "published"`.
- Primary sources:
  - https://www.youtube.com/watch?v=XdbpCM4yGyE
  - https://www.youtube.com/watch?v=XfpMkf4rD6E
  - https://www.youtube.com/watch?v=96jN2OCOfLs
  - https://karpathy.bearblog.dev/sequoia-ascent-2026/
  - https://www.anthropic.com/engineering/building-effective-agents
  - https://x.com/karpathy/status/1617979122625712128
  - Packet-listed X posts only as wrappers, not as Karpathy’s words
  - Google Drive PDF is independent July 2026 study note, not an Anthropic paper. If Drive is blocked, keep the packet’s already-captured SHA-256 `c2143749bcec9c304071e9f8fd6c9b498aaec21459e658d1a58bd84ecb0fe26c` facts; do not invent new PDF claims.

- [ ] **Step 1: Read article, packet, Global Constraints.** The load-bearing claims are: the 68-minute package is a 2023 stitch; “delete everything keep attention”; Karpathy did not say “Prompting is fading away” in the captured transcript; 2026 Graph Engineering is not one concept.

- [ ] **Step 2: Re-open official 2026 Karpathy/Anthropic sources.** Do not treat X wrappers as lectures. If a login-walled X article remains blocked, keep the packet’s existing boundary and do not guess its body.

- [ ] **Step 3: Structure + Korean polish.** Keep the investigative voice. Do not flatten into a tool review template beyond the required source-grounded headings.

- [ ] **Step 4: Align packet.** Preserve captured transcript-backed claims. Update check date.

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-08-18"`, `recordKind`, `evidenceState`, `relationships`. Publish only after Steps 6–7; publishing requires `draft: false`.

- [ ] **Step 6: Focused validation** — same commands as Task 1 Step 6. Expected: pass.

- [ ] **Step 7: Browser check on port 4383.** After publish, listing and detail. If held, listing absence and keep `draft: true`. Stop only 4383.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/karpathy-delete-everything-keep-graph.mdx docs/notes/article-factory/karpathy-delete-everything-keep-graph.md
git commit -m "$(cat <<'EOF'
content: re-verify Karpathy graph-origin article

Keep 2023 lecture claims scoped to transcripts and official 2026 sources, and publish locally only after validation and route checks.
EOF
)"
```

---

### Task 4: 공유된 AI 대화 근거 경계

**Files:**
- Modify: `src/content/articles/shared-ai-conversation-evidence-boundaries.mdx`
- Modify: `docs/notes/article-factory/shared-ai-conversation-evidence-boundaries.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/shared-ai-conversation-evidence-boundaries/`

**Interfaces:**
- Consumes: createdAt `"2026-07-26"`; `status: "review"`; tags `["AI", "research", "evidence", "source-grounded"]`.
- Produces: 개선된 MDX/packet. 원 소셜 게시물에 접근하지 못하면 그 게시물의 내용을 복원하지 않는다.
- Primary sources:
  - https://support.claude.com/en/articles/10593882-share-and-unshare-chats
  - Adjacent technical sources already in the packet (Vercel eval, Agent Skills spec, arXiv preprint) only for the independent verification procedure, not as substitutes for the missing Threads post.

- [ ] **Step 1: Read article and packet.** The original Threads post and Claude share URL were not recovered. That gap is load-bearing.

- [ ] **Step 2: Re-open Claude official share/unshare help.** Confirm snapshot timing, omitted attachments, hidden raw MCP data, org limits. Do not fetch or reconstruct the missing social post.

- [ ] **Step 3: Structure + Korean polish.** Keep the methodological thesis: a shared conversation is a discovery artifact until primary sources are checked.

- [ ] **Step 4: Align packet.** Keep the 429 / missing URL evidence. Update check date.

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-07-26"`. Publish only if the article’s claims are fully backed by reachable official docs plus the documented gap. Do not publish a reconstructed social narrative.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4384.** Publish or hold as justified. Stop only 4384.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/shared-ai-conversation-evidence-boundaries.mdx docs/notes/article-factory/shared-ai-conversation-evidence-boundaries.md
git commit -m "$(cat <<'EOF'
content: re-verify shared-conversation evidence boundaries

Keep unreachable social posts as a documented gap, refresh official Claude share rules, and publish locally only if the methodological claims hold.
EOF
)"
```

---

### Task 5: Uncle Bob AI code review / CRAP

**Files:**
- Modify: `src/content/articles/uncle-bob-ai-code-review-evidence.mdx`
- Modify: `docs/notes/article-factory/uncle-bob-ai-code-review-evidence.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/uncle-bob-ai-code-review-evidence/`

**Interfaces:**
- Consumes: createdAt `"2026-07-26"`; `status: "review"`; tags `["AI", "code-review", "testing", "source-grounded"]`; inspected commit `69b561209f130ece728f19b0001e90df5a117c3a`.
- Produces: 개선된 MDX/packet. Do not claim Maven tests ran unless they actually run in this task.
- Primary sources:
  - https://github.com/unclebob/crap4java
  - https://x.com/unclebobmartin/status/2080257779395154409 (claim source; verify if reachable, otherwise keep packet boundary)
  - CRAP formula and Java sources in the canonical repo

- [ ] **Step 1: Read article and packet.** Note runtime limit: Maven was missing; a focused javac harness was used.

- [ ] **Step 2: Inspect current `unclebob/crap4java` default branch, README, and analyzer sources via GitHub.** Update the inspected commit if HEAD moved, and re-state what was and was not executed. Do not run untrusted downloaded code unless a read-only clone plus already-documented focused compile is required to re-check a numeric claim; never execute Graphify.

- [ ] **Step 3: Structure + Korean polish.** Keep the boundary: CRAP can catch some risk, not “you never need to read AI code.”

- [ ] **Step 4: Align packet Reproduction Evidence.** If you cannot re-run the harness, keep the 2026-07-26 observed output and label it historical; do not invent new numbers.

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-07-26"`. Publish only after Steps 6–7.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4385.** Stop only 4385.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/uncle-bob-ai-code-review-evidence.mdx docs/notes/article-factory/uncle-bob-ai-code-review-evidence.md
git commit -m "$(cat <<'EOF'
content: re-verify Uncle Bob CRAP review article

Refresh crap4java source claims, keep runtime limits explicit, and publish locally only after validation and route checks.
EOF
)"
```

---

### Task 6: Graphify 코드 지식 그래프

**Files:**
- Modify: `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`
- Modify: `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/graphify-code-knowledge-graph-deep-dive/`

**Interfaces:**
- Consumes: createdAt `"2026-07-12"`; already `status: "published"`; do not unpublish. Packet pinned commit `591da764a18db9c558de627accd61a61b32bc23e`.
- Produces: 개선된 MDX/packet. Keep published.
- Primary sources:
  - https://github.com/Graphify-Labs/graphify
  - README, ARCHITECTURE.md, BENCHMARKS.md, SECURITY.md, pyproject.toml at current default branch
  - Source files `graphify/build.py`, `serve.py`, `cli.py`, `detect.py`, `watch.py`, `cache.py`, `export.py`, `benchmark.py` as they exist on the inspected commit
  - https://pypi.org/project/graphifyy/
  - Official issues listed in the packet
- Forbidden: running Graphify CLI, restore, or install as a project operating dependency.

- [ ] **Step 1: Read the 416-line article and packet.** Keep experiment caveats and security/ops blind spots.

- [ ] **Step 2: Re-open the official repository, docs, PyPI, and issues.** If HEAD moved, compare against the pinned commit and update claims that the current docs now contradict. Do not run Graphify.

- [ ] **Step 3: Structure + Korean polish.** Keep the investigative technical-blog voice. Do not add a fake local benchmark.

- [ ] **Step 4: Align packet inventory and ledger with the 2026-08-26 check.**

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-07-12"` and `status: "published"`. Set `updatedAt: "2026-08-26"` if the article actually changed.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4386** for `/articles/graphify-code-knowledge-graph-deep-dive/` at 1280 and 390. Confirm it remains on `/articles/`. Stop only 4386.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md
git commit -m "$(cat <<'EOF'
content: re-verify Graphify knowledge-graph article

Refresh official repository and issue evidence without running Graphify, and keep the published article’s caveats intact.
EOF
)"
```

---

### Task 7: Hermes Agent persistent worker runtime

**Files:**
- Modify: `src/content/articles/hermes-agent-persistent-worker-runtime.mdx`
- Modify: `docs/notes/article-factory/hermes-agent-persistent-worker-runtime.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/hermes-agent-persistent-worker-runtime/`

**Interfaces:**
- Consumes: createdAt `"2026-06-29"`; published; packet commit `d0d2cf1c2f7e821e6d06a7a0e838ad66c6e17fd5`.
- Produces: 개선된 MDX/packet. Keep published.
- Primary sources:
  - https://github.com/NousResearch/hermes-agent
  - README.md, website/docs developer-guide and user-guide pages listed in the packet
  - GitHub issues cited in the packet via official issue pages

- [ ] **Step 1: Read article and packet.**

- [ ] **Step 2: Re-open the official repo, docs, and cited issues.** Update version/architecture claims that current docs change. Do not execute the agent runtime.

- [ ] **Step 3: Structure + Korean polish.** Keep advantage/risk/adoption criteria.

- [ ] **Step 4: Align packet.** Update inspected commit if HEAD moved.

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-06-29"` and published status.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4387.** Stop only 4387.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/hermes-agent-persistent-worker-runtime.mdx docs/notes/article-factory/hermes-agent-persistent-worker-runtime.md
git commit -m "$(cat <<'EOF'
content: re-verify Hermes Agent runtime article

Refresh official NousResearch sources and issue evidence, and keep published status while tightening dated claims.
EOF
)"
```

---

### Task 8: LazyCodex agent harness

**Files:**
- Modify: `src/content/articles/lazycodex-agent-harness-analysis.mdx`
- Modify: `docs/notes/article-factory/lazycodex-agent-harness-analysis.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/lazycodex-agent-harness-analysis/`

**Interfaces:**
- Consumes: createdAt `"2026-06-24"`; published; extra headings `## Hephaestus라는 작업자 모델` and `## Ultraresearch와 최근 논의` may remain; packet observed `v4.13.0` / commit `d4c4f05`.
- Produces: 개선된 MDX/packet. Keep published.
- Primary sources:
  - https://github.com/code-yeongyu/lazycodex
  - https://lazycodex.ai/docs
  - https://lazycodex.ai/
  - https://github.com/code-yeongyu/oh-my-openagent
  - https://github.com/openai/codex
- Threads/Zenn are discourse signals, not implementation proof.

- [ ] **Step 1: Read article and packet.** Keep the nine required headings plus existing extra headings unless a heading now duplicates a required one.

- [ ] **Step 2: Re-open official repo, docs, OmO, and Codex.** Update version and command-surface claims. Do not execute LazyCodex.

- [ ] **Step 3: Structure + Korean polish.**

- [ ] **Step 4: Align packet** with new version/commit and a 2026-08-26 check date.

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-06-24"` and published status.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4388.** Stop only 4388.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/lazycodex-agent-harness-analysis.mdx docs/notes/article-factory/lazycodex-agent-harness-analysis.md
git commit -m "$(cat <<'EOF'
content: re-verify LazyCodex harness article

Refresh official LazyCodex, OmO, and Codex sources, keep extra structural headings, and leave the article published.
EOF
)"
```

---

### Task 9: oh-my-pi deep review

**Files:**
- Modify: `src/content/articles/oh-my-pi-deep-review.mdx`
- Modify: `docs/notes/article-factory/oh-my-pi-deep-review.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/oh-my-pi-deep-review/`

**Interfaces:**
- Consumes: createdAt `"2026-07-12"`; published; description currently says “2026년 7월 공개 소스”.
- Produces: 개선된 MDX/packet. Keep published. If the checked source date changes, update the description’s date phrase to match the new check, not a fake new dataset.
- Primary sources:
  - https://github.com/can1357/oh-my-pi
  - README.md, package.json, packages/coding-agent docs and sources listed in the packet
  - docs/approval-mode.md, extension-loading.md, mcp-config.md, secrets.md, session.md against matching source files

- [ ] **Step 1: Read article and packet.** Security/approval/MCP trust boundaries are load-bearing.

- [ ] **Step 2: Re-open official repo and the listed source files.** Do not execute the agent. Update yolo/default-approval claims only from source.

- [ ] **Step 3: Structure + Korean polish.** Keep the caution-heavy voice.

- [ ] **Step 4: Align packet.**

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-07-12"` and published status.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4389.** Stop only 4389.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/oh-my-pi-deep-review.mdx docs/notes/article-factory/oh-my-pi-deep-review.md
git commit -m "$(cat <<'EOF'
content: re-verify oh-my-pi harness article

Refresh official source and security-boundary claims from the repository, and keep the published caution structure.
EOF
)"
```

---

### Task 10: Ponytail agent minimalism

**Files:**
- Modify: `src/content/articles/ponytail-agent-minimalism-analysis.mdx`
- Modify: `docs/notes/article-factory/ponytail-agent-minimalism-analysis.md`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/ponytail-agent-minimalism-analysis/`

**Interfaces:**
- Consumes: createdAt `"2026-06-25"`; published; packet observed `v4.8.3` / commit `a945778b4a73b0b78c3c781a594b62cd3a324637`; extra heading `## 벤치마크를 어떻게 읽어야 하나` may remain.
- Produces: 개선된 MDX/packet. Keep published.
- Primary sources:
  - https://github.com/DietrichGebert/ponytail
  - https://github.com/DietrichGebert/ponytail/releases
  - https://www.npmjs.com/package/@dietrichgebert/ponytail
  - repo docs `docs/agent-portability.md`, `docs/platform-native.md`, benchmark report in `benchmarks/results/`

- [ ] **Step 1: Read article and packet.** Treat star counts and versions as time-sensitive.

- [ ] **Step 2: Re-open GitHub, npm, and official docs.** Update version/release/adapter map. Read benchmarks as the repo’s own methodology, not an independent audit. Do not execute Ponytail.

- [ ] **Step 3: Structure + Korean polish.** Keep the extra benchmark-reading heading.

- [ ] **Step 4: Align packet** with new version/commit and check date.

- [ ] **Step 5: Metadata.** Preserve `createdAt: "2026-06-25"` and published status.

- [ ] **Step 6: Focused validation** — Task 1 Step 6 commands. Expected: pass.

- [ ] **Step 7: Browser check on port 4390.** Stop only 4390.

- [ ] **Step 8: Commit**

```bash
git add src/content/articles/ponytail-agent-minimalism-analysis.mdx docs/notes/article-factory/ponytail-agent-minimalism-analysis.md
git commit -m "$(cat <<'EOF'
content: re-verify Ponytail minimalism article

Refresh official repository, npm, and benchmark-methodology claims, and keep the published article’s scope limits.
EOF
)"
```

---

### Task 11: 짧은 기술 워크플로 3편

**Files:**
- Modify: `src/content/articles/ai-design-references.mdx`
- Modify: `src/content/articles/codex-ui-mockup-workflow.mdx`
- Modify: `src/content/articles/context-refinement-system-design.mdx`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, routes `/articles/ai-design-references/`, `/articles/codex-ui-mockup-workflow/`, `/articles/context-refinement-system-design/`

**Interfaces:**
- Consumes: all three createdAt `"2026-05-16"`; all `status: "published"`; none are `source-grounded` so the 9-heading gate does not apply; do not add those headings.
- Produces: 세 글의 독립 목소리 유지. Keep published. Do not merge the three articles.
- Primary sources (named tools/products only; verify official sites/repos, do not add new tools):
  - open-design: https://github.com/nexu-io/open-design
  - Pencil, diagram-design, 21st.dev, Refero Styles, Montage Design System, transitions.dev, Font of Web, Logo System, UXSnaps: official homepage or GitHub if the current article names them. If a name cannot be resolved to an official page, keep the name as a dated reference and do not invent a URL.
  - shadcn/ui, Radix UI, MUI, Chakra UI, Mantine: official docs only if the mockup article’s framework list is being fact-checked for existence, not expanded.

- [ ] **Step 1: Read all three articles.** They are short workflow notes, not source-grounded reports. Do not convert them into the 9-heading template.

- [ ] **Step 2: Verify named tools/frameworks against official pages.** Remove or qualify only names that are demonstrably wrong. Do not add new tools, examples, or feelings.

- [ ] **Step 3: Polish each article independently.** Keep list/workflow rhythm. Do not make all three share the same conclusion paragraph.

- [ ] **Step 4: Metadata.** Preserve each `createdAt: "2026-05-16"` and published status. Set `updatedAt: "2026-08-26"` per file only if that file actually changed.

- [ ] **Step 5: Focused validation**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/validate-content.mjs
npm run article:quality
git diff --check
```

Expected: pass.

- [ ] **Step 6: Browser check on port 4391** for the three routes at 1280 and 390. Confirm all three remain on `/articles/`. Stop only 4391.

- [ ] **Step 7: Commit**

```bash
git add src/content/articles/ai-design-references.mdx src/content/articles/codex-ui-mockup-workflow.mdx src/content/articles/context-refinement-system-design.mdx
git commit -m "$(cat <<'EOF'
content: polish short AI workflow articles

Re-check named tools against official pages and improve Korean flow without converting the notes into source-grounded templates.
EOF
)"
```

---

### Task 12: 짧은 저장소 분석 2편

**Files:**
- Modify: `src/content/articles/andrej-karpathy-skills-analysis.mdx`
- Modify: `src/content/articles/open-design-repo-analysis.mdx`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, routes `/articles/andrej-karpathy-skills-analysis/`, `/articles/open-design-repo-analysis/`

**Interfaces:**
- Consumes: both createdAt `"2026-05-16"`; published; not `source-grounded` tagged.
- Produces: two independent analyses. Keep published. Do not merge.
- Primary sources:
  - https://github.com/forrestchang/andrej-karpathy-skills
  - https://github.com/nexu-io/open-design

- [ ] **Step 1: Read both articles.** Keep four-discipline structure in the skills article and local-first/BYO-agent structure in Open Design.

- [ ] **Step 2: Re-open both official repositories (README, skill layout, adapter/runtime docs).** Update claims that current default branches contradict. Do not execute either product. If skill/count numbers drifted, qualify them instead of inventing a census.

- [ ] **Step 3: Polish Korean independently.** Do not restyle both into one report voice.

- [ ] **Step 4: Metadata.** Preserve createdAt `"2026-05-16"` and published. `updatedAt: "2026-08-26"` per changed file.

- [ ] **Step 5: Focused validation** — Task 11 Step 5 commands. Expected: pass.

- [ ] **Step 6: Browser check on port 4392** for both routes at 1280 and 390. Stop only 4392.

- [ ] **Step 7: Commit**

```bash
git add src/content/articles/andrej-karpathy-skills-analysis.mdx src/content/articles/open-design-repo-analysis.mdx
git commit -m "$(cat <<'EOF'
content: re-check short repository analysis articles

Refresh forrestchang/andrej-karpathy-skills and nexu-io/open-design against official repositories and polish each voice separately.
EOF
)"
```

---

### Task 13: pgvector 하이브리드 검색 장문

**Files:**
- Modify: `src/content/articles/pgvector-hybrid-search.mdx`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/pgvector-hybrid-search/`

**Interfaces:**
- Consumes: createdAt `"2026-07-09"`; published; not `source-grounded` tagged, so do not add the 9-heading template. Existing tutorial headings and SQL/code blocks stay unless a documented operator/index error is found.
- Produces: 개선된 장문 튜토리얼. Keep published. No evidence packet file exists; do not create one.
- Primary sources:
  - https://github.com/pgvector/pgvector
  - pgvector README operators, HNSW, IVFFLAT, and index-opclass pairing
  - PostgreSQL docs for FTS only where the article already claims FTS behavior: https://www.postgresql.org/docs/current/textsearch-intro.html
  - Internal lecture-note mention in `## 확인한 자료` stays labeled internal; do not promote it to a public URL.

- [ ] **Step 1: Read the article (1018 lines).** Inventory operators (`<->`, `<#>`, `<=>`, `<+>` if present), index types, and RRF explanation. Do not rewrite working SQL for style.

- [ ] **Step 2: Re-open the official pgvector README and current PostgreSQL FTS intro.** Correct only confirmed errors (operator/index mismatch, removed syntax, wrong distance names). Qualify version-sensitive claims with the 2026-08-26 check.

- [ ] **Step 3: Structure + Korean polish.** Keep junior-tutorial order (big picture → operators → indexes → hybrid → Spring/ops). Do not convert into source-grounded 9 headings. Preserve code blocks unless wrong.

- [ ] **Step 4: Metadata.** Preserve `createdAt: "2026-07-09"` and published. `updatedAt: "2026-08-26"` if changed.

- [ ] **Step 5: Focused validation**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/validate-content.mjs
npm run article:quality
git diff --check
```

Expected: pass. Tables must not introduce quote/blockquote failures.

- [ ] **Step 6: Browser check on port 4393.** Pay extra attention to table overflow and code-block wrapping at 390. Stop only 4393.

- [ ] **Step 7: Commit**

```bash
git add src/content/articles/pgvector-hybrid-search.mdx
git commit -m "$(cat <<'EOF'
content: re-verify pgvector hybrid search article

Refresh operators, indexes, and hybrid-search claims against official pgvector docs, and keep working SQL unless an error is confirmed.
EOF
)"
```

---

### Task 14: PostgreSQL BM25 / pg_search 장문

**Files:**
- Modify: `src/content/articles/postgresql-bm25-pg-search.mdx`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/postgresql-bm25-pg-search/`

**Interfaces:**
- Consumes: createdAt `"2026-07-09"`; published; not `source-grounded` tagged. No evidence packet; do not create one.
- Produces: 개선된 장문 튜토리얼. Keep published.
- Primary sources:
  - https://www.postgresql.org/docs/current/textsearch-intro.html
  - https://www.postgresql.org/docs/current/textsearch-controls.html
  - https://www.postgresql.org/docs/current/textsearch-indexes.html
  - https://docs.paradedb.com/documentation/indexing/create-index
  - https://docs.paradedb.com/documentation/full-text/match
  - https://docs.paradedb.com/documentation/sorting/score
  - https://docs.paradedb.com/documentation/tokenizers/available-tokenizers/ngrams
  - https://docs.paradedb.com/deploy/self-hosted/extension

- [ ] **Step 1: Read the article (733 lines).** Inventory FTS vs BM25 vs pg_search vs n-gram claims and SQL examples.

- [ ] **Step 2: Re-open PostgreSQL and ParadeDB official docs.** Correct syntax that current ParadeDB docs changed (index DDL, match functions, score API). If a URL 404s, replace only with the current official path for the same topic; do not guess a new product.

- [ ] **Step 3: Structure + Korean polish.** Keep the tutorial voice and comparison hedges (“Elasticsearch를 대체할 수 있나?” stays conditional). Preserve code unless wrong.

- [ ] **Step 4: Metadata.** Preserve `createdAt: "2026-07-09"` and published. `updatedAt: "2026-08-26"` if changed.

- [ ] **Step 5: Focused validation** — Task 13 Step 5 commands. Expected: pass.

- [ ] **Step 6: Browser check on port 4394.** Tables and SQL at 1280 and 390. Stop only 4394.

- [ ] **Step 7: Commit**

```bash
git add src/content/articles/postgresql-bm25-pg-search.mdx
git commit -m "$(cat <<'EOF'
content: re-verify PostgreSQL BM25 and pg_search article

Refresh FTS, ParadeDB pg_search, and n-gram claims against official docs, and keep existing hedges and working SQL unless docs contradict them.
EOF
)"
```

---

### Task 15: 개인 에세이 `why-i-read-in-the-ai-era`

**Files:**
- Modify: `src/content/articles/why-i-read-in-the-ai-era.mdx`
- Test: `node scripts/validate-content.mjs`, `npm run article:quality`, route `/articles/why-i-read-in-the-ai-era/`

**Interfaces:**
- Consumes: createdAt `"2026-08-16"`; `status: "published"`; `draft: false`; `recordKind: "essay"`; `evidenceState: "personal"`; `featuredMedia: "reading-desk-cobalt"`; Figure media ids `judgment-scale`, `reading-desk-light`, `shared-reading-table`.
- Produces: 목소리 보존된 에세이. Keep published. Do not add new experience, emotion, statistics, or examples. Do not convert to a technical report or source-grounded headings. Do not edit media assets.

- [ ] **Step 1: Read the essay and the Korean editorial guide voice rules.** Note 1인칭, 의도적 단문, 여운, “혼자 읽은 책에는 나가 많다.”

- [ ] **Step 2: Polish only.** Fix normative spelling/spacing/grammar. Ease clumsy clauses without changing propositions. Restore fragments and repetition. Do not research new facts. Do not add sources.

- [ ] **Step 3: Compare with the original.** Revert any change to negation, modality, causality, or the closing claim that scarcity is judgment rather than answers.

- [ ] **Step 4: Metadata.** Preserve `createdAt: "2026-08-16"`, `draft: false`, `recordKind`, `evidenceState`, `featuredMedia`, Figure media ids, published status. `updatedAt: "2026-08-26"` only if prose actually changed.

- [ ] **Step 5: Focused validation**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/validate-content.mjs
npm run article:quality
git diff --check
```

Expected: pass.

- [ ] **Step 6: Browser check on port 4395** at 1280 and 390. Confirm figures still render and the essay remains on `/articles/` and home lead if it currently appears there. Stop only 4395.

- [ ] **Step 7: Commit**

```bash
git add src/content/articles/why-i-read-in-the-ai-era.mdx
git commit -m "$(cat <<'EOF'
content: polish personal essay on reading in the AI era

Apply conservative Korean polish while preserving first-person voice, figures, and personal-evidence metadata.
EOF
)"
```

If the original is already suitable, commit is still required only when there is a diff; if no edit is justified, leave the file unchanged and report DONE_WITH_CONCERNS: no-op because already suitable. Do not touch `updatedAt` in a no-op.

---

### Task 16: 전체 route / validation / 범위 검사

**Files:**
- Modify: none unless a previous task left a catalog date/summary mismatch for a packet this plan already allowed. Then only `docs/_index/catalog.yml` and `docs/INDEX.md`.
- Test: `npm run validate`, `git diff --check`, Playwright over all in-scope article routes, listing checks, excluded-path diff.

**Interfaces:**
- Consumes: Tasks 1–15 commits; `isPublicEntry` contract; existing review-cover warnings.
- Produces: a completion report in the implementer report file covering pass/fail counts, which bundle A slugs are published vs held, createdAt/updatedAt audit, excluded-path emptiness, and ADR/publishing-policy confirmation. No new ADR (spec: existing policy unchanged).

- [ ] **Step 1: Audit frontmatter for the 18 slugs.**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
python3 - <<'PY'
from pathlib import Path
expected_created = {
  "agents-md-vs-agent-skills-evidence": "2026-07-26",
  "aws-static-frontend-serverless-bff": "2026-07-26",
  "karpathy-delete-everything-keep-graph": "2026-08-18",
  "shared-ai-conversation-evidence-boundaries": "2026-07-26",
  "uncle-bob-ai-code-review-evidence": "2026-07-26",
  "graphify-code-knowledge-graph-deep-dive": "2026-07-12",
  "hermes-agent-persistent-worker-runtime": "2026-06-29",
  "lazycodex-agent-harness-analysis": "2026-06-24",
  "oh-my-pi-deep-review": "2026-07-12",
  "ponytail-agent-minimalism-analysis": "2026-06-25",
  "ai-design-references": "2026-05-16",
  "andrej-karpathy-skills-analysis": "2026-05-16",
  "codex-ui-mockup-workflow": "2026-05-16",
  "context-refinement-system-design": "2026-05-16",
  "open-design-repo-analysis": "2026-05-16",
  "pgvector-hybrid-search": "2026-07-09",
  "postgresql-bm25-pg-search": "2026-07-09",
  "why-i-read-in-the-ai-era": "2026-08-16",
}
bundle_a = {
  "agents-md-vs-agent-skills-evidence",
  "aws-static-frontend-serverless-bff",
  "karpathy-delete-everything-keep-graph",
  "shared-ai-conversation-evidence-boundaries",
  "uncle-bob-ai-code-review-evidence",
}
root = Path("src/content/articles")
for slug, created in expected_created.items():
    text = (root / f"{slug}.mdx").read_text()
    fm = text.split("---", 2)[1]
    assert f'createdAt: "{created}"' in fm, (slug, "createdAt")
    status = "published" if 'status: "published"' in fm else "review"
    draft_false = "draft: false" in fm or ("draft:" not in fm and status == "published")
    print(slug, "status="+status, "createdAt_ok", "updatedAt=" + ("2026-08-26" if 'updatedAt: "2026-08-26"' in fm else "unchanged-or-other"))
    if slug in bundle_a and status == "published":
        assert "draft: true" not in fm, slug
print("frontmatter audit done")
PY
```

Expected: every `createdAt` matches the table. Bundle A published slugs have no `draft: true`.

- [ ] **Step 2: Confirm excluded paths have no diff.**

```bash
git diff origin/main...HEAD -- src/content/reviews src/content/articles/example-article.mdx src/content/analysis/example-url-analysis.mdx src/content/ideas/example-idea.mdx src/content/travel/example-travel-note.mdx src/data/memory.public.json memory
```

Expected: empty. Also `git diff --check`.

- [ ] **Step 3: Confirm source-grounded bodies still match packets for the 10 packet-backed slugs.** Read each pair and list residual mismatches in the report. Fix only if a prior task left an obvious packet/body contradiction on files this task is allowed to touch; otherwise record it as a finding for the reviewer.

- [ ] **Step 4: Re-read accepted ADR-0001 and `docs/notes/project/publishing-workflows.md` public condition.** Confirm this branch did not add an ADR and did not change `isPublicEntry`.

- [ ] **Step 5: Full validation.**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run validate
```

Expected: content/article-quality/memory/tests/Astro check+build pass. Record the exact test file/test counts and Astro page count from this run. Review-cover warnings may remain; do not edit review files to silence them. If validate fails, reproduce with the relevant focused command (`node scripts/validate-content.mjs`, `npm run article:quality`, `npm test`, `npm run legacy:build`) and fix only in-scope article/packet/index files. Unrelated environment failures are recorded, not “fixed” by changing reviews or memory.

- [ ] **Step 6: Browser all in-scope article routes on port 4396.**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export PWCLI="$HOME/.codex/skills/playwright/scripts/playwright_cli.sh"
command -v npx
npm run legacy:preview -- --port 4396 --host 127.0.0.1
```

If preview needs a just-built `dist/`, use the `legacy:build` output from `npm run validate`. Visit `/articles/` plus every published slug among the 18. For held bundle A slugs, confirm absence from `/articles/` and that the detail URL is not in the listing. Check desktop 1280 and mobile 390: title, description, heading rhythm, links, table overflow, console errors. Stop only 4396.

- [ ] **Step 7: Commit only if catalog/index needed a factual summary/date fix.** Otherwise report DONE with no commit.

```bash
git add docs/_index/catalog.yml docs/INDEX.md
git commit -m "$(cat <<'EOF'
docs: sync article-factory index summaries after re-verification

Update catalog and human index only where packet summaries or dates actually changed.
EOF
)"
```

Do not commit when the working tree for this task is empty.

---

## Self-review

1. **Spec coverage.** Spec sections 1–9 map to Global Constraints plus Tasks 1–16. Allowlist A→Tasks 1–5, B→6–10, C→11–14, D→15, verification gate→16. Exclusions, createdAt/updatedAt, publish rules, hold rules, no-ADR, no Graphify, and browser/desktop-mobile checks are explicit.
2. **Placeholder scan.** No TBD/TODO/“add tests”/“similar to Task N.” Commands, ports, paths, and primary URLs are written out.
3. **Type/interface consistency.** Public selector is `published && !draft` everywhere. Packet paths match `docs/notes/article-factory/<slug>.md`. Required source-grounded headings are the nine strings in `scripts/article-quality.mjs`. createdAt table in Task 16 matches Tasks 1–15.
