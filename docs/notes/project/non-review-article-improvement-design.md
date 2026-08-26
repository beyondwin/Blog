# 서평 제외 아티클 전면 개선 설계

- Status: approved, implemented
- Approved: 2026-08-26
- Implemented: 2026-08-26
- Scope: `src/content/articles/`의 실제 아티클 18편
- Excluded: `src/content/reviews/` 전체와 예시·테스트 콘텐츠
- Related guidance: [콘텐츠 운영](publishing-workflows.md), [Agent Runbook](agent-runbook.md), [아키텍처 레퍼런스](architecture-reference.md)

## 1. 목적

서평을 제외한 실제 아티클 18편을 최신 근거와 자연스러운 한국어 기술 블로그 문체에 맞게 개선한다. 모든 글을 하나의 문체로 통일하지 않고, 출처 기반 분석·기술 및 워크플로 글·개인 에세이의 장르 차이를 보존한다.

완료된 작업은 다음 조건을 만족해야 한다.

1. 최신성이 필요한 주장은 공식 문서, 원본 저장소, 릴리스, 소스 코드 같은 1차 자료로 다시 확인한다.
2. 새로운 경험·감정·통계·인용·사례를 근거 없이 만들지 않는다.
3. 제목, 설명, 도입부, 문단 순서, 소제목, 표, 목록과 한국어 문장을 독자의 이해 순서에 맞게 개선한다.
4. 기존 URL과 파일명을 유지한다.
5. 현재 `review`인 실제 아티클 5편은 공개 적합성과 핵심 근거를 통과한 경우에만 공개한다.
6. 서평과 예시·테스트 파일은 변경하지 않는다.

## 2. 결정 범위

### 포함

- 실제 아티클 18편의 본문과 frontmatter.
- 출처 기반 아티클 10편의 기존 evidence packet.
- 기술·도구·저장소 관련 주장의 최신 1차 자료 재검증.
- 보수적인 한국어 교정과 글별 구조 개선.
- `review` 아티클 5편의 공개 전환 판단.
- 변경된 18개 route의 실제 브라우저 검증.

### 제외

- `src/content/reviews/` 아래 모든 서평과 리뷰.
- `src/content/articles/example-article.mdx`.
- `src/content/analysis/example-url-analysis.mdx`.
- `src/content/ideas/example-idea.mdx`.
- `src/content/travel/example-travel-note.mdx`.
- 글 병합, 분할, 삭제, 파일명 변경, route 변경.
- 새 content lane, schema, layout, component, dependency 추가.
- private memory 승격이나 public projection 변경.
- 검증되지 않은 주장 보강을 위한 추정 또는 합성 콘텐츠.

이 작업은 기존 publishing policy를 변경하지 않는다. `published && !draft` 공개 조건, source-grounded evidence 요구, public/private boundary를 그대로 따른다. 따라서 새 ADR은 필요하지 않다.

## 3. 편집 불변 조건

각 글을 고칠 때 다음 요소를 원문과 대조해 보존한다.

- 부정과 조건.
- 가능성, 확신, 의무, 허용의 강도.
- 시간, 인과관계, 수량, 단위, 버전.
- 고유명사, URL, 인용문, 인용 출처.
- 검증된 사실, 저자의 해석, 개인 판단, 확인되지 않은 불확실성의 구분.
- 1인칭, 의도적인 단문과 반복, 간접성, 글의 리듬.

검증된 정정이 없는 이름·날짜·수량·버전·인용·URL은 바꾸지 않는다. 이미 자연스럽고 정확한 문장은 동의어 치환만을 위해 수정하지 않는다. 코드 span, code block, 명령, 구조화 데이터는 오류가 확인되거나 사용자가 명시적으로 범위에 넣은 경우에만 바꾼다.

## 4. 실행 묶음과 파일 allowlist

### 묶음 A: 공개 후보 `review` 아티클 5편

가장 먼저 최신 근거와 공개 적합성을 검증한다.

- `src/content/articles/agents-md-vs-agent-skills-evidence.mdx`
- `src/content/articles/aws-static-frontend-serverless-bff.mdx`
- `src/content/articles/karpathy-delete-everything-keep-graph.mdx`
- `src/content/articles/shared-ai-conversation-evidence-boundaries.mdx`
- `src/content/articles/uncle-bob-ai-code-review-evidence.mdx`

