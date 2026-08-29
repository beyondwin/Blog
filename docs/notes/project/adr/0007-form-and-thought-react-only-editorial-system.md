# ADR-0007: FORM & THOUGHT React-only 공개 편집 시스템

- Status: accepted
- Date: 2026-08-28
- Decision owners: user / project
- Approval evidence: 2026-08-28 conversation approvals recorded in this ADR's Decision evidence
- Supersedes: ADR-0002, ADR-0003, ADR-0004, ADR-0006, and the Astro-retention clause of ADR-0005
- Superseded by: ADR-0008 (partial: outer paper shell/page elevation and architecture-dominant media clauses), ADR-0009 (partial: `/search/` keyword-first composition)

## Context

현재 공개 사이트는 React Router 공개 앱과 Astro rollback 구현이 함께 남아 있고, 공개 명사도 `장면 · 글 · 책 · 찾기`다. 기존 mineral/cobalt Storyworld와 reading surface는 각각 구현됐지만 사용자는 공개 사이트 전체를 하나의 따뜻한 편집 지면으로 다시 만들고, 첨부한 일곱 시안과 같은 디자인·구성을 적용하도록 승인했다.

콘텐츠 분류도 현재 화면과 다르다.

- `AI 시대에, 나는 왜 책을 읽는가`는 아티클이 아니라 `생각`이다.
- 책 콘텐츠의 공개 명사는 `책`이 아니라 `서평`이다.
- 예시 파일을 제외한 나머지 실제 글 17편은 모두 `아티클`이다.
- `조사 · 근거`, `에세이` 같은 내부 subtype은 공개 목록의 분류명이 아니다.

기존 결정은 Astro를 일정 기간 rollback baseline으로 유지하도록 했지만, 사용자는 2026-08-28 레거시 지원을 중단하고 새 디자인으로 직접 전환하며 Astro 코드를 제거하라고 명시했다.

## Decision

### 공개 브랜드와 정보 구조

- 공개 브랜드는 언제나 두 줄 워드마크 `FORM & THOUGHT`를 사용한다.
- 전역 내비게이션의 순서와 표기는 `서평 · 아티클 · 생각 · 검색`으로 고정한다.
- primary navigation route는 `/reviews/`, `/articles/`, `/thoughts/`, `/search/`다.
- `/`는 FORM & THOUGHT의 편집형 홈이다. `장면`이나 Storyworld 용어를 노출하지 않는다.
- `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/`와 현재 유효한 상세·map route는 secondary canonical route로 보존한다. 새 shell을 사용하지만 primary navigation과 primary search 결과에는 넣지 않는다.
- `why-i-read-in-the-ai-era`는 `thoughts` collection으로 이동하고 `/thoughts/why-i-read-in-the-ai-era/`가 canonical route가 된다.
- 기존 `/articles/why-i-read-in-the-ai-era/` 호환 redirect는 만들지 않는다. 레거시 URL 지원을 범위에 포함하지 않는다.

### 시각 권한

[FORM & THOUGHT 시각 스펙](../form-and-thought-visual-spec.md)과 그 문서가 가리키는 일곱 reference asset이 새 공개 UI의 시각 권한이다. 충돌 시 이 ADR에 기록된 직접 사용자 override, route별 primary reference, 수치 스펙 순서로 적용한다. 특히 생각 목록의 `한 건 + 빈 다섯 칸`은 모든 칸이 채워진 reference보다 우선한다.

- 따뜻한 off-white 지면, black, terracotta, deep brown을 사용한다.
- serif 중심의 편집 타이포그래피, 얇은 선, 큰 여백, 각진 지면과 건축적 명암 이미지를 사용한다.
- 기존 mineral/cobalt, Visual Storyworld, Staged Aperture, Continuity Zoom, scene rail, press-proof crop mark는 제거한다.
- 레퍼런스에 없는 glass, gradient, badge, pill, floating card, 과한 radius, 장식 motion을 임의로 추가하지 않는다.
- 각 route의 desktop composition은 대응하는 승인 reference의 영역 비율과 콘텐츠 순서를 따른다. 모바일은 시각 스펙의 route별 순서와 빈 공간 계약으로 번역한다.

### 공개 화면

