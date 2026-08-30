# beyondwin이 이렇게 구성된 이유

글이 제품이다. UI는 글을 읽히게 하고, 검증은 공개해도 되는 것만 내보낸다.

## 한 스트림에 모든 글을 넣지 않는 이유

기술 글, 서평, 짧은 생각, 조사 메모는 metadata가 다르다. 하나의 `posts/`와 tag로
처리하면 그 차이가 validation 밖으로 밀려난다.

`articles`, `reviews`, `thoughts`, `analysis`, `ideas`, `travel`을 나눈 대가는
lane을 추가할 때마다 schema, route, 검증, 문서를 같이 바꾸는 것이다. 그 비용은
의도적이다. 새 lane은 폴더가 아니라 독자가 구분할 수 있는 제품 표면이어야 한다.

## 왜 React Router static site인가

공개 사이트의 대부분은 빌드 타임에 끝나는 읽기 화면이다.

- `apps/site`가 유일한 renderer다.
- `packages/content`가 MDX, media, immutable release를 소유한다.
- 일반 열람에 서버나 DB가 필요 없다.
- deploy 전에 `npm run validate`로 content, media, memory, test, release, static
  build를 한 번에 막는다.

포기한 것도 있다. 사용자별 데이터, 실시간 편집, RAG 답변은 이 공개 사이트가 아니다.
장기 Node API/studio 목표는 [ADR-0005](adr/0005-node-react-modular-monolith.md)에
남아 있지만, 현재 구현이 그 backend까지 있다는 뜻은 아니다.

Astro는 제거했다. 구 URL compatibility도 없다. 그 판단은
[ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md)과
[레거시 종료 기록](history/README.md)에 있다.

## 왜 source-grounded article은 더 엄격한가

외부 자료나 저장소 조사를 바탕으로 쓰는 글은 그럴듯한 요약으로 남으면 위험하다.
`source-grounded` tag가 있으면 thesis, 정해진 절, 확인한 자료 URL이 필요하다.
문체 자유도를 줄이는 대신, 근거가 필요한 글의 계약을 고정한다.

## 왜 memory는 private-first인가

```text
memory/thoughts/*.md
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> apps/site `/memory/`
```

공개 앱은 top-level `memory/**`를 읽지 않는다. thought를 공개하려면
`confidentiality: public`, `memory-public` surface, accepted review, 안전한 source가
모두 필요하다. ceremony가 늘지만 private leak 한 번보다 싸다.

## 왜 docs를 나누는가

```text
docs/_inbox   미분류 intake
docs/raw      원문과 provenance
docs/notes    사람이 다듬은 라이브러리
docs/wiki     generated navigation
```

프로젝트 운영 문서는 `docs/notes/project/`의 현재 허브다. 끝난 전환 기록은
`docs/notes/project/history/`다. 중요한 답은 generated wiki가 아니라 curated note와
ADR에서 확인한다.

## 왜 지면이 조용한가

방문자는 가입 없이 서평, 아티클, 생각을 읽으러 온다. 그래서 off-white, black,
terracotta, serif, 얇은 선, 큰 여백을 쓴다. glass, gradient, badge, 장식 motion,
crop한 서평 표지는 넣지 않는다.

trade-off는 첫인상보다 다시 읽기다. 자세한 계약은 [DESIGN.md](../../../DESIGN.md)다.

## 새 작업을 넣기 전에

1. 이 콘텐츠는 어느 lane인가.
2. 어떤 검증이 공개 안전성을 증명하는가.
3. 독자는 어떤 route에서 다시 찾는가.

답이 없으면 public route에 바로 넣지 않는다.
