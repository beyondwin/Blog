# Product

## Register

brand

## 사용자

이 사이트의 독자는 검색, GitHub, 공유 링크, 반복 방문을 통해 들어온다. 개발자는 에이전트 워크플로우와 도구 분석을 보러 오고, 지인은 책과 아이디어 기록을 보러 오며, 미래의 작성자는 예전 판단을 다시 꺼내 쓰려고 돌아온다.

따라서 첫 화면은 “무엇을 파는가”가 아니라 “무슨 기록을 어디서 읽으면 되는가”를 보여줘야 한다.

## 목적

`beyondwin`은 개인 지식 출판 시스템이다. 흩어진 개발 메모, 읽은 책, 도구 분석, 아이디어, 여행 기록, 공개 가능한 memory thought를 typed collection과 검증 스크립트로 관리한다.

성공 기준은 명확하다.

- 방문자가 첫 화면에서 글의 lane을 구분할 수 있다.
- 긴 한국어와 영어 글을 데스크톱과 모바일에서 편하게 읽을 수 있다.
- 새 콘텐츠는 MDX와 frontmatter 추가만으로 공개 경로에 들어간다.
- source-grounded article은 근거, 구조, 결론이 분리되어 있다.
- private memory가 공개 route로 새지 않는다.
- 디자인은 템플릿처럼 보이지 않되, 글보다 앞서지 않는다.

## 제품 성격

정확하고, 관찰 중심이며, 조용하다.

개발자가 오래 쓰는 field notebook에 가깝다. 읽기에는 차분하고, 오래된 기록을 찾기에는 충분히 구조화되어 있으며, 플랫폼 블로그를 복제한 느낌은 피한다.

## 피해야 할 것

- 큰 hero와 카드 그리드로 채운 SaaS landing page 문법.
- purple-blue gradient, glass panel, decorative blob.
- 모든 섹션에 반복되는 작은 uppercase eyebrow.
- 코드 폰트만 남긴 미완성 개발 블로그.
- 독자가 글을 읽기 전에 UI 장식부터 해석해야 하는 화면.
- public memory가 private note를 직접 읽는 구조.

## 설계 원칙

- 글이 제품이다. navigation, metadata, visual rhythm은 읽기를 돕는 역할에 머문다.
- lane은 분리하되 archive는 하나로 유지한다. `articles`, `analysis`, `reviews`, `ideas`, `travel`, `memory`는 다른 계약을 갖지만 같은 사이트 경험 안에 있어야 한다.
- 공개와 비공개 경계를 코드로 둔다. `/memory`는 `memory/**`를 직접 읽지 않고 `src/data/memory.public.json`만 읽는다.
- 검증을 작업 습관에 넣는다. content schema, article quality, memory projection, tests, build가 하나의 gate로 묶여야 한다.
- 미래의 작성자를 위해 쓴다. 새 글을 넣는 사람이 “어디에 넣고 무엇을 확인해야 하는지” 바로 알 수 있어야 한다.

## 접근성

본문과 control은 WCAG AA 대비를 목표로 한다. keyboard navigation, visible focus, reduced motion, 모바일 줄바꿈, 한국어와 영어 제목의 overflow 방지를 기본 요구사항으로 본다.