- 홈: black/terracotta hero와 세 개의 editorial pick card.
- 아티클 목록: 큰 제목, 설명, filter row, 이미지·제목·설명·날짜의 수평 행.
- 서평 목록: 아티클 목록과 같은 지면 규칙을 사용하되 책 표지는 `contain`으로 보존한다.
- 생각 목록: 정확히 3열 × 2행의 구성 공간을 확보하고 실제 생각 한 건만 채운다. 나머지 다섯 칸에는 문구, placeholder, fake date, skeleton을 넣지 않는다.
- 검색: 큰 제목, 검색 입력, active primary corpus의 keyword chip, primary lane별 실제 discovery card 한 건. 검색 전에는 이 세 card와 keyword를 보여 주며 가상 콘텐츠를 만들지 않는다.
- 아티클·생각 상세: `reference-03-detail`의 off-white inner header, terracotta/dark split hero, hero 안 제목·요약·metadata, 아래 action/text/figure grid를 사용한다.
- 서평 상세: `reference-06-review-and-detail` 오른쪽 frame의 image-led hero, hero 아래 가운데 제목·책 정보·날짜, 아래 action/text/cover-or-figure grid를 사용한다. 검증된 실제 표지는 crop하지 않는다.

### 콘텐츠 편집

- 실제 아티클 17편은 모두 공개 명사 `아티클`로 취급한다.
- 실제 서평 18편은 모두 공개 명사 `서평`으로 취급한다.
- 한 건의 생각은 `thoughts` collection으로 분리한다.
- 모든 실제 아티클과 서평, 한 건의 생각을 새 지면의 읽기 흐름에 맞게 편집한다.
- 편집은 제목·도입·절 구조·문단 길이·목록·요약·출처 위치를 다듬되 사실, 저자의 판단, 인용 의미, 날짜를 바꾸거나 근거를 발명하지 않는다.
- 아티클 상세는 `편집형 가이드`, 서평 상세는 `판정 중심 서평`, 생각 상세는 짧고 여백이 큰 사유문으로 구성한다.
- 예시 콘텐츠는 공개 카드와 편집 대상에서 제외한다.

### 상호작용

- 상세 왼쪽 action rail에는 좋아요, 댓글, 링크 복사 아이콘을 배치한다.
- 좋아요와 댓글은 미래 기능을 위한 비활성 준비 상태다. 가짜 수치나 저장 성공을 표시하지 않는다.
- 링크 복사는 실제 canonical URL을 클립보드에 복사하고 성공·실패 상태를 접근 가능하게 알린다.
- focus, keyboard, reduced motion, 모바일 menu, 긴 제목과 빈 결과를 명시적으로 검증한다.
- wordmark, navigation, row/card, filter, keyword와 검색은 SSR canonical anchor 또는 GET form으로 제공한다. JavaScript는 navigation을 생성하지 않고 menu와 copy 동작을 보강한다.

### 이미지

- 레퍼런스의 건축적 면, 빛과 그림자, 책과 정물, terracotta/black/off-white palette를 이미지 art direction으로 사용한다.
- 새 대표 이미지가 필요한 경우 ignored local intake에서 먼저 일관된 후보군과 contact sheet를 만든다.
- 사용자가 승인한 이미지에만 public media id, provenance, rights-review 상태를 부여해 연결한다.
- 승인되지 않은 생성 이미지는 public release에 포함하지 않는다.
- durable docs에는 승인 decision manifest, 승인 contact sheet, 승인 원본만 남긴다. 거절 후보 원본은 사용자가 별도 보존을 요청하지 않는 한 커밋하지 않는다.
- 서평 표지는 판본 identity와 public redistribution rights가 모두 승인된 기존 표지만 사용하고 디자인을 맞추기 위해 임의로 재생성하지 않는다. 권리 warning/hold/unverified 표지 bytes는 public artifact에서 제외하고 text-led variant를 사용한다.

### React-only 전환과 Astro 제거

- `apps/site`의 React Router Framework Mode가 유일한 공개 renderer다.
- 새 디자인은 Astro에 이중 구현하지 않는다.
- 남아 있는 schema·content validation·route metadata·asset manifest 책임을 `packages/content`, `packages/contracts`, React route manifest로 옮긴다.
- React의 route/content/media/static-host/SEO/no-JS/browser/performance acceptance를 Astro가 남아 있는 상태에서 먼저 통과한다.
- 그 다음 React-only release/deploy 검증 계약으로 clean-host verifier, route inventory, tests와 운영 문서를 이전하고, dangling import가 없음을 확인한 뒤 Astro dependency, config, page, layout, component, style, test, parity/rollback script를 같은 전환에서 제거한다.
- root `validate`는 React public release, contracts, content validation, tests, typecheck, production build만 검사한다. `legacy:build`와 Astro 진단을 포함하지 않는다.
- 별도의 legacy branch, compatibility page, rollback renderer를 유지하지 않는다. 복구는 Git revision과 immutable public release artifact로 수행한다.
- 이 결정은 repository 안의 renderer 제거 권한이다. 배포, 원격 push, production traffic 변경 권한을 뜻하지 않는다.

