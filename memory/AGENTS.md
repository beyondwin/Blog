# Private memory guidance

These rules apply to top-level `memory/` sources and review artifacts.

## Privacy boundary

- New thoughts are private unless the user explicitly requests public promotion.
- Keep `memory/review/*.jsonl` and `memory/review/*.md` local and uncommitted.
- Public promotion requires `confidentiality: public`, the `memory-public` surface, `review.status: accepted`, and at least one safe source.
- Public application routes read `src/data/memory.public.json`; do not make `src/` import or parse top-level `memory/**`.

## Workflow

- Use `npm run memory:seed` and `npm run memory:review -- report` for private candidates.
- Promote only the explicitly authorized slug.
- Run `npm run memory:validate` after projection-related changes and `npm run validate` before completion.
- Deletion, confidentiality changes, and public-surface expansion require explicit authorization.
