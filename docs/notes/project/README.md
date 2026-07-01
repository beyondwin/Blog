# beyondwin 프로젝트 문서

이 폴더는 `beyondwin` 코드베이스 자체를 설명한다. Astro 사이트, content collection, publishing workflow, public memory projection, validation gate, archive docs 규칙을 다룬다.

빠르게 작업하려면 아래 순서로 읽는다.

## 문서 지도

| 문서 | 역할 | 읽는 시점 |
| --- | --- | --- |
| [시작하기](getting-started.md) | Tutorial | 처음 checkout한 뒤 사이트를 실행하고 콘텐츠 한 건이 route로 이어지는 과정을 확인할 때 |
| [콘텐츠 운영](publishing-workflows.md) | How-to | 글, 리뷰, queue item, source-grounded article, memory, archive docs를 실제로 추가하거나 고칠 때 |
| [Agent Runbook](agent-runbook.md) | Agent task map | 에이전트가 작업 유형별 read order, 수정 표면, 위험 경계, 검증 명령을 빠르게 확인해야 할 때 |
| [아키텍처 레퍼런스](architecture-reference.md) | Reference | route, schema, script, test, data contract의 정확한 값이 필요할 때 |
| [설계 이유](design-and-content-rationale.md) | Explanation | 왜 typed collection, private-first memory, docs layer, restrained design을 택했는지 이해해야 할 때 |

`Agent Runbook`은 개념 설명을 반복하지 않고, 작업 전에 어떤 원문을 읽고 어디를 수정하며 어떤 명령으로 검증할지 라우팅한다.

## 코드에서 확인한 핵심 계약

- 공개 콘텐츠는 [src/content.config.ts](../../../src/content.config.ts)의 collection schema를 통과해야 한다.
- 공개 route는 [src/pages/](../../../src/pages/) 아래에서 생성한다.
- collection 공통 동작은 [src/lib/content.ts](../../../src/lib/content.ts)가 맡는다.
- `/memory`는 `memory/**`를 직접 읽지 않고 [src/data/memory.public.json](../../../src/data/memory.public.json)만 읽는다.
- `npm run validate`가 문서와 콘텐츠 변경의 기본 완료 기준이다.
- curated docs를 추가하거나 옮기면 [docs/_index/catalog.yml](../../_index/catalog.yml), [docs/_index/topics.yml](../../_index/topics.yml), [docs/INDEX.md](../../INDEX.md)를 같이 맞춘다.

## 근거 파일

이 문서는 다음 파일을 읽고 갱신한다.

- [README.md](../../../README.md)
- [PRODUCT.md](../../../PRODUCT.md)
- [DESIGN.md](../../../DESIGN.md)
- [SYNC.md](../../../SYNC.md)
- [src/content.config.ts](../../../src/content.config.ts)
- [src/lib/content.ts](../../../src/lib/content.ts)
- [src/lib/memoryData.ts](../../../src/lib/memoryData.ts)
- [scripts/validate-content.mjs](../../../scripts/validate-content.mjs)
- [scripts/article-quality.mjs](../../../scripts/article-quality.mjs)
- [scripts/create-article-packet.mjs](../../../scripts/create-article-packet.mjs)
- [scripts/queue.mjs](../../../scripts/queue.mjs)
- [scripts/memory/project.mjs](../../../scripts/memory/project.mjs)
- [scripts/memory/schema.mjs](../../../scripts/memory/schema.mjs)
- [docs/implementation/memory-second-brain.md](../../implementation/memory-second-brain.md)

## 유지보수 원칙

- project 문서는 일반 글감이나 외부 리서치 노트와 섞지 않는다.
- schema, route, command, validation gate가 바뀌면 reference와 how-to를 같은 변경에서 갱신한다.
- 운영자가 따라 할 수 없는 표현은 삭제한다. “관리한다”, “지원한다” 대신 어느 파일을 어떻게 바꾸고 어떤 명령으로 확인하는지 쓴다.
- 생성된 `docs/wiki/`와 `graphify-out/`은 navigation layer다. 중요한 판단은 `src/`, `scripts/`, `docs/notes/`, `docs/raw/`에서 다시 확인한다.
