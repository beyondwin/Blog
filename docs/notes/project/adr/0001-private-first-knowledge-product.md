# ADR-0001: Private-first knowledge product와 curated public projection

- Status: accepted
- Date: 2026-08-22
- Decision owners: user / project
- Supersedes: none
- Superseded by: none

## Context

현재 repository는 Astro와 MDX 기반 개인 지식 출판 시스템이며 private memory를 검토한 뒤 `src/data/memory.public.json`으로 투영하는 안전 경계를 가진다. 새 제품 구상은 기존 블로그 플랫폼의 외형을 바꾸는 수준이 아니라 RAG, knowledge graph, second brain을 사용해 지식을 수집·연결·검토·재사용하는 시스템을 만드는 것이다.

초기 논의에서 private 연구 공간과 public 사이트의 우선순위를 정해야 했다.

## Decision

새 `beyondwin`의 primary product는 개인이 사용하는 private-first knowledge workspace다. Public surface는 private workspace의 복제본이나 자동 공개 feed가 아니라, 사람이 검토하고 승인한 결과만 별도로 투영하는 curated public experience다.

- private에는 source, note, 관계 후보, RAG 결과, 미완성 생각이 존재할 수 있다.
- AI와 retrieval 결과는 canonical knowledge나 public fact를 자동 확정하지 않는다.
- public에는 승인된 결과와 공개 가능한 provenance만 투영한다.
- private dependency의 존재나 내용은 public surface에서 추론 가능하게 노출하지 않는다.
- 현재 repository의 `memory/** -> src/data/memory.public.json` 경계는 새 architecture가 대체안을 승인하기 전까지 유지해야 할 safety precedent다.

## Decision evidence

- 사용자는 RAG, knowledge graph, second brain을 사용하는 완전히 새로운 제품을 요청했다.
- 사용자는 private-first personal research studio를 주 제품으로 하고, 검증된 결과를 public atlas에 투영하는 방향을 승인했다.
- 현재 repository는 private memory를 public route가 직접 읽지 않는 projection boundary를 이미 사용한다.

## Consequences

- public publishing은 ingestion이나 AI generation과 분리된 human review 단계가 필요하다.
- private와 public이 같은 underlying object를 사용하더라도 공개 필드와 renderer는 명시적 projection contract를 가져야 한다.
- frontend 편의 때문에 public code가 private memory나 raw source를 직접 읽을 수 없다.
- 제품은 개인용 workspace와 공개 experience라는 두 surface를 갖지만, 서로 다른 데이터 silo로 만들지 않는다.
- private runtime이 필요한 새 제품은 현재 static Astro 범위를 넘어설 수 있으며, 구체 architecture는 별도 ADR이 필요하다.

## Alternatives considered

### Public blog를 primary product로 유지

현재 구조를 확장하기 쉽지만 second brain과 RAG가 부가 기능으로 밀리고 사용자가 요청한 새로운 제품이 되지 않는다. 거부했다.

### Private workspace의 내용을 자동 공개

운영은 단순하지만 미완성 추론, 민감 정보, 안전하지 않은 source path가 공개될 수 있다. 거부했다.

### Private와 public을 별도 데이터 제품으로 구축

경계는 명확하지만 source와 claim이 복제되고 검토 이력이 분리된다. 하나의 canonical knowledge에서 explicit projection을 만드는 쪽을 선택했다.

## Open questions

- Node/TypeScript runtime의 구체 framework와 deployment topology.
- PostgreSQL/pgvector, graph projection, retrieval pipeline의 최종 구조.
- canonical object types와 review state machine.
- 승인된 public experience의 최종 information architecture와 visual world.

이 항목들은 현재 결정이 아니며 후속 ADR로 다룬다.

## Follow-up

- 제품 architecture 설계에서 private/public projection contract를 명시한다.
- AI suggestion과 human approval 상태를 별도 ADR에서 결정한다.
- public/private 양쪽의 승인된 UX가 정해지면 관련 ADR을 추가한다.
