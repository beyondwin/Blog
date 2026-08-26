# Shared AI Conversation Evidence Boundaries Research Packet

Date: 2026-08-26
Status: verified-with-access-gap
Target article: `src/content/articles/shared-ai-conversation-evidence-boundaries.mdx`

## Intake

- Supplied report: `/Users/user/Downloads/threads_claude_evidence_report.html`
- Previously recorded SHA-256: `a308af249feb37456b267b2ea34f3cd3387487b73877f725acd396106dc7f8c8` (28,256 bytes)
- 2026-08-26 re-check: the intake file was not present. The original Threads post and Claude share URL remain unreachable. Contents were not reconstructed.
- Question: What can be claimed when a social post and its linked AI conversation are unavailable?
- Editorial boundary: Do not reconstruct or attribute inaccessible speech.

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| Supplied HTML report | Intake artifact | Prior inspection recorded HTTP 429 for Threads and failure to extract a Claude share link. File missing on 2026-08-26; not re-inspected. |
| [Claude share/unshare help](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) | Official product documentation | 2026-08-26 re-read. Snapshot of messages sent prior to sharing, including artifacts; later messages private by default; unshare then re-share updates the snapshot; attached files omitted; raw MCP tool data hidden; Team/Enterprise org-only sharing. |
| [Vercel AGENTS.md evaluation](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) | Primary experiment report | Independent verification procedure example only. Not a substitute for the missing Threads post. Published 2026-01-27; 53/53/79/100 still listed. |
| [Agent Skills specification](https://agentskills.io/specification) | Official specification | Independent verification procedure example. Progressive disclosure unchanged: metadata first, then `SKILL.md` body, then resources on demand. |
| [Configuration Smells paper](https://arxiv.org/html/2606.15828v2) | Research preprint | Independent verification procedure example. arXiv:2606.15828v2, 16 Jun 2026. Later v5 exists; this article does not use smell counts as a substitute for the missing post. |

## Local Source Inspection

- Prior inspection: the supplied HTML recorded a 429 response for the Threads fetch. A text search found no `threads.net` source URL and no `claude.ai/share` URL in the artifact.
- 2026-08-26: the intake HTML was not present. The original post, author wording, linked conversation, attachments, and tool traces were not independently inspected and were not reconstructed.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| The supplied report does not establish the original social claim. | Report's own failure notes plus missing URLs; intake file missing on 2026-08-26 | High |
| A Claude share is a snapshot of messages sent before sharing, including artifacts. Later messages stay private unless the chat is unshared and shared again. | Claude official help, 2026-08-26 re-read | High |
| Attached files are not included in a shared chat. Only the conversation and Claude's responses are visible. | Claude official help | High |
| Raw MCP tool data remains hidden from shared-chat viewers. Only the final chat output and conversation are visible. | Claude official help | High |
| Team and Enterprise users can share chats only with members of the same organization, not publicly. | Claude official help | High |
| A shared conversation should be treated as a discovery artifact until its primary sources are checked. | Derived evidence policy | Reasoned recommendation |

## Blind Spots and Counterevidence

- Multiple summaries may all depend on one inaccessible origin and are not independent evidence.
- The publisher can select successful conversations while omitting failed attempts.
- A mutable share link needs a capture date or immutable archive for later audit. Unshare-then-reshare updates the snapshot.
- Search snippets and URL patterns cannot substitute for the missing content.
- Organization-bound shares can be inaccessible to public readers even when the author saw them.
- Adjacent Vercel, Skills, and arXiv sources verify an independent procedure. They do not recover the missing Threads post or Claude share.

## Editorial Decisions

- The article is about evidence boundaries, not the unverified Threads post.
- “Not verified” is preserved as the result instead of filled with an estimate.
- The adjacent AGENTS/Skills topic is used only as a worked verification example.
- Local published after verification.

## Quality Gate Notes

- No quote or position is attributed to the inaccessible author.
- Access failures, hidden inputs, and the missing intake file are explicit.
- Local intake path is omitted from the public `## 확인한 자료` list because the file is not a publishable primary source and was missing at re-check.
- Adjacent technical URLs remain in the public source list as the independent verification example, not as substitutes for the missing post.
- Check date 2026-08-26.
- Article must pass `node scripts/validate-content.mjs` and `npm run article:quality` before the published route check.
