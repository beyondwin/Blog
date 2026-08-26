# AGENTS.md vs Agent Skills Evidence Packet

Date: 2026-08-26
Status: verified
Target article: `src/content/articles/agents-md-vs-agent-skills-evidence.mdx`

## Intake

- Supplied report: `/Users/user/Downloads/agents_md_skills_review.html`
- Previously recorded SHA-256: `d26bf290b1b23bbc1909831353eae201f7b89c77afc80f5c4c683fd256776c19` (26,304 bytes)
- 2026-08-26 re-check: the intake file was not present. Contents were not reconstructed.
- Question: Does the reported Vercel result justify preferring AGENTS.md over Skills in general?
- Editorial boundary: Treat the report as an intake artifact. Use primary sources for published claims.

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| [Vercel evaluation article](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) | Primary experiment report | Published 2026-01-27. Scope, four conditions, 53/53/79/100 results, 56% non-invocation, 95%+ explicit invocation, ~8 KB compressed index, complementary Skills vs AGENTS.md framing. Unchanged as of 2026-08-26. |
| [Next.js Agent Evals](https://nextjs.org/evals) | Public result table | Last run 2026-08-13. 28 model/agent rows. Success Rate vs Success Rate with AGENTS.md (bundled Next.js docs). Not a direct AGENTS-vs-Skills reproduction and not a 100% replay of the vendor experiment. |
| [AGENTS.md](https://agents.md/) | Official guidance | Repository guidance, nested-file precedence (closest file to the edited path wins), standard Markdown. |
| [Agent Skills specification](https://agentskills.io/specification) | Official specification | Progressive disclosure and metadata-trigger model. |
| [OpenAI Eval skills](https://developers.openai.com/blog/eval-skills) | Official evaluation guide | Name/description as trigger signals; explicit/implicit/contextual/negative-control tests. |
| [Configuration Smells in AGENTS.md Files](https://arxiv.org/html/2606.15828v2) | Research preprint | arXiv:2606.15828v2, 16 Jun 2026. Context-bloat, lint leakage, skill leakage, fossilization, conflicts; methodology caveats retained. |

## Local Source Inspection

- The supplied HTML was not available on 2026-08-26. Prior inspection notes were not treated as a live primary source.
- The Next.js public table dated 2026-08-13 was independently recalculated from the published rows:
  - 28 rows
  - without documentation: 74.93%
  - with AGENTS.md documentation: 89.89%
  - change: +14.96 percentage points
  - 25 improved, 3 unchanged, 0 decreased
  - AGENTS.md-column range: 58%–96%; no row at 100%
- This table does not independently reproduce Vercel's 100% AGENTS.md condition, and it does not compare AGENTS.md with Skills.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| Vercel reported 53%, 53%, 79%, and 100% across its four Next.js 16 conditions. | Vercel experiment report, 2026-08-26 re-read | High for that experiment only |
| The default Skill was not invoked in 56% of eval cases; explicit instruction raised invocation above 95%. | Vercel experiment report | High for that experiment only |
| Vercel presents AGENTS.md as complementary to Skills, not as a universal replacement. | Vercel "What this means for framework authors" | High for that report's recommendation |
| Skills are designed to expose metadata first and load full instructions on demand. | Agent Skills specification | High |
| Skill trigger quality must be evaluated with positive and negative prompts. | OpenAI evaluation guide | High |
| Public Next.js results support a documentation benefit via AGENTS.md but not universal AGENTS.md superiority or a Skills comparison. | Recalculated 2026-08-13 table and column labels | High |
| Long persistent instruction files introduce context, conflict, leakage, skill leakage, and staleness risks. | 100-repository preprint | Medium; several smell detectors are heuristic/LLM-assisted |

## Blind Spots and Counterevidence

- One vendor's internal Next.js task set is not a cross-project, cross-agent benchmark.
- Success rate alone omits latency, token cost, false Skill invocation, and instruction conflicts. The public Next.js table now reports average duration and list cost, which still does not cover Skill invocation quality.
- A large AGENTS.md can negate the benefit through permanent context cost.
- A poorly described Skill tests trigger design as much as procedural content quality.
- The preprint's smell counts are useful warning signals, not exact population estimates. LLM-assisted detectors have false positives, especially for conflicting instructions.
- The public AGENTS.md column is bundled Next.js documentation access, not an AGENTS.md-versus-Skills bake-off.

## Editorial Decisions

- Publish the result as evidence for a hybrid architecture, not a winner-takes-all claim.
- Recommend persistent instructions for high-cost-to-miss defaults and Skills for conditional, resource-heavy workflows.
- Do not treat the public Next.js table as a reproduction of 53/53/79/100.
- Local published after verification.

## Quality Gate Notes

- Every percentage is scoped to its source and check date (2026-08-26).
- Internal and public evaluations are not conflated.
- Facts, interpretation, and recommendation are separated.
- Local intake path is omitted from the public article because the file is not a publishable primary source and was missing at re-check.
- Article must pass `node scripts/validate-content.mjs` and `npm run article:quality` before the published route check.
