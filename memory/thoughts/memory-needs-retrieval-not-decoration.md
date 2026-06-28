---
schema_version: 1
slug: memory-needs-retrieval-not-decoration
claim_ko: "Second brain 화면은 장식용 그래프보다 검색, 주제, 근거 연결처럼 다시 찾는 동작을 먼저 제공해야 한다."
claim_en: "A second-brain screen should prioritize retrieval actions like search, topics, and source links over decorative graphs."
memory_type: procedural
origin: kws
confidentiality: public
surfaces: [memory-public, article-ready]
topics: [memory-system, site-design, readability]
theses: [personal-archive, design-quality]
sources:
  - kind: implementation
    path: src/pages/memory.astro
    title: "Memory page workbench"
    date: 2026-06-25
review:
  status: accepted
  reviewed_at: 2026-06-25
---

This thought captures the current direction for the Memory tab.
Graph views can return later, but the default surface should help readers find claims, topics, sources, and relationships quickly.
