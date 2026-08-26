# Karpathy가 말한 그래프는 Graph Engineering이 아니다 Research Packet

Date: 2026-08-26
Status: verified
Target article: src/content/articles/karpathy-delete-everything-keep-graph.mdx
Visual explainer: docs/notes/karpathy-graph/delete-everything-keep-graph.html

## Intake

- Input: https://www.youtube.com/watch?v=XdbpCM4yGyE
- Input type: url
- Requested extras: X original `https://x.com/callanxai/status/2089367361337897463`, X article `https://x.com/i/article/2087161603955326977`, PDF `https://drive.google.com/file/d/1JuefNEiXNeCc3IcQUdyFYXy0R9bAfHxn/view`
- Default angle: Separate Karpathy’s 2023 graph language from the 2026 Graph Engineering overlay, then give an evidence-based editorial judgment.

## Publication target

- Public article is locally published after the 2026-08-26 source re-check, focused validators, and route checks.
- HTML is a curated explainer, not a primary source. This pass did not edit it.
- PDF cover image is a local capture for research only; do not publish it as featured media without a rights review.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| [YouTube mirror `XdbpCM4yGyE`](https://www.youtube.com/watch?v=XdbpCM4yGyE) | video | The 1h 8m package people are watching under the 2026 title | 2026-08-26 oEmbed: title “Delete Everything, Keep Graph” - Andrej Karpathy Stanford Lecture, author philia. Transcript excerpts remain the 2026-08-18 capture; full transcript was not re-downloaded |
| [X post 2089367361337897463](https://x.com/callanxai/status/2089367361337897463) | social | The viral wrapper that attributes “keep the graph” to Karpathy | retrieved 2026-08-26; video duration 4,077,957 ms; 137,255 views / 1,646 bookmarks |
| [Direct mp4](https://video.twimg.com/amplify_video/2089363218745450496/vid/avc1/480x270/hMlkt8aObm9ecpCM.mp4) | video file | Same amplify asset as the X post | URL confirmed via X thread fetch; not fully re-encoded locally |
| [X article 2087161603955326977](https://x.com/i/article/2087161603955326977) | social article | “Full guide” quoted under the video | 2026-08-26 still login-walled / “unable to show this content”. Body not guessed |
| [hanakoxbt publication post](https://x.com/hanakoxbt/status/2087167924410658912) | social | Full 8-step Graph Engineering essay | retrieved 2026-08-26; no Karpathy citation; execution-map definition |
| [Google Drive PDF](https://drive.google.com/file/d/1JuefNEiXNeCc3IcQUdyFYXy0R9bAfHxn/view) | PDF | Frequently shared “Graph Engineering” note | 2026-08-26 Drive viewer loaded the filename `Graph-Engineering-Athropic-Karpathy-Loop.pdf` but not the page text. Keep the 2026-08-18 SHA-256 `c2143749bcec9c304071e9f8fd6c9b498aaec21459e658d1a58bd84ecb0fe26c` facts; no new PDF claims |
| [Stanford CS25 course page](https://web.stanford.edu/class/cs25/past/cs25-v2/) | official course | Canonical 2023 lecture date | retrieved 2026-08-26; Winter 2023; Jan 10 Introduction to Transformers, speaker Andrej Karpathy |
| [Stanford CS25 official upload](https://www.youtube.com/watch?v=XfpMkf4rD6E) | video | Canonical 2023 lecture matching the second half | 2026-08-26: title Stanford CS25: V2 I Introduction to Transformers w/ Andrej Karpathy; description January 10, 2023 |
| [Sequoia AI Ascent 2026](https://www.youtube.com/watch?v=96jN2OCOfLs) | official 2026 talk | Karpathy’s actual 2026 public lecture | 2026-08-26 oEmbed: “From Vibe Coding to Agentic Engineering w/ Stephanie Zhan”, Sequoia Capital. No Graph Engineering title |
| [Karpathy’s Sequoia summary](https://karpathy.bearblog.dev/sequoia-ascent-2026/) | author-reviewed writeup | Software 3.0, agentic engineering, LLM Wiki | retrieved 2026-08-26; dated 30 Apr 2026; no Graph Engineering |
| [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | author pattern | Official 2026 memory pattern | retrieved 2026-08-26; created 2026-04-04; ingest / query / lint; Obsidian graph view is visualization |
| [autoresearch](https://github.com/karpathy/autoresearch) | official repo | Official verification loop | retrieved 2026-08-26; agent edits `train.py`; human edits `program.md`; 5-minute budget; `val_bpb` |
| [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Anthropic engineering | Official workflow vs agent distinction | retrieved 2026-08-26; published Dec 19, 2024; page now points to Managed Agents for current tooling; architectural distinction unchanged |
| [Knowledge graph cookbook](https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide) | Anthropic cookbook | Official entity/relation graph notebook | retrieved 2026-08-26; entities, typed relations, multi-hop, entity resolution |
| [Dynamic Workflows](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code) | Anthropic product | Official 2026 orchestration | retrieved 2026-08-26; dated May 28, 2026; tens to hundreds of subagents; substantially more tokens; admins can disable |
| [Workflows docs](https://code.claude.com/docs/en/workflows) | Anthropic docs | Scripted orchestration vs turn-by-turn agents | retrieved 2026-08-26 |
| [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Anthropic engineering | Token-cost source for the 15× figure | retrieved 2026-08-26; published Jun 13, 2025; multi-agent ~15× chat tokens |
| Official Anthropic “Graph Engineering lecture” | video | Requested by user | not found |
| [Karpathy tweet, Jan 24 2023](https://x.com/karpathy/status/1617979122625712128) | social | Primary “hottest new programming language is English” line | retrieved 2026-08-26; not used as a 2026 curriculum claim |
| [AI Builder Club Graph Engineering guide](https://www.aibuilderclub.com/blog/graph-engineering-guide-2026) | secondary essay | 2026 orchestration-graph definition and skeptic record | prior capture; discourse, not implementation proof |
| [The AI Operator field guide](https://theaioperator.io/p/what-is-graph-engineering-a-field) | secondary essay | Documents three competing 2026 meanings and a fabricated study | prior capture; discourse, not implementation proof |
| [Panaversity crash course](https://agentfactory.panaversity.org/docs/graph-engineering-crash-course) | secondary course | Separates commit DAG, knowledge graph, governance graph; flags the PDF disclaimer | prior capture; discourse, not implementation proof |
| This repo’s Graphify article | internal adjacent | Code knowledge graph is a fourth meaning already published here | already in corpus; not edited in this task |

## Local source inspection

- Repository path: not applicable. This is lecture/social/PDF analysis, not a GitHub product review.
- Commit: n/a
- Files inspected:
  - YouTube transcript snapshot captured 2026-08-18 (86,285 characters). 2026-08-26 pass preserved those excerpts; did not invent new timestamps
  - X thread JSON for post `2089367361337897463` (2026-08-26 re-fetch)
  - Publication post `2087167924410658912` (2026-08-26 re-fetch)
  - PDF pages 1–11 plus `pdftotext` extract from 2026-08-18. 2026-08-26 Drive text was not re-extracted
  - PDF page-1 render (`graph-engineering-pdf-cover.png`) because page 1 is an image
- Execution policy: no external agent code was run. Video identity was checked via captured transcript, official CS25 page/upload, and 2026 Karpathy/Anthropic documents.

## Evidence Ledger

| Claim | Evidence | Strength | Article section |
| --- | --- | --- | --- |
| The 68-minute package is not a new 2026 Karpathy lecture | 2026-08-18 transcript: 0:00 returned to OpenAI “one week ago”; 2:09 newly a YouTuber; 21:14 works at OpenAI. Official CS25 page lists Jan 10, 2023. 2026-08-26 oEmbed author is philia. X reply 2026-08-18 calls the clip ~3 years old | High | intro, 실제 구조 |
| The YouTube/X video is a stitch, not one continuous talk | 2026-08-18 transcript: host thanks him at 22:19; Q&A about scratchpads; then a hard jump into “I want to talk about transformers” | High | 실제 구조 |
| Karpathy’s “delete everything” refers to attention, not agent graphs | 2026-08-18 transcript ~39:20: “delete everything like what's making this work very well is just the attention by itself. And so delete everything keep attention” | High | 먼저 알아야 할 개념, intro |
| In this lecture, “graph” means tokens/nodes + attention message passing + compute graph shape | 2026-08-18 transcript 44:15, 44:49, 45:05, 57:50, late RNN vs transformer compute-graph contrast | High | 먼저 알아야 할 개념 |
| Karpathy does not say “Prompting is fading away” in the captured transcript | 2026-08-18 full transcript search; 0 hits. 2026-08-26 X wrapper still attributes the line to Karpathy | High | 실제 구조, 조심해야 할 점 |
| Sequoia 2026 does not use Graph Engineering and still treats prompts/context as Software 3.0 levers | Author-reviewed post 2026-08-26 re-read; YouTube title is vibe coding → agentic engineering | High | 실제 구조 |
| @callanxai’s post rewrites the lecture as LLM → Prompts → Agents → Graphs | Post text fetched 2026-08-26; 137,255 views, 1,646 bookmarks | High | 실제 구조 |
| The X Article URL is login-walled; the 8-step body is in the publication post | 2026-08-26 article URL blocked; [post 2087167924410658912](https://x.com/hanakoxbt/status/2087167924410658912) | High | 실제 구조 |
| The 8-step guide never cites Karpathy | Full publication-post text 2026-08-26: no Karpathy, Stanford, attention, or “delete everything” | High | 실제 구조, 조심해야 할 점 |
| In that guide, graph = execution map | Nodes have one job, input, structured output, named failure; edges exist only if the next step reads the previous output | High | 핵심 기능 |
| The Drive PDF is an independent July 2026 study note, not an Anthropic/Karpathy paper | 2026-08-18 cover: “Independently compiled, July 2026 - not affiliated with Andrej Karpathy and Anthropic - and not endorsed”; title includes “Improved 1000x by Itself”. 2026-08-26 did not re-read page text | High for the captured cover/disclaimer | 실제 구조, 조심해야 할 점 |
| The PDF’s “graph” is commit DAG + knowledge graph + durable shared state | 2026-08-18 PDF sections II–IV and conclusion step 3. Not expanded on 2026-08-26 | High for the prior extract only | packet; article does not add new PDF internals |
| Mid-2026 “Graph Engineering” is not one concept | Official 2026 sources do not use the name. Wiki = pages, Cookbook = entities, Dynamic Workflows = execution scripts. Secondary essays document competing unofficial meanings | High | 먼저 알아야 할 개념, 조심해야 할 점 |
| The 15× token figure is from the 2025 research-system post, not the 2026 Dynamic Workflows notice | Multi-agent research system, Jun 13, 2025. Dynamic Workflows says “substantially more tokens” without a multiplier | High | 핵심 기능 |
| Building effective agents still distinguishes workflow vs agent | Dec 19, 2024 post, 2026-08-26 re-read. Tooling landscape now points to Managed Agents | High | 실제 구조 |
| Graphify’s graph is still a different object | Existing published article in this repo | High | relationship only |
| “1000x” is a slogan, not a measurement | 2026-08-18 PDF title; not re-measured on 2026-08-26 | High | 조심해야 할 점 |

## Junior explanation notes

- A graph is only useful after you can name the nodes, the arrows, and the question those arrows answer.
- Karpathy’s 2023 lecture uses “graph” the way a compiler person uses it: tokens talk to earlier tokens.
- 2026 posters use “graph” three other ways: who runs next, what facts persist, and how loops supervise one another.
- This blog already has a fourth graph (Graphify): symbols and files, not tokens, not agent roles.
- The transferable lesson is reduction, not a product: delete the part that is not load-bearing, keep the structure that is.

## Blind Spots and Counterevidence

- The 2026-08-26 pass did not re-download the 86,285-character transcript. Stitch timestamps and the attention quote stay scoped to the 2026-08-18 capture.
- The X Article body remains unseen. Claims use the publication post, not a guessed article-only version.
- Drive page text was not re-extracted. New PDF internals were not added.
- Building effective agents now points at Managed Agents for current tooling. That is a later product surface, not evidence that Graph Engineering is an official Anthropic lecture.
- View and bookmark counts on X move. The article does not treat them as durable facts.
- Secondary Graph Engineering essays are discourse. They support “not one concept” only as competing unofficial usage, not as Karpathy or Anthropic doctrine.

## Editorial Decisions

- Keep the 2023 CS25 lecture as an identity check, not as the 2026 agent-system spine.
- Restore the load-bearing attention quote and the missing “Prompting is fading away” attribution boundary in the public article.
- Date-stamp the 2026-08-26 re-read of Sequoia, LLM Wiki, autoresearch, Cookbook, Dynamic Workflows, and Building effective agents.
- Attribute the 15× token figure to the 2025 research-system post.
- Local published after verification.

## Quality Gate Notes

- Verified quotes stay under 25 words.
- X Article URL remains walled; claims use the publication post, not a guessed article-only version.
- “1000x”, “prompting is fading”, and Graph Engineering-as-Karpathy are labeled as wrapper or slogan.
- Captured transcript-backed claims are preserved; no new PDF claims were invented.
- Check date: 2026-08-26.
- Article must pass `node scripts/validate-content.mjs` and `npm run article:quality` before the published route check.
