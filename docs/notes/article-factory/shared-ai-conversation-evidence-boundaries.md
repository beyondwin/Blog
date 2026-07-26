# Shared AI Conversation Evidence Boundaries Research Packet

Date: 2026-07-26
Status: verified-with-access-gap
Target article: `src/content/articles/shared-ai-conversation-evidence-boundaries.mdx`

## Intake

- Supplied report: `/Users/kws/Downloads/threads_claude_evidence_report.html`
- Intake SHA-256: `a308af249feb37456b267b2ea34f3cd3387487b73877f725acd396106dc7f8c8` (28,256 bytes)
- Question: What can be claimed when a social post and its linked AI conversation are unavailable?
- Editorial boundary: Do not reconstruct or attribute inaccessible speech.

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| Supplied HTML report | Intake artifact | Records HTTP 429 for Threads and failure to extract a Claude share link |
| [Claude share/unshare help](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) | Official product documentation | Snapshot timing, attachment omission, hidden raw MCP data, organization limits |
| [Vercel AGENTS.md evaluation](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) | Primary experiment report | Example of rebuilding a technical claim from its source |
| [Agent Skills specification](https://agentskills.io/specification) | Official specification | Independent source for trigger/progressive-disclosure behavior |
| [Configuration Smells paper](https://arxiv.org/html/2606.15828v2) | Research preprint | Independent evidence for the adjacent technical topic |

## Local Source Inspection

- The supplied HTML explicitly records a 429 response for the Threads fetch.
- A text search found no `threads.net` source URL and no `claude.ai/share` URL in the artifact.
- Therefore the original post, author wording, linked conversation, attachments, and tool traces were not independently inspected.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| The supplied report does not establish the original social claim. | Report's own failure notes plus missing URLs | High |
| A Claude share is a point-in-time snapshot and may change when re-shared. | Claude official help | High |
| Attached files are not included in a shared chat. | Claude official help | High |
| Raw MCP tool data can be hidden from shared-chat viewers. | Claude official help | High |
| A shared conversation should be treated as a discovery artifact until its primary sources are checked. | Derived evidence policy | Reasoned recommendation |

## Blind Spots and Counterevidence

- Multiple summaries may all depend on one inaccessible origin and are not independent evidence.
- The publisher can select successful conversations while omitting failed attempts.
- A mutable share link needs a capture date or immutable archive for later audit.
- Search snippets and URL patterns cannot substitute for the missing content.
- Organization-bound shares can be inaccessible to public readers even when the author saw them.

## Editorial Decisions

- The article is about evidence boundaries, not the unverified Threads post.
- “Not verified” is preserved as the result instead of filled with an estimate.
- The adjacent AGENTS/Skills topic is used only as a worked verification example.

## Quality Gate Notes

- No quote or position is attributed to the inaccessible author.
- Access failures and hidden inputs are explicit.
- Article must pass `npm run article:quality` and `npm run validate`.