### 묶음 B: 공개된 출처 기반 아티클 5편

기존 evidence packet과 최신 1차 자료를 대조한다.

- `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`
- `src/content/articles/hermes-agent-persistent-worker-runtime.mdx`
- `src/content/articles/lazycodex-agent-harness-analysis.mdx`
- `src/content/articles/oh-my-pi-deep-review.mdx`
- `src/content/articles/ponytail-agent-minimalism-analysis.mdx`

### 묶음 C: 기술·워크플로 아티클 7편

문제, 핵심 개념, 판단 기준, 실제 활용의 독서 순서를 우선한다.

- `src/content/articles/ai-design-references.mdx`
- `src/content/articles/andrej-karpathy-skills-analysis.mdx`
- `src/content/articles/codex-ui-mockup-workflow.mdx`
- `src/content/articles/context-refinement-system-design.mdx`
- `src/content/articles/open-design-repo-analysis.mdx`
- `src/content/articles/pgvector-hybrid-search.mdx`
- `src/content/articles/postgresql-bm25-pg-search.mdx`

### 묶음 D: 개인 에세이 1편

새 경험이나 감정을 추가하지 않고 1인칭 목소리와 여운을 보존한다.

- `src/content/articles/why-i-read-in-the-ai-era.mdx`

각 묶음은 앞 묶음의 검증을 통과한 뒤 진행한다. 한 글의 근거 보류가 다른 글의 조사를 막지는 않는다.

## 5. 글별 편집 흐름

### 5.1 근거 확인

1. 아티클과 가장 가까운 evidence packet을 읽는다.
2. 공식 문서, 원본 저장소, 릴리스, 이슈, 핵심 소스 코드 등 1차 자료를 우선한다.
3. 주장별로 사실, 해석, 개인 판단, 불확실성을 작업 중에만 구분한다.
4. 시간에 민감한 버전, 기능, API, 상태와 링크를 현재 기준으로 다시 확인한다.
5. 직접 인용은 짧게 유지하고 원문 URL을 보존한다.

원문의 의미를 별도 fixture, 로그, 의미 원장으로 저장하지 않는다. evidence packet은 외부 근거와 검증 경계를 기록할 때만 갱신한다.

### 5.2 구조 개선

제목과 description은 본문의 실제 논지를 더 정확히 안내할 때만 바꾼다. 도입부는 독자가 글의 질문과 결론을 빠르게 파악하도록 다듬는다. 문단과 소제목은 문제에서 판단으로 이어지는 순서를 우선하되, 개인 에세이의 문학적 흐름을 기술 보고서 구조로 바꾸지 않는다.

표, 비교, 실제 사용 순서, 체크리스트는 기존 근거가 이미 뒷받침하고 독자의 판단을 실질적으로 돕는 경우에만 사용한다. 모든 글에 같은 요약표나 같은 결론 형식을 강제하지 않는다.

### 5.3 한국어 편집

1. 맞춤법, 띄어쓰기, 문법을 국어 규범에 따라 국소적으로 고친다.
2. 어색한 절, 불필요한 중복, 반복적인 보고서형 전환을 다듬는다.
3. 의도적인 반복, 단문, 1인칭, 간접성, 강도를 복원한다.
4. 원문과 비교해 의미, 확신, 인과, 의무, 수량이 달라진 수정은 되돌린다.
5. 원문이 이미 적절한 부분은 그대로 둔다.

### 5.4 메타데이터와 공개 상태

- 모든 글의 기존 `createdAt`을 보존한다.
- 실제 개선이 완료된 글의 `updatedAt`은 `2026-08-26`으로 기록한다.
- 묶음 A의 5편은 근거·콘텐츠·route 검증을 모두 통과한 경우 `status: "published"`, `draft: false`로 전환한다.
- 핵심 근거가 해결되지 않은 묶음 A 글은 `review` 상태를 유지한다.
- 기존 공개 아티클은 근거 문제만으로 임의 비공개 전환하지 않는다.

## 6. 보류와 오류 처리

