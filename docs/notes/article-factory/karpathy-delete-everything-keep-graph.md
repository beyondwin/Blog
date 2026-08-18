# Karpathy가 말한 그래프는 Graph Engineering이 아니다 Research Packet

Date: 2026-08-18
Status: research-ready
Target article: src/content/articles/karpathy-delete-everything-keep-graph.mdx
Visual explainer: docs/notes/karpathy-graph/delete-everything-keep-graph.html

## Intake

- Input: https://www.youtube.com/watch?v=XdbpCM4yGyE
- Input type: url
- Requested extras: X original `https://x.com/callanxai/status/2089367361337897463`, X article `https://x.com/i/article/2087161603955326977`, PDF `https://drive.google.com/file/d/1JuefNEiXNeCc3IcQUdyFYXy0R9bAfHxn/view`
- Default angle: Separate Karpathy’s 2023 graph language from the 2026 Graph Engineering overlay, then give an evidence-based editorial judgment.

## Publication target

- Public article stays `status: review` until the owner explicitly authorizes publication.
- HTML is a curated explainer, not a primary source.
- PDF cover image is a local capture for research only; do not publish it as featured media without a rights review.

## Source inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| [YouTube mirror `XdbpCM4yGyE`](https://www.youtube.com/watch?v=XdbpCM4yGyE) | video | The 1h 8m package people are watching under the 2026 title | retrieved; transcript excerpts captured 2026-08-18 |
| [X post 2089367361337897463](https://x.com/callanxai/status/2089367361337897463) | social | The viral wrapper that attributes “keep the graph” to Karpathy | retrieved 2026-08-18; video duration 4,077,957 ms |
| [Direct mp4](https://video.twimg.com/amplify_video/2089363218745450496/vid/avc1/480x270/hMlkt8aObm9ecpCM.mp4) | video file | Same amplify asset as the X post | URL confirmed via X thread fetch; not fully re-encoded locally |
| [X article 2087161603955326977](https://x.com/i/article/2087161603955326977) | social article | “Full guide” quoted under the video | Article URL still login-walled |
| [hanakoxbt publication post](https://x.com/hanakoxbt/status/2087167924410658912) | social | Full 8-step Graph Engineering essay | retrieved 2026-08-18; matches the Glean mirror |
| [Google Drive PDF](https://drive.google.com/file/d/1JuefNEiXNeCc3IcQUdyFYXy0R9bAfHxn/view) | PDF | Frequently shared “Graph Engineering” note | downloaded; 11 pages; SHA-256 `c2143749bcec9c304071e9f8fd6c9b498aaec21459e658d1a58bd84ecb0fe26c` |
| [Stanford CS25 official upload](https://www.youtube.com/watch?v=XfpMkf4rD6E) | video | Canonical 2023 lecture matching the second half | metadata verified; lecture date Jan 10, 2023 |
| [TreeHacks 2023 coverage](https://stanforddaily.com/2023/02/22/treehacks-attendance-reaches-new-heights-on-back-of-ai-excitement/) | news | Confirms the Software 3.0 / “English is the hottest language” keynote | retrieved |
| [Karpathy tweet, Jan 24 2023](https://x.com/karpathy/status/1617979122625712128) | social | Primary “hottest new programming language is English” line | retrieved |
| [AI Builder Club Graph Engineering guide](https://www.aibuilderclub.com/blog/graph-engineering-guide-2026) | secondary essay | 2026 orchestration-graph definition and skeptic record | retrieved |
| [The AI Operator field guide](https://theaioperator.io/p/what-is-graph-engineering-a-field) | secondary essay | Documents three competing 2026 meanings and a fabricated study | retrieved |
| [Panaversity crash course](https://agentfactory.panaversity.org/docs/graph-engineering-crash-course) | secondary course | Separates commit DAG, knowledge graph, governance graph; flags the PDF disclaimer | retrieved |
| This repo’s Graphify article | internal adjacent | Code knowledge graph is a fourth meaning already published here | already in corpus |

## Local source inspection

- Repository path: not applicable. This is lecture/social/PDF analysis, not a GitHub product review.
- Commit: n/a
- Files inspected:
  - YouTube transcript snapshot (86,285 characters)
  - X thread JSON for post `2089367361337897463`
  - PDF pages 1–11 plus `pdftotext` extract
  - PDF page-1 render (`graph-engineering-pdf-cover.png`) because page 1 is an image
- Execution policy: no external agent code was run. Video identity was checked via transcript, metadata, and official CS25 counterpart, not by re-training anything.

## Evidence ledger

| Claim | Evidence | Strength | Article section |
| --- | --- | --- | --- |
| The 68-minute package is not a new 2026 Karpathy lecture | Transcript at 0:00 says he returned to OpenAI “one week ago”; at 2:09 he is newly a YouTuber; at 21:14 he works at OpenAI; official CS25 upload is dated January 10, 2023; X replies on 2026-08-17 call the clip “from 2023” | High | intro, 실제 구조 |
| The YouTube/X video is a stitch, not one continuous talk | Host thanks him at 22:19; Q&A about scratchpads; then a hard jump into “I want to talk about transformers” | High | 실제 구조 |
| Karpathy’s “delete everything” refers to attention, not agent graphs | Transcript ~39:20: “delete everything like what's making this work very well is just the attention by itself. And so delete everything keep attention” | High | 먼저 알아야 할 개념, 핵심 기능 |
| In this lecture, “graph” means tokens/nodes + attention message passing + compute graph shape | Transcript 44:15, 44:49, 45:05, 57:50, late RNN vs transformer compute-graph contrast | High | 먼저 알아야 할 개념 |
| Karpathy does not say “Prompting is fading away” in the captured transcript | Full transcript search; 0 hits. The line appears only on the X wrapper by @callanxai | High | 실제 구조, 조심해야 할 점 |
| @callanxai’s post rewrites the lecture as LLM → Prompts → Agents → Graphs | Post text fetched 2026-08-18; 108k views, 1402 bookmarks | High | 실제 구조 |
| The X Article URL is login-walled; the 8-step body is in the publication post | Article URL blocked; [post 2087167924410658912](https://x.com/hanakoxbt/status/2087167924410658912) and the [Glean mirror](https://glean.smartcoder.ai/a/graph-engineering-from-1-prompt-to-100-agents-in-one-system-njjdnh) match | High | 실제 구조 |
| The 8-step guide never cites Karpathy | Full publication-post text: no Karpathy, Stanford, attention, or “delete everything” | High | 실제 구조, 조심해야 할 점 |
| In that guide, graph = execution map | Nodes have one job, input, structured output, named failure; edges exist only if the next step reads the previous output | High | 핵심 기능 |
| The same author also uses “graph” for knowledge memory | Post 2082588747393355937: “the unit of work is one relationship” | High | 먼저 알아야 할 개념 |
| The Karpathy pairing is a distribution template | Callan attached the same guide to an Andrew Ng clip the day before; hanakoxbt reused it under Jeff Dean / Google / Anthropic clips | High | 조심해야 할 점 |
| The Drive PDF is an independent July 2026 study note, not an Anthropic/Karpathy paper | Cover: “Independently compiled, July 2026 - not affiliated with Andrej Karpathy and Anthropic - and not endorsed”; title includes “Improved 1000x by Itself” | High | 실제 구조, 조심해야 할 점 |
| The PDF’s “graph” is commit DAG + knowledge graph + durable shared state | PDF sections II–IV and conclusion step 3: “Graph engineering: agents share durable state through typed, queryable graphs of work and knowledge.” | High | 핵심 기능 |
| Mid-2026 “Graph Engineering” is not one concept | AI Builder Club: orchestration graph, explicitly not GraphRAG. AI Operator: three meanings, plus a fabricated “$3.1M Stanford and Anthropic study”. Panaversity: commit DAG / knowledge graph / governance graph | High | 먼저 알아야 할 개념, 조심해야 할 점 |
| LangGraph-style orchestration predates the 2026 name | Harrison Chase quoted July 20, 2026: “it's basically just langgraph?” | High as a documented reaction; not a proof that all 2026 uses reduce to LangGraph | 조심해야 할 점 |
| Graphify’s graph is still a different object | Existing published article in this repo | High | 먼저 알아야 할 개념 |
| “1000x” is a slogan, not a measurement | PDF title; Panaversity explicitly calls it a slogan; PDF reports ~700 experiments / ~20 retained optimizations from autoresearch writeups, not a 1000x benchmark | High | 조심해야 할 점 |

## Junior explanation notes

- A graph is only useful after you can name the nodes, the arrows, and the question those arrows answer.
- Karpathy’s 2023 lecture uses “graph” the way a compiler person uses it: tokens talk to earlier tokens.
- 2026 posters use “graph” three other ways: who runs next, what facts persist, and how loops supervise one another.
- This blog already has a fourth graph (Graphify): symbols and files, not tokens, not agent roles.
- The transferable lesson is reduction, not a product: delete the part that is not load-bearing, keep the structure that is.

## Editorial judgment (author, not source)

- The 2026 title is a category error that sells a real older lecture by attaching it to a newer buzzword.
- The PDF is more honest than the X wrapper because it discloses independence, but its “1000x” subtitle still participates in the same inflation.
- The useful idea underneath all four graphs is the same: move state out of a disappearing context window and make the remaining structure inspectable.
- That idea does not justify wiring LangGraph, GraphRAG, Graphify, and transformer attention into one stack.
- For this site, keep Graphify as a code map, keep Karpathy’s lecture as architecture intuition, and treat 2026 Graph Engineering as a vocabulary fight until a specific node/edge contract is named.

## Draft outline

1. Thesis: the viral title is a wrapper; the lecture graph is attention.
2. 먼저 알아야 할 개념: four graphs
3. 실제 구조: stitch, X wrapper, PDF, blocked article
4. 핵심 기능: what each graph can actually do
5. 좋은 점
6. 조심해야 할 점
7. 언제 쓰면 좋은가
8. 주니어 개발자가 배울 점
9. 내 결론
10. 확인한 자료

## Quality gate notes

- Verified quotes stay under 25 words.
- X Article URL remains walled; claims use the publication post and matching mirror, not a guessed article-only version.
- “1000x”, “prompting is fading”, and Graph Engineering-as-Karpathy are labeled as wrapper or slogan.
- No publication status change.
- `npm run validate` required before closeout.
