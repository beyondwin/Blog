# beyondwin이 이렇게 구성된 이유

`beyondwin`의 기본 판단은 단순하다. 글이 제품이다. UI는 글을 더 잘 읽고 다시 찾게 해야 하고, 검증 스크립트는 공개해도 되는 것만 공개하게 해야 한다.

## 해결하려는 문제

개인 지식 사이트는 보통 세 가지 지점에서 망가진다.

1. 모든 글이 하나의 blog stream에 들어가서 기술 글, 리뷰, 아이디어, 리서치 노트의 차이가 사라진다.
2. 디자인이 장식으로 흐르면서 긴 글을 읽는 데 방해가 된다.
3. private thinking과 public publishing이 섞여서 미완성 메모나 민감한 기록이 공개 surface로 새어 나간다.

이 프로젝트는 typed content lane, restrained visual system, private-to-public memory projection으로 이 문제를 나눈다.

## 왜 Astro와 MDX인가

공개 사이트의 대부분은 정적 읽기 surface다. Astro는 이 요구에 맞다.

- collection route를 build time에 생성한다.
- MDX는 글을 파일로 보관하면서 필요한 곳에 컴포넌트를 쓸 수 있다.
- 일반 browsing에는 backend가 필요 없다.
- deploy 전에 content validation, test, type check, build를 한 번에 돌릴 수 있다.

포기한 것도 있다. runtime에서 사용자별 데이터나 실시간 편집을 처리하는 제품에는 맞지 않는다. 그래서 `/memory`도 database를 직접 읽지 않고 generated JSON을 읽는다.

## 왜 하나의 `posts/`가 아닌가

`articles`, `analysis`, `reviews`, `ideas`, `travel`은 서로 다른 metadata를 가진다.

- analysis는 `sourceUrl`, `sourceTitle`, `comment`, `format`이 필요하다.
- review는 `itemType`, `itemTitle`, `rating`, `completedAt`이 필요하다.
- idea는 `maturity`가 필요하다.
- travel은 `location`, `visitedAt`이 필요하다.

하나의 `posts/`와 tag만으로 처리하면 이 차이가 validation 밖으로 밀려난다. typed collection을 쓰면 잘못된 글이 route에 올라가기 전에 멈춘다.

trade-off는 새 lane 추가 비용이다. lane을 하나 더 만들려면 schema, route, layout, validation, navigation, docs를 같이 바꿔야 한다. 이 비용은 의도적이다. 새 lane은 단순 폴더가 아니라 독자가 구분할 수 있는 제품 surface여야 한다.

## 왜 source-grounded article은 더 엄격한가

`source-grounded` article은 외부 자료나 repository inspection을 바탕으로 쓴다. 이런 글은 “그럴듯한 요약”으로 남으면 위험하다. 독자는 실제 구조, 근거, 도입 판단을 기대한다.

그래서 article quality gate는 다음을 요구한다.

- 첫 heading 전 thesis paragraph.
- 정해진 Korean section heading.
- placeholder marker 제거.
- duplicate heading 제거.
- `## 확인한 자료`의 source URL.

이 구조는 문체 자유도를 줄인다. 대신 근거가 필요한 글을 읽는 사람에게 더 나은 계약을 준다.

## 왜 memory는 private-first인가

memory source는 private thought에서 시작할 수 있다. public page가 그 파일을 직접 읽으면 실수 한 번으로 private note가 공개될 수 있다.

현재 구조는 이 경계를 분리한다.

```text
memory/thoughts/*.md
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/pages/memory.astro
```

public export gate는 아래를 요구한다.

- `confidentiality: public`
- `surfaces`에 `memory-public`
- `review.status: accepted`
- 최소 하나 이상의 source
- 안전한 local path 또는 HTTP(S) URL

trade-off는 ceremony다. thought를 공개하려면 review와 projection을 거쳐야 한다. 그래도 private leak을 막는 비용으로는 싸다.

## 왜 docs layer를 나누는가

`docs/`는 archive다. 원문, curated note, generated navigation을 섞지 않는다.

```text
docs/_inbox   -> unsorted intake
docs/raw      -> original wording and provenance
docs/notes    -> curated library
docs/wiki     -> generated navigation
graphify-out  -> generated graph navigation
```

중요한 답변은 generated layer가 아니라 `docs/raw/` 또는 `docs/notes/`에서 확인한다. generated wiki와 graph는 빠른 길찾기 도구다.

trade-off는 index 유지보수다. curated note를 추가하면 `catalog.yml`, `topics.yml`, `docs/INDEX.md`를 맞춰야 한다. 이 비용은 나중에 찾을 수 없는 문서를 계속 쌓는 비용보다 작다.

## 왜 디자인이 조용한가

`PRODUCT.md`와 `DESIGN.md`는 사이트를 paper command journal로 정의한다. 이 선택은 취향만의 문제가 아니다.

이 사이트는 긴 글과 목록이 많다. 그래서 아래 패턴을 피한다.

- purple-blue gradient.
- decorative blob.
- glass panel.
- heavy shadow.
- 반복되는 uppercase eyebrow.
- oversized SaaS hero.

대신 흰 배경, 검은 본문, graphite metadata, hairline, cyan-blue signal accent를 쓴다. 눈에 띄는 장식보다 읽기와 재방문이 우선이다.

trade-off는 조용하다는 점이다. 하지만 이 사이트의 목표는 첫 방문자의 감탄보다 여섯 달 뒤 작성자의 재사용이다.

## 운영 판단 기준

새로운 durable change를 넣기 전에 세 질문에 답한다.

1. 이 콘텐츠는 어느 lane에 속하는가?
2. 어떤 validation gate가 공개 안전성을 증명하는가?
3. 미래의 독자나 작성자는 어떤 route 또는 index에서 다시 찾는가?

답이 불명확하면 public route에 바로 넣지 않는다. 먼저 `docs/_inbox/`나 private memory에 두고, 충분히 모양이 생겼을 때 curated note 또는 content collection으로 승격한다.