| 조건 | 처리 |
| --- | --- |
| 공식 자료가 바뀜 | 최신 내용을 반영하고 확인 기준일 또는 버전을 명확히 한다. |
| 기존 주장과 최신 자료가 충돌함 | 확인된 범위까지 주장을 축소하거나 조건을 붙인다. |
| 출처 접근 불가 | 추정하지 않고 기존 immutable evidence가 있는지 확인한다. |
| 핵심 근거를 검증할 수 없음 | `review` 글은 공개하지 않고 보류한다. |
| 공개 글의 핵심 문제를 안전하게 고칠 수 없음 | 원문과 공개 상태를 임의 변경하지 않고 미해결 항목으로 보고한다. |
| 핵심 논지가 사실상 뒤집힘 | 일반적인 문장 개선에서 제외하고 별도 판단 대상으로 남긴다. |
| 규범이 여러 표현을 허용함 | 기존 표현을 오류로 단정하지 않고 보존한다. |
| 표·코드·구조화 데이터가 안전하게 편집되지 않음 | 해당 구조는 보존하고 주변 산문만 다듬는다. |

한 글의 보류는 다른 글의 진행을 막지 않는다. 최종 보고는 완료, 부분 완료, 보류를 구분하며 검증하지 못한 내용을 완료로 표시하지 않는다.

## 7. 수정 표면

허용되는 수정 표면은 다음과 같다.

- 이 문서의 18개 아티클 allowlist.
- 매칭되는 `docs/notes/article-factory/*.md` evidence packet.
- evidence packet을 크게 수정해 metadata가 달라질 때의 `docs/_index/catalog.yml`과 `docs/INDEX.md`.
- 구현 계획과 검증 증거를 위한 추적 가능한 project 문서.

다음 표면은 수정하지 않는다.

- `src/content/reviews/**`.
- 예시·테스트 콘텐츠 4개.
- route, layout, component, style, schema, dependency.
- top-level `memory/**`와 `src/data/memory.public.json`.

## 8. 검증 계약

### 글별 확인

- 원문 대비 의미, 부정, 확신, 인과, 수량, 인용 보존.
- 제목과 description이 본문의 실제 논지와 일치.
- 출처 링크와 짧은 인용이 유효하고 출처를 정확히 가리킴.
- 소제목, 표, 목록이 반복되거나 독서 흐름을 끊지 않음.
- source-grounded 글의 evidence packet과 본문이 일치.

### 묶음별 확인

- 변경 파일이 해당 묶음 allowlist에 한정됨.
- 현재 서버를 종료하거나 재설정하지 않고 별도 port에서 preview.
- 변경된 route의 title, description, heading rhythm, links, table overflow, console error 확인.
- desktop과 mobile 너비에서 해당 묶음의 모든 route 확인.
- 묶음 A는 article listing과 detail route에 새 공개 글이 나타나는지 확인.

### 전체 완료 gate

```bash
npm run validate
git diff --check
```

추가로 다음을 확인한다.

- 18개 변경 route의 desktop/mobile browser pass.
- `src/content/reviews/**`와 예시·테스트 콘텐츠에 diff가 없음.
- 기존 `createdAt` 보존과 실제 변경 글의 `updatedAt: "2026-08-26"`.
- 묶음 A의 공개 여부와 보류 근거가 최종 보고와 일치.
- 최종 diff에 범위 밖 변경, 긴 직접 인용, 근거 없는 주장 추가가 없음.
- 관련 accepted ADR과 publishing policy에 모순이 없음.

## 9. 완료 정의

작업은 18편을 기계적으로 모두 수정했을 때가 아니라 다음 상태에서 완료된다.

- 근거가 충분한 글은 최신 사실과 자연스러운 장르별 문체로 개선됐다.
- 이미 적절한 문장은 불필요하게 바뀌지 않았다.
- 공개 후보 5편은 검증 결과에 따라 공개 또는 보류가 정직하게 결정됐다.
- 모든 검증 명령과 route 확인 결과가 기록됐다.
- 해결하지 못한 근거 문제와 검증하지 못한 항목이 명시됐다.

이 문서 승인 뒤 별도 구현 계획에서 글별 조사 순서, evidence packet read set, 편집 단계, 검증 명령과 review checkpoint를 실행 가능한 작업으로 나눈다.
