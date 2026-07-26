# AGENTS.md vs Agent Skills Evidence Packet

Date: 2026-07-26
Status: verified
Target article: `src/content/articles/agents-md-vs-agent-skills-evidence.mdx`

## Intake

- Supplied report: `/Users/kws/Downloads/agents_md_skills_review.html`
- Intake SHA-256: `d26bf290b1b23bbc1909831353eae201f7b89c77afc80f5c4c683fd256776c19` (26,304 bytes)
- Question: Does the reported Vercel result justify preferring AGENTS.md over Skills in general?
- Editorial boundary: Treat the report as an intake artifact. Use primary sources for published claims.

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| [Vercel evaluation article](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) | Primary experiment report | Scope, four conditions, 53/53/79/100 results, Skill invocation rates, 8 KB index |
| [Next.js Agent Evals](https://nextjs.org/evals) | Public result table | Documentation-on/off comparison; not a direct AGENTS-vs-Skills reproduction |
| [AGENTS.md](https://agents.md/) | Official guidance | Repository guidance and nested-file behavior |
| [Agent Skills specification](https://agentskills.io/specification) | Official specification | Progressive disclosure and metadata-trigger model |
| [OpenAI Eval skills](https://developers.openai.com/blog/eval-skills) | Official evaluation guide | Trigger wording and explicit/implicit/contextual/negative-control tests |
| [Configuration Smells in AGENTS.md Files](https://arxiv.org/html/2606.15828v2) | Research preprint | Context-bloat and maintenance risks; methodology caveats retained |

## Local Source Inspection

- The supplied HTML was inspected for titles, claims, outbound links, and caveats.
- The Next.js public table dated 2026-07-17 was independently recalculated with a small local script:
  - 25 rows
  - before documentation: 73.56%
  - after documentation: 89.64%
  - change: +16.08 percentage points
  - 23 improved, 2 unchanged, 0 decreased
- This table does not independently reproduce Vercel's 100% AGENTS.md condition.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| Vercel reported 53%, 53%, 79%, and 100% across its four Next.js 16 conditions. | Vercel experiment report | High for that experiment only |
| The default Skill was not invoked in 56% of runs; explicit instruction raised invocation above 95%. | Vercel experiment report | High for that experiment only |
| Skills are designed to expose metadata first and load full instructions on demand. | Agent Skills specification | High |
| Skill trigger quality must be evaluated with positive and negative prompts. | OpenAI evaluation guide | High |
| Public Next.js results support a documentation benefit but not universal AGENTS.md superiority. | Recalculated Next.js table and comparison labels | High |
| Long persistent instruction files introduce context, conflict, leakage, and staleness risks. | 100-repository preprint | Medium; several smell detectors are heuristic/LLM-assisted |

## Blind Spots and Counterevidence

- One vendor's internal Next.js task set is not a cross-project, cross-agent benchmark.
- Success rate alone omits latency, token cost, false Skill invocation, and instruction conflicts.
- A large AGENTS.md can negate the benefit through permanent context cost.
- A poorly described Skill tests trigger design as much as procedural content quality.
- The preprint's smell counts are useful warning signals, not exact population estimates.

## Editorial Decisions

- Publish the result as evidence for a hybrid architecture, not a winner-takes-all claim.
- Recommend persistent instructions for high-cost-to-miss defaults and Skills for conditional, resource-heavy workflows.
- Keep the article at `status: review`; publication is outside this task.

## Quality Gate Notes

- Every percentage is scoped to its source.
- Internal and public evaluations are not conflated.
- Facts, interpretation, and recommendation are separated.
- Article must pass `npm run article:quality` and `npm run validate`.
