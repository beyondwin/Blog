# ADR-0008: Full-bleed 압축 지면과 주제별 미디어 사용

- Status: accepted
- Date: 2026-08-29
- Decision owners: user / project
- Supersedes: ADR-0007의 outer paper shell/page elevation 및 architecture-dominant media 조항만 부분 대체
- Superseded by: none

## Context

ADR-0007은 FORM & THOUGHT의 브랜드, route, 편집 구성과 React-only 전환을 고정했고 현재 구현은 이를 통과했다. 그러나 실제 1440×900 home에서 32px outer inset, 96px header와 650px hero가 겹치며 세 editorial pick은 첫 화면에 거의 보이지 않는다. inner route도 큰 수직 여백 때문에 실제 콘텐츠 밀도가 낮다.

공개 아티클 17편 중 13편은 featured media가 있지만 대부분 콘크리트 건축 공간과 terracotta 오브제라는 같은 공식을 사용해 글 구분력이 낮다. 네 편은 featured media가 없다. 서평 18편은 공개 재배포가 승인된 cover asset이 없어 모두 text-led다.

사용자는 기존 route 구성은 유지하면서 외곽 여백이 없는 화면과 더 높은 콘텐츠 밀도, 내용에 맞는 article thumbnail, 실제 서평 표지를 요청했다. 시각 비교에서 full-bleed compact home과 topic-family media가 승인됐다. 사용자는 표지의 exact edition 및 redistribution rights gate도 승인했다.

## Decision

### Full-bleed와 density

- 모든 public route의 outer paper inset, radius와 elevation을 제거한다.
- 내부 editorial gutter, reading measure와 44px interaction target은 유지한다.
- home의 inverse header, split hero와 three-pick order는 유지한다.
- desktop home hero target은 500–540px다.
- index row와 detail hero의 vertical geometry를 약 15–20% 압축한다.
- 1440×900 home에는 hero 전체와 세 pick의 핵심 내용이 함께 보여야 한다.
- mobile의 22px inset, 16px body와 DOM order는 유지한다.

### Topic-family article media

- architectural minimalism은 모든 article에 반복하는 subject formula가 아니라 palette, light, negative-space guardrail로 사용한다.
- 17개 article을 전수 audit하고 per-article image brief를 만든다.
- missing, semantically weak 또는 repetitive asset은 교체하고 의미가 분명한 기존 asset은 유지한다.
- 사람·행동, 도구·작업대, 데이터·구조, 경계·증거, 디자인·재료, 읽기·사유 family를 콘텐츠에 따라 배정한다.
- 목록에서 연속 세 article이 같은 family가 되지 않도록 최종 contact sheet를 검수한다.
- generated media의 기존 provenance, contact sheet, approval와 rights gates는 유지한다.

### Exact review covers

- review cover는 exact ISBN, publisher와 edition이 일치해야 한다.
- public redistribution license 또는 written permission evidence가 있어야 public bytes가 된다.
- 검색 결과 이미지, 권리 불명 상품 이미지, 다른 판본과 hotlink는 사용하지 않는다.
- approved cover는 `contain`하며 crop, recolor 또는 regenerate하지 않는다.
- rights를 확인하지 못하면 text-led fallback을 유지한다.

## Decision evidence

- 2026-08-29 사용자가 현재 첫 화면의 외곽 여백과 낮은 콘텐츠 밀도 개선을 요청했다.
- 사용자가 Visual Companion의 `무여백 + 압축형` home을 승인했다.
- 사용자가 내용에 맞는 대표 이미지 보강과 비슷한 article thumbnail 교체를 요청했다.
- 사용자가 `주제별 이미지 가족` 방향을 승인했다.
- 사용자가 exact review cover를 찾고 redistribution rights가 확인된 표지만 적용하는 조건을 승인했다.
- Repository evidence: active release는 article 17개, featured media 13개, no-media article 4개, review 18개와 approved public cover asset 0개다.
- Browser evidence: 1440×900 current home에서 hero가 대부분의 first viewport를 점유하며 picks는 일부만 보인다.

## Consequences

- FORM & THOUGHT는 wide viewport에서 framed paper object보다 full-bleed editorial surface로 읽힌다.
- 기존 approved reference의 outer shell/elevation parity는 더 이상 acceptance gate가 아니다.
- route order, content lanes, typography, palette, React-only renderer와 public/private boundary는 바뀌지 않는다.
- image generation과 cover research 비용이 늘고 media approval evidence가 필요하다.
- 모든 review에 cover를 보장하지 않는다. rights evidence가 없는 책은 의도적으로 text-led다.
- 디자인 승인은 implementation, public media approval, production deploy 승인이 아니다.

## Alternatives considered

### Outer margin만 제거하고 기존 height 유지

좌우 활용은 좋아지지만 650px hero 때문에 first-view density가 거의 개선되지 않는다. 채택하지 않는다.

### 기존 framed shell과 architecture-only media 유지

reference parity는 유지하지만 사용자가 지적한 낮은 밀도와 thumbnail similarity를 해결하지 못한다. 채택하지 않는다.

### 모든 detail에 대형 생성 이미지 사용

시각적 강도는 높지만 review cover와 editorial image의 의미가 섞이고 제작·권리 비용이 커진다. article media와 exact review cover를 분리한다.

### 기술 UI와 diagram을 모든 thumbnail에 직접 사용

주제 인지는 빠르지만 빠르게 낡고 editorial publication보다 product documentation처럼 보일 수 있다. data/structure family에서 필요한 경우에만 사용한다.

## Open questions

- 각 review의 rights-cleared cover availability는 source research 이후에만 확정된다.
- article별 retain/replace와 최종 candidate는 image brief와 contact sheet review 이후 확정된다.
- production origin과 deployment authorization은 여전히 `not_measured` / `false`다.

## Follow-up

- [밀도와 미디어 리프레시 설계](../../../superpowers/specs/2026-08-29-form-and-thought-density-media-refresh-design.md)를 구현 계획의 source로 사용한다.
- [FORM & THOUGHT 시각 스펙](../form-and-thought-visual-spec.md)과 [이미지 아트 디렉션](../form-and-thought-image-art-direction.md)을 ADR-0008 override에 맞춘다.
- 사용자 spec review 이후 implementation plan을 작성한다.
