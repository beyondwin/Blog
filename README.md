# beyondwin

개발 글, 책과 도구 리뷰, 아이디어, 여행 기록, 소스 기반 분석, 공개 메모리를 한곳에 보관하는 개인 지식 출판 시스템입니다.

Astro와 MDX로 만든 정적 사이트이며, 공개 글은 `src/content/` 아래의 typed collection으로 관리합니다. 새 글을 추가할 때는 대부분 라우트나 레이아웃을 만지지 않고 MDX 파일과 frontmatter만 추가합니다.

## 공개 표면

| Route | Source | Purpose |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | 최신 글, 주요 글, lane별 색인, 공개 메모리 카운트 |
| `/articles/` | `src/content/articles/` | 개발 글과 기술 에세이 |
| `/analysis/` | `src/content/analysis/` | 큐에서 만든 소스 기반 분석 |
| `/reviews/` | `src/content/reviews/` | 책, 도구, 강의, 글, 미디어 리뷰 |
| `/ideas/` | `src/content/ideas/` | 아직 글이 되기 전의 아이디어와 제안 |
| `/travel/` | `src/content/travel/` | 여행과 장소 기록 |
| `/tags/` | content helpers | 공개 콘텐츠 전체의 태그 색인 |
| `/memory/` | `src/data/memory.public.json` | 검토를 통과한 공개 메모리 projection |

컬렉션 스키마는 [src/content.config.ts](src/content.config.ts)에 있고, 날짜/링크/정렬/태그 처리는 [src/lib/content.ts](src/lib/content.ts)가 맡습니다.

## 로컬 작업

```bash
npm install
npm run validate
npm run dev
```

`npm run validate`가 기본 완료 기준입니다. 이 명령은 content frontmatter, 긴 blockquote, source-grounded article 품질, public memory projection, Vitest, Astro type check, static build를 한 번에 확인합니다.

## 문서

프로젝트 문서는 [docs/notes/project/README.md](docs/notes/project/README.md)에서 시작합니다.

- [시작하기](docs/notes/project/getting-started.md): 로컬 실행, 검증, 첫 콘텐츠 추적.
- [콘텐츠 운영](docs/notes/project/publishing-workflows.md): 일반 글, 리뷰, queue sync, source-grounded article, memory, archive docs 작업.
- [아키텍처 레퍼런스](docs/notes/project/architecture-reference.md): 라우트, 스키마, 스크립트, 테스트, 데이터 계약.
- [설계 이유](docs/notes/project/design-and-content-rationale.md): typed collection, private-first memory, docs layer, 디자인 원칙의 선택과 trade-off.

루트 문서도 같이 봅니다.

- [PRODUCT.md](PRODUCT.md): 제품 목적, 사용자, 원칙.
- [DESIGN.md](DESIGN.md): 시각 시스템과 UI 금지 패턴.
- [SYNC.md](SYNC.md): `queue.md` 처리 계약.

## Archive Docs

`docs/`는 프로젝트 내부 지식 라이브러리입니다.

- `docs/_inbox/`: 아직 분류하지 않은 local intake.
- `docs/raw/`: 원문 wording이나 provenance가 필요한 source capture.
- `docs/notes/<topic>/`: 사람이 다듬은 curated note. 장기 보관의 source of truth입니다.
- `docs/wiki/`: 생성된 navigation layer.
- `graphify-out/`: 생성된 knowledge graph.

문서를 추가하거나 옮기면 [docs/_index/catalog.yml](docs/_index/catalog.yml), [docs/_index/topics.yml](docs/_index/topics.yml), [docs/INDEX.md](docs/INDEX.md)를 같이 갱신합니다.

## Graphify

이 저장소는 `graphify-out/`에 knowledge graph를 둡니다. 아키텍처나 코드 구조 질문에 답하기 전에는 [graphify-out/GRAPH_REPORT.md](graphify-out/GRAPH_REPORT.md)를 먼저 확인합니다.

코드 파일을 수정했다면 graph를 갱신합니다.

```bash
graphify update .
```
