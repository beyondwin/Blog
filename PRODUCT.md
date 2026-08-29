# Product

## 한 문장

`FORM & THOUGHT`는 한 사람이 공개할 가치가 있다고 판단한 서평, 아티클과 생각을 따뜻한
편집 지면에서 읽게 하는 private-first knowledge publication이다.

## 사용자와 목적

- 방문자는 가입이나 설정 없이 실제 글을 찾고 조용히 읽는다.
- 운영자는 private archive와 memory를 유지하고 명시적으로 승인한 projection만 공개한다.
- 제품은 자동 지식 그래프, 커뮤니티, 소셜 피드나 AI showcase가 아니다.

## 현재 공개 제품

워드마크는 두 줄 `FORM & THOUGHT`, primary navigation은 정확히
`서평 · 아티클 · 생각 · 검색`이다. Home은 실제 아티클 한 편의 hero와 서평·아티클·생각
각 한 편을 고른 세 editorial pick을 보여 준다.
primary corpus는 아티클 17, 서평 18, 생각 1이며 example은 공개하지 않는다.

analysis, ideas, travel, tags와 public memory는 같은 shell의 secondary route로 남지만 primary
navigation이나 검색 결과에 섞지 않는다. 좋아요와 댓글은 비활성 준비 상태이고 가짜 수치나
성공을 표시하지 않는다. canonical link copy만 실제 동작한다.

## 제품 경계

- 공개 앱은 verified immutable release만 소비한다.
- public memory는 `src/data/memory.public.json`만 읽고 private source를 직접 읽지 않는다.
- generated image는 checksum-bound visual/rights approval을 통과한 asset만 공개한다.
- 서평 cover는 edition identity와 redistribution rights가 모두 승인돼야 공개 byte가 된다.
- 검색은 primary corpus만 다룬다. 정적 export의 no-JS GET은 canonical URL과 기본 discovery를
  보존하지만 query-specific filtering은 hydration이 필요하다.
- production domain과 production cutover는 승인되지 않았다. 로컬 build는 deploy가 아니다.

## 경험 원칙

- 실제 콘텐츠와 출처를 장식보다 먼저 둔다.
- off-white, black, terracotta, deep brown, serif hierarchy, 얇은 선과 큰 여백을 유지한다.
- no crop review cover, text-led fallback, 빈 다섯 thought cell처럼 부재와 불확실성을 숨기지 않는다.
- canonical anchor와 GET form을 기본으로 하고 JavaScript는 menu, copy, search, bounded return만
  보강한다.
- keyboard focus, reduced motion, 320px reflow, no-JS, image failure와 static 404를 acceptance에
  포함한다.

## 하지 않는 것

- 승인되지 않은 콘텐츠, image, public memory나 production traffic을 자동 공개하지 않는다.
- scene, zoom, glass, gradient, badge, decorative motion 같은 과거·임의 UI를 복원하지 않는다.
- 내부 subtype이나 implementation noun을 visitor navigation으로 노출하지 않는다.
- source-specific 근거가 없는데 사실을 발명하지 않는다.

장기 Node API/studio/worker/PostgreSQL target은 ADR-0005에 남아 있다. 현재 공개 React static
site가 그 backend product까지 구현했다는 뜻은 아니다.