## Decision evidence

- 2026-08-28 사용자가 일곱 화면 시안을 제공하고 `FORM & THOUGHT`, `서평 · 아티클 · 생각 · 검색`을 정확히 적용하도록 승인했다.
- 사용자가 “디자인이 똑같아야해 임의로 하면안돼”라고 명시해 reference set을 단일 시각 권한으로 확정했다.
- 사용자가 생각 grid의 나머지를 비우고 공간만 확보하도록 승인했다.
- 사용자가 디자인 스펙, 관련 정보, 시안을 별도 문서와 asset으로 저장하도록 요청했다.
- 사용자가 “레거시 지원안하고 새디자인으로 바로가자 astro 코드는 제거하고”라고 명시했다.
- 사용자가 설계·스펙·시안 정보를 별도 문서로 저장한 뒤 다각도 검토와 결함 개선을 승인했다.
- Repository evidence: `apps/site`와 framework-neutral `packages/content`, `packages/contracts`, immutable public release pipeline이 이미 존재하므로 Astro 제거 전 책임 이전 경로가 있다.

## Consequences

- 과거 Public Atlas와 mineral/cobalt public visual system은 역사적 기록으로만 남고 새 구현의 디자인 근거가 아니다.
- Astro rollback 기간을 별도로 운영하지 않으므로 전환 전 React 검증 수준이 높아져야 한다.
- ADR-0007에서 명시적으로 제거한 compatibility route를 포함한 legacy URL은 보장하지 않는다. 별도로 열거한 secondary canonical route는 유지한다.
- 콘텐츠·route·검색·이미지 manifest가 React/public-release 경계에서 완결돼야 Astro를 제거할 수 있다.
- 새 이미지 생성과 콘텐츠 편집은 각각 승인·근거 경계를 통과해야 하므로 디자인 구현과 별도 작업 묶음으로 관리한다.
- `DESIGN.md`와 architecture reference는 구현 완료 시 built truth로 교체한다. 이 ADR 승인만으로 구현 완료를 주장하지 않는다.

## Alternatives considered

### Astro를 rollback renderer로 유지

이전 ADR의 안전한 migration 방식이지만 사용자가 명시적으로 레거시 지원을 원하지 않았고 두 renderer의 문서·검증·UI drift 비용을 계속 만든다. 채택하지 않는다.

### 기존 mineral/cobalt 디자인 위에 명칭만 변경

구현 범위는 작지만 승인 시안의 지면, 타이포그래피, 화면 비율, 이미지 언어를 재현하지 못한다. 채택하지 않는다.

### 시안의 분위기만 참고해 자유롭게 재설계

브랜드 일관성을 만들 수 있지만 사용자가 같은 구성과 임의 해석 금지를 명시했다. 채택하지 않는다.

### 생각을 기존 articles나 ideas에 유지

새 공개 명사와 canonical route가 내부 모델과 불일치하고 이후 생각이 늘 때 다시 migration이 필요하다. `thoughts` collection을 만든다.

## Pending gated selections

제품 구조와 route별 composition에는 열린 결정이 없다. 다음 항목은 구현 전에 결과물을 보고 채택해야 하는 승인 gate다.

- 실제 배포할 self-hosted 한글 display/body/UI와 Latin wordmark font file, weight, license.
- 새 생성 이미지의 후보별 승인, rights review, crop/focal point.
- reference bitmap의 browser CSS viewport/DPR calibration artifact. 이 측정은 구성을 바꾸는 재설계 승인이 아니라 screenshot 비교를 재현하기 위한 기록이다.

## Follow-up

- [FORM & THOUGHT 공개 사이트 설계](../form-and-thought-public-site-design.md)를 구현 범위의 source of truth로 사용한다.
- [FORM & THOUGHT 시각 스펙](../form-and-thought-visual-spec.md)을 screenshot parity와 CSS token의 source로 사용한다.
- [FORM & THOUGHT 이미지 아트 디렉션](../form-and-thought-image-art-direction.md)을 생성 이미지 후보와 media 승인에 사용한다.
- 승인된 [FORM & THOUGHT 구현 계획](../form-and-thought-implementation-plan.md)을 task별 실행 source로 사용한다.
- 구현 완료 전까지 기존 `DESIGN.md`, architecture reference, public-site cutover evidence는 현재 또는 역사적 built truth이며, 이 ADR만으로 production cutover나 Astro 제거 완료를 주장하지 않는다.
