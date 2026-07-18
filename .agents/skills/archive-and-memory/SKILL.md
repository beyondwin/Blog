---
name: archive-and-memory
description: Use when beyondwin work involves archive classification, curated docs, docs indexes, private memory review, explicit memory promotion, or repository knowledge questions; not for unrelated UI work.
---

# Archive and memory

## Read first

Read `docs/AGENTS.md`, `memory/AGENTS.md` when memory is involved, `docs/README.md`, `docs/_index/README.md`, and `docs/notes/project/publishing-workflows.md`.

## Workflow

1. Determine provenance, confidentiality, durability, and the future retrieval path.
2. Preserve original wording in `docs/raw/`; place curated knowledge in `docs/notes/<topic>/`; do not edit `docs/wiki/` as source material.
3. Update `docs/_index/catalog.yml`, `docs/_index/topics.yml` when needed, and `docs/INDEX.md` for durable note changes.
4. Keep new memory candidates private and review them locally.
5. Promote only an explicitly authorized slug, then project and validate public memory.
6. Run `npm run agent:check`, focused memory validation when applicable, and `npm run validate`.
7. Verify important answers against raw or curated sources, not generated navigation alone.

## Stop conditions

- Ask before deleting material, changing confidentiality, expanding public surfaces, or exposing a new source path.
- Do not auto-fix indexes or promote memory based only on inference.
- Do not commit or push without explicit authorization.
