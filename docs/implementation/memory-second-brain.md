# Memory Second Brain Implementation Reference

Date: 2026-05-24
Updated: 2026-08-30
Status: implemented; this path is a stable memory source locator

이 파일 경로는 public memory thought가 인용하므로 유지한다. 현재 운영 문서는
[아키텍처 레퍼런스](../notes/project/architecture-reference.md)와
[콘텐츠 운영](../notes/project/publishing-workflows.md)이다. Astro route는 없다.

## Goal

private-first second brain을 유지하고, 사람이 승인한 thought만
`src/data/memory.public.json`으로 투영해 `/memory/`에 공개한다.

1. `memory/**`는 thoughts, edges, sources, review candidate의 원본이다.
2. `src/data/memory.public.json`은 공개 앱이 읽는 유일한 projection이다.

공개 앱은 top-level `memory/**`를 import하거나 파싱하지 않는다.

## Runtime shape

```text
docs/notes + docs/_index/catalog.yml  ->  scripts/memory/seed.mjs
src/content collections               ->  scripts/memory/seed.mjs
seed                                  ->  memory/review/seed-candidates.jsonl
human review                          ->  memory/thoughts/*.md
thoughts + edges + sources            ->  scripts/memory/project.mjs
project                               ->  src/data/memory.public.json
apps/site                             ->  `/memory/` from the verified release
```

## Current owners

| path | 역할 |
| --- | --- |
| `scripts/memory/schema.mjs` | schema, frontmatter, JSONL, path safety |
| `scripts/memory/seed.mjs` | review candidate 생성. 공개하지 않음 |
| `scripts/memory/project.mjs` | accepted thought만 projection JSON으로 기록 |
| `memory/thoughts/*.md` | durable thought source |
| `memory/edges.jsonl` | thought-to-thought 관계 |
| `memory/sources.jsonl` | source metadata |
| `src/data/memory.public.json` | 공개 앱이 읽는 projection |
| `apps/site` | `/memory/` route. private memory를 직접 읽지 않음 |

공개 조건은 `confidentiality: public`, `surfaces`에 `memory-public`,
`review.status: accepted`, 안전한 source다. 승격은 명시 권한이 있을 때만 한다.
