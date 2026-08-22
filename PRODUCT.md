# Product

## Register

brand

## 사용자

이 사이트의 독자는 검색, GitHub, 공유 링크, 반복 방문을 통해 들어온다. 개발자는 에이전트 워크플로우와 도구 분석을 보러 오고, 지인은 책과 남는 문장을 보러 오며, 미래의 작성자는 예전 판단을 다시 꺼내 쓰려고 돌아온다.

따라서 첫 화면은 “무엇을 파는가”를 설명하는 landing page가 아니라, 공개하기로 고른 글·책·문장·그림의 관계를 하나의 장면에서 보고 바로 읽게 해야 한다.

## 목적

`beyondwin`은 private-first 개인 지식 제품이다. 작성 과정과 private memory는 공개 애플리케이션 밖에 두고, 공개 승인된 글, 책, 문장, media만 typed collection과 검증된 public projection을 통해 내보낸다.

현재 공개 첫 화면은 Public Atlas의 첫 Visual Storyworld인 `판단` 장면이다. 하나의 authored scene이 실제 published content를 Staged Aperture로 배치하고, 방문자는 object를 focus한 뒤 기존 article/review route에서 읽거나 같은 scene 위치로 돌아온다. 이것은 비공개 작업 공간이나 자동 지식 시스템이 아니라, 지금 공개 가능한 지식을 고른 결과다.

성공 기준은 명확하다.

- 방문자가 첫 화면에서 글과 책을 서로 다른 객체로 구분할 수 있다.
- 방문자가 `판단` 장면에서 object 사이의 관계를 이해하고 focus, 읽기, 정확한 복귀를 수행할 수 있다.
- 긴 한국어와 영어 글을 데스크톱과 모바일에서 편하게 읽을 수 있다.
- 새 콘텐츠는 MDX/frontmatter뿐 아니라 해당 collection schema, `published && !draft` publication 조건, 적용 가능한 media provenance·권리와 privacy 계약, content quality gate를 통과한 뒤 공개 경로에 들어간다.
- source-grounded article은 근거, 구조, 결론이 분리되어 있다.
- private memory가 공개 route나 public scene resolver로 새지 않는다.
- 디자인은 템플릿처럼 보이지 않되, 글보다 앞서지 않는다.

## 제품 성격

정확하고, 관찰 중심이며, 조용하다. Public Atlas는 차갑고 밝은 mineral daylight 공간에서 실제 media와 텍스트 object가 관계를 만든다. UI chrome은 navigation과 명시적 행동만 남기며, 장면은 dashboard나 card catalog로 보이지 않는다.

기존 article, review, memory, search 읽기 route는 아직 교정 부스 계열의 흰 지면과 회색 chrome을 사용한다. 이 reading surface는 현재 동작하는 구현이지만 Public Atlas의 새 visual world로 재설계되었다고 주장하지 않는다.

## 피해야 할 것

- 큰 hero와 카드 그리드로 채운 SaaS landing page 문법.
- purple-blue gradient, glass panel, decorative blob.
- 모든 섹션에 반복되는 작은 uppercase eyebrow.
- 코드 폰트만 남긴 미완성 개발 블로그.
- 독자가 글을 읽기 전에 UI 장식부터 해석해야 하는 화면.
- public memory가 private note를 직접 읽는 구조.
- 문예 재킷 CMS. 크림 종이, 세리프 선언문, 책장 선반, Editor’s Note, 레인별 악센트로 만든 문예지 껍질.

## 설계 원칙

- 공개할 지식을 고르고 관계를 지어 보여주는 일이 제품이다. navigation, metadata, visual rhythm은 발견과 읽기를 돕는 역할에 머문다.
- 주요 navigation의 공개 명사는 `장면`, `글`, `책`, `찾기`다. `articles`, `analysis`, `reviews`, `ideas`, `travel`, `memory`는 서로 다른 내부 계약을 갖지만, 빈 lane과 내부 컬렉션 이름을 광고하지 않는다.
- `/`는 현재 하나의 author-approved `판단` scene만 제공한다. 여러 scene이나 자동 scene 생성을 이미 존재하는 기능처럼 말하지 않는다.
- 공개와 비공개 경계를 코드로 둔다. `/memory`는 `memory/**`를 직접 읽지 않고 `src/data/memory.public.json`만 읽는다.
- 검증을 작업 습관에 넣는다. content schema, article quality, memory projection, tests, build가 하나의 gate로 묶여야 한다.
- 미래의 작성자를 위해 쓴다. 새 글을 넣는 사람이 “어디에 넣고 무엇을 확인해야 하는지” 바로 알 수 있어야 한다.

## 접근성

본문과 control은 WCAG AA 대비를 목표로 한다. keyboard navigation, visible focus, reduced motion, 모바일 줄바꿈, 한국어와 영어 제목의 overflow 방지를 기본 요구사항으로 본다.
