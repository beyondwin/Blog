# FORM & THOUGHT editorial ledger

- Status: complete with inherited legacy-validation boundary recorded below
- Inventory frozen: 2026-08-29 (Asia/Seoul), before any Task 11 MDX edit
- Authority: [ADR-0007](../adr/0007-form-and-thought-react-only-editorial-system.md), [Task 11](../form-and-thought-implementation-plan.md#task-11-%EC%8B%A4%EC%A0%9C-%EC%BD%98%ED%85%90%EC%B8%A0-36%ED%8E%B8%EC%9D%84-%EC%83%88-%EC%9D%BD%EA%B8%B0-%EA%B5%AC%EC%A1%B0%EC%97%90-%EB%A7%9E%EA%B2%8C-%ED%8E%B8%EC%A7%91%ED%95%9C%EB%8B%A4)
- Scope assertion: articles `17`, reviews `18`, thoughts `1`; examples excluded
- Outcome vocabulary: `edited`, `verified-no-change`; `pending` is used only while this ledger is being completed

This ledger is the pre-edit corpus seal and the claim-level editorial record. The
SHA-256 values below are hashes of the exact source files before Task 11 editing.
An `edited` outcome requires a changed MDX file; imported review dates remain the
original archive dates required by the review-import contract. A
`verified-no-change` outcome leaves both source bytes and `updatedAt` untouched.
No record may gain a fact, reading event, rating, objection, recommendation or
source that is absent from its authored text or evidence packet.

## Frozen inventory

### Articles (17)

| Slug | Created | Original title | Original core claim | Source-grounded / packet | Pre-edit SHA-256 | Outcome |
|---|---|---|---|---|---|---|
| `agents-md-vs-agent-skills-evidence` | 2026-07-26 | AGENTS.md가 Skills보다 낫다는 말은 어디까지 맞을까 | 저장소 기본 규칙은 AGENTS.md, 특정 작업 절차와 도구는 Skill이 적합하며 한 평가를 일반화하면 안 된다. | yes / `docs/notes/article-factory/agents-md-vs-agent-skills-evidence.md` | `d4d292eedf7f9974223421276369fc3ef0d60470f037dffc81ed74872677044d` | verified-no-change |
| `ai-design-references` | 2026-05-16 | AI 디자인 도구를 보는 기준 | AI 디자인 도구는 대체 능력이 아니라 실험과 판단을 빠르게 만드는 능력으로 평가해야 한다. | no / none | `bc21a3b669009d924567cfb8020685e4fbc3517022ca130dfc8d06bc0f2ab33c` | verified-no-change |
| `andrej-karpathy-skills-analysis` | 2026-05-16 | 코딩 에이전트에게 필요한 네 가지 규율 | 저장소의 가치는 코드보다 검증, 최소 변경, 가정 표시, 학습 설명을 강제하는 행동 규칙에 있다. | no / none | `985b58da2838516df3d6c1fba8cc79c5cb397efa62ed54a83c1d7c6deea4d11a` | verified-no-change |
| `aws-static-frontend-serverless-bff` | 2026-07-26 | AWS 정적 프런트엔드와 서버리스 BFF를 고르는 기준 | 정적 export, BFF, CloudFront·S3 경계를 구분해야 이 구성을 안전하게 선택할 수 있다. | yes / `docs/notes/article-factory/aws-static-frontend-serverless-bff.md` | `1940644762559d9b25925cf5240397577d3b61515b88e7a2e69082b3c65986cb` | verified-no-change |
| `codex-ui-mockup-workflow` | 2026-05-16 | 이미지 목업을 제대로 된 UI로 구현하는 순서 | 목업을 바로 코드로 옮기기보다 구조, 토큰, 컴포넌트, 반응형 규칙으로 분해해야 한다. | no / none | `13df53357ea07ada7274477d9e72280fef6a16cf3184c63d5630c4b2c8441b30` | verified-no-change |
| `context-refinement-system-design` | 2026-05-16 | Context Refinement System 설계 요약 | 불완전한 요청을 목표·배경·제약·출력으로 분리하고 애매함을 다시 다듬는 파이프라인이 필요하다. | no / none | `794d0bf583bc9d1bc7f52dbe55c00752999aa93f62e6ed582af8561a2dc444b0` | verified-no-change |
| `graphify-code-knowledge-graph-deep-dive` | 2026-07-12 | Graphify는 코드 이해를 정말 더 빠르게 만드는가? | Graphify는 탐색 지도로는 유용하지만 실행 의미와 동일시해서는 안 된다. | yes / `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md` | `4b55314fe55b2c179812346f65dbe3f6995564342af61b56c67886403f522833` | verified-no-change |
| `hermes-agent-persistent-worker-runtime` | 2026-06-29 | Hermes Agent는 어떻게 개인 AI 워커 런타임을 만들고 있나 | Hermes Agent는 단순 채팅 도구가 아니라 도구·기억·스킬·크론을 묶은 개인용 지속 작업자 런타임이다. | yes / `docs/notes/article-factory/hermes-agent-persistent-worker-runtime.md` | `305812afd97fcaba55ca74b83cbc82a7e070cf00b15aa657821ffc1d685614bc` | verified-no-change |
| `karpathy-delete-everything-keep-graph` | 2026-08-18 | 2026년에 남길 것은 그래프 제품이 아니다 | 2023년 발언의 핵심은 attention이며, 2026년 에이전트 설계의 병목은 검증·관측·복구에 있다. | yes / `docs/notes/article-factory/karpathy-delete-everything-keep-graph.md` | `909ce6c5448e0cc7bd8e1aec42bb6ad727ae1400c9caf62e40ab31f6093299b0` | verified-no-change |
| `lazycodex-agent-harness-analysis` | 2026-06-24 | LazyCodex는 Codex를 어떻게 제품형 개발 하네스로 바꾸는가 | LazyCodex는 모델 능력을 바꾸기보다 큰 코드베이스에서 성급한 실행을 줄이는 작업 규율 하네스다. | yes / `docs/notes/article-factory/lazycodex-agent-harness-analysis.md` | `9a89640f874640a7b41dc55a3625a3545d38cbc3ffbe674c6bf4b6bc26ede20e` | verified-no-change |
| `oh-my-pi-deep-review` | 2026-07-12 | oh-my-pi는 진짜 쓸 만한가: 강력한 에이전트 하네스의 구조와 위험 | OMP는 폭넓은 실행 환경이지만 확장성은 공급망·실행·권한 위험과 같이 평가해야 한다. | yes / `docs/notes/article-factory/oh-my-pi-deep-review.md` | `d534b3ba147ff094449198c34118e916fc7341b00537e463f53aae8a8ccfa14f` | verified-no-change |
| `open-design-repo-analysis` | 2026-05-16 | Open Design 분석 | open-design은 단순 생성기보다 로컬 우선 디자인 에이전트 런타임에 가깝다. | no / none | `35a543dab688211563cc2e19d01b788860273daf1b42655a22877ef94291f390` | verified-no-change |
| `pgvector-hybrid-search` | 2026-07-09 | pgvector로 벡터 검색 이해하기: 임베딩, SQL, HNSW, RRF까지 | 벡터 검색은 의미 유사도를 다루며 실전에서는 키워드 검색과 하이브리드로 결합해야 한다. | no / none | `50c6abcbd3c50a54f04ccd827d9ab0971ff787665888ded317a9050c502636a9` | verified-no-change |
| `ponytail-agent-minimalism-analysis` | 2026-06-25 | Ponytail은 AI 코딩 에이전트를 어떻게 덜 과하게 만드는가 | Ponytail은 짧은 프롬프트가 아니라 과잉 구현 전에 멈추게 하는 최소주의 행동 배포판이다. | yes / `docs/notes/article-factory/ponytail-agent-minimalism-analysis.md` | `3afbb19adfe20283f869b8ff683788ef2e072e260f7567bd1efc67894b2a9409` | verified-no-change |
| `postgresql-bm25-pg-search` | 2026-07-09 | PostgreSQL 안에서 BM25 검색 만들기: FTS부터 pg_search와 n-gram까지 | 반복 `LIKE`를 넘어 언어 특성과 순위화 요구에 맞춰 FTS, BM25, n-gram을 선택해야 한다. | no / none | `929ec0a5c9125104a58fa58704e583b5eef56c00a06dae9885569065c0ad66ae` | verified-no-change |
| `shared-ai-conversation-evidence-boundaries` | 2026-07-26 | 공유된 AI 대화는 어디까지 근거가 될 수 있을까 | 공유 대화는 가설 단서이지 키 기술 주장의 독립 근거가 아니며 숨은 입력과 링크를 따로 검증해야 한다. | yes / `docs/notes/article-factory/shared-ai-conversation-evidence-boundaries.md` | `3c036ac83d936fae55134956aa99ab7120824792ea2326a103ba84641b638d6e` | verified-no-change |
| `uncle-bob-ai-code-review-evidence` | 2026-07-26 | AI가 쓴 코드를 읽지 않아도 된다는 말의 조건 | 사람 검토를 없애기보다 저위험 변경에서 줄 단위 검토를 줄이고 실행 가능한 명세와 독립 검증을 강화해야 한다. | yes / `docs/notes/article-factory/uncle-bob-ai-code-review-evidence.md` | `32fc5177444fdd492beca2e2422906a45b870180a64e650f821a9a04dd4569fc` | verified-no-change |

### Reviews (18)

Reviews have no article-factory packet. Their source boundary is the authored MDX,
approved frontmatter verdict, and preserved original review URL.

| Slug | Created | Original title | Original core claim / verdict | Pre-edit SHA-256 | Outcome |
|---|---|---|---|---|---|
| `art-thief` | 2026-04-06 | 예술 도둑 | 예술 도둑은 예술을 향한 원함이 삶과 관계를 잠식한 중독의 기록이다. | `3a2d12d6a037dfb4e239af7ab7f88cbd93420a5a49ee017dbb1137bf3eda849e` | verified-no-change |
| `black-swan` | 2026-05-27 | 블랙스완 | 우리는 현실보다 현실을 정리한 이야기를 보며, 예측 불가능성을 견디는 태도가 필요하다. | `5a93a7836920139178ca7d6898ef1f8792281dc72c1a1c331f18b6b297ca972e` | verified-no-change |
| `changing-their-minds` | 2026-06-16 | 그들의 생각을 바꾸는 방법 | 생각은 설득 한 번이 아니라 목표, 관계, 반복, 개인의 시점이 만나 바뀔 수밖에 없는 순간을 맞는다. | `311eacac2fde20199d0dca4af4bb464e4a801961bf92be4b02bca2da2deddca1` | verified-no-change |
| `convenience-store-woman` | 2026-01-06 | 편의점 인간 | 주류 삶의 기준에 자신을 끼워 맞추려는 고군분투를 통해 개인과 사회의 충돌을 보여 준다. | `633290e06b36cd77eb5287d7607c4732c5893ea322f31c9e9c40bb4b7c3c3206` | edited |
| `devotion-of-suspect-x` | 2026-04-21 | 용의자 X의 헌신 | 마지막에 이르러 추리 구조보다 한 사람의 극단적 헌신에 관한 이야기로 남는다. | `63e73f8e61dcb3a43d7cb8be79d39f993d315e9b168fa217fcbfb72943207326` | verified-no-change |
| `doing-good-better` | 2025-12-10 | 냉정한 이타주의자 | 세계를 정확히 보는 데서 멈추지 않고 데이터로 더 효과적인 실천을 선택하게 한다. | `fdf37613aba0d176edbff865dc4083e874a728224e8215f11e5b7b1538d73eac` | verified-no-change |
| `factfulness` | 2025-11-17 | 팩트풀니스 | 인간의 직관은 현실을 쉽게 왜곡하며, 데이터와 점검 습관으로 판단 오류를 줄여야 한다. | `27c00477a06b097a613d860943cbd0f89eeaa93cdd40cc487780d2637f9c3107` | verified-no-change |
| `future-arrived-first` | 2026-01-26 | 먼저 온 미래 | AI 시대의 핵심은 통제를 장담하는 것이 아니라 인간의 판단과 선택을 묻는 데 있다. | `28b25882556474626439c24a3e92373196260796cd1525213bac93cf443f0eea` | verified-no-change |
| `goethe-said-everything` | 2026-05-12 | 괴테는 모든 것을 말했다 | 이 책은 괴테의 위대함보다 사람이 진리를 받아들이기 위해 왜 권위자의 이름을 필요로 하는지 묻는다. | `5a3c0aae9c1639503e02da097bcda28d65f90a207005214bd3a1d0b3abe2221c` | verified-no-change |
| `habitus` | 2026-03-10 | 아비투스 | 취향과 자연스러운 행동은 개인 선택만이 아니라 삶의 조건과 사회적 위치가 쌓은 결과일 수 있다. | `f46c4f5ffcece2a14d2c51dbde88da71757bb3641de068088caec15166730c5a` | verified-no-change |
| `how-adam-smith-can-change-your-life` | 2026-02-20 | 내 안에서 나를 만드는 것들 | 행복은 성공과 평판이 아니라 승인을 갈망하는 나를 거리 두고 보는 시선에서 비롯된다. | `30686e54fca825d2b47d1fee075cccb7674c2d07df45e4cb3441d292716b8d15` | verified-no-change |
| `how-we-crossed-winter` | 2026-01-15 | 우리가 겨울을 지나온 방식 | 돌봄 가족의 삶과 선택을 통해 사회의 돌봄 현실과 모든 가족의 존엄을 생각하게 한다. | `3c7ec05fc719ef3db27a9ebcc7e64513da9c3cab834739ea417c234abde208ca` | edited |
| `lolita` | 2026-02-10 | 롤리타 | 불편한 화자의 언어에 쉽게 끌려가지 않으려면 독자의 비판적 거리가 필요하다. | `bfeef3dbdfeeb27fd5fe777adb2131f3f453315955047386374f54d4f3787751` | verified-no-change |
| `lord-of-the-flies` | 2026-06-02 | 파리대왕 | 얼굴을 가리는 순간 개인의 책임과 양심이 흐려지며 폭력이 쉽게 받아들여진다. | `f2e8c33c249cf6681908fd753cb0a509e47200a90a9720ca4f8cb898ad395722` | verified-no-change |
| `miracles-of-namiya-general-store` | 2025-12-29 | 나미야 잡화점의 기적 | 여러 시간선의 사람들이 상담 편지로 엮이며 다른 사람의 고민을 함께 들여다보게 한다. | `bf654a57bea0325af67a1cb387ea197e9a7c031bc54edb6eb21e3cbbb7c5af02` | verified-no-change |
| `nevertheless` | 2026-05-19 | 그럼에도 불구하고 | 행복은 고통이 없는 상태보다 행복하기 위해 계속 애쓰는 삶의 태도에 가깝다. | `100773fae7e4c418d7eceb28915f0cee4900f3be7c761dde409fa686c85dd264` | verified-no-change |
| `poor-charlies-almanack` | 2026-04-16 | 가난한 찰리의 연감 | 망치만 들고 삶을 보지 않으려면 여러 학문의 멘탈 모델과 겸손을 함께 갖춰야 한다. | `f438a297387337a83869a3c7d92b8fb4ed75b2612ce78d94a055dec07c794d8e` | verified-no-change |
| `siddhartha` | 2026-03-24 | 싯다르타 | 지혜는 말로 전달되기보다 삶을 직접 건너며 배우는 경험에서 얻어진다. | `3032fbdd477902cd6c5f50b8a71b348695395292035ddcbf65c0b66b2b1de909` | verified-no-change |

### Thought (1)

| Slug | Created | Original title | Original core claim | Source-grounded / packet | Pre-edit SHA-256 | Outcome |
|---|---|---|---|---|---|---|
| `why-i-read-in-the-ai-era` | 2026-08-16 | AI 시대에, 나는 왜 책을 읽는가 | 답이 빨라질수록 책은 느리게 머물며 자신의 판단을 만드는 시간을 준다. | no / none | `f70707bd8af73f0cd51706b3423b40af5962fbb10896f6a9b2fa812d8f920eb7` | edited |

## Per-record editorial decisions

The frozen inventory above records each original claim. The tables below record the
evidence boundary, outcome and sentence-level editorial decision. “Retained all”
means the existing headings, factual claims, authored opinion, quotations, URLs and
dates were left byte-for-byte intact. No source packet changed in this task.

### Article decisions

| Record | Evidence boundary | Outcome and changes | Repetition removed | Sources retained | Unsupported sentences |
|---|---|---|---|---|---|
| `agents-md-vs-agent-skills-evidence` | matching article-factory packet, audited 2026-08-26 | verified-no-change; claim hierarchy and limits already lead | none | retained all packet-backed sources | none found or added |
| `ai-design-references` | authored MDX and its inline URLs | verified-no-change; criteria-first structure is already clear | none | retained all | none found or added |
| `andrej-karpathy-skills-analysis` | authored MDX and repository-analysis framing | verified-no-change; four disciplines already form the argument | none | retained all | none found or added |
| `aws-static-frontend-serverless-bff` | matching article-factory packet, audited 2026-08-26 | verified-no-change; architecture boundary and decision criteria already lead | none | retained all packet-backed sources | none found or added |
| `codex-ui-mockup-workflow` | authored MDX and its inline URLs | verified-no-change; workflow sequence is already concise | none | retained all | none found or added |
| `context-refinement-system-design` | authored MDX and its stated design assumptions | verified-no-change; pipeline and constraints are already explicit | none | retained all | none found or added |
| `graphify-code-knowledge-graph-deep-dive` | matching article-factory packet, audited 2026-08-26 | verified-no-change; benefits and execution-semantics limit are balanced | none | retained all packet-backed sources | none found or added |
| `hermes-agent-persistent-worker-runtime` | matching article-factory packet, audited 2026-08-26 | verified-no-change; runtime thesis and boundaries already lead | none | retained all packet-backed sources | none found or added |
| `karpathy-delete-everything-keep-graph` | matching article-factory packet, audited 2026-08-26 | verified-no-change; dated quotation and present-day interpretation remain separated | none | retained all packet-backed sources | none found or added |
| `lazycodex-agent-harness-analysis` | matching article-factory packet, audited 2026-08-26 | verified-no-change; harness claim and caveats already match evidence | none | retained all packet-backed sources | none found or added |
| `oh-my-pi-deep-review` | matching article-factory packet, audited 2026-08-26 | verified-no-change; verdict, capability map and risk boundary are already explicit | none | retained all packet-backed sources | none found or added |
| `open-design-repo-analysis` | authored MDX and repository-analysis framing | verified-no-change; local-first runtime claim is already bounded | none | retained all | none found or added |
| `pgvector-hybrid-search` | authored MDX and inline technical sources | verified-no-change; longest article remains intentionally tutorial-complete | none | retained all | none found or added |
| `ponytail-agent-minimalism-analysis` | matching article-factory packet, audited 2026-08-26 | verified-no-change; minimalism claim and limitations already align | none | retained all packet-backed sources | none found or added |
| `postgresql-bm25-pg-search` | authored MDX and inline technical sources | verified-no-change; comparison tables are necessary to the selection guide | none | retained all | none found or added |
| `shared-ai-conversation-evidence-boundaries` | matching article-factory packet, audited 2026-08-26 | verified-no-change; evidence limits are the leading claim | none | retained all packet-backed sources | none found or added |
| `uncle-bob-ai-code-review-evidence` | matching article-factory packet, audited 2026-08-26 | verified-no-change; quotation, conditions and recommendation remain separated | none | retained all packet-backed sources | none found or added |

### Review decisions

Every review is bounded by its authored MDX, approved `verdict`, book metadata and
preserved `sourceUrl`; no independent reading event or rating was inferred.

| Record | Outcome and changes | Repetition removed | Sources retained | Unsupported sentences |
|---|---|---|---|---|
| `art-thief` | verified-no-change; verdict already leads and plot supports the objection | none | verdict, metadata, original URL | none found or added |
| `black-swan` | verified-no-change; verdict and practical objection already dominate summary | none | verdict, metadata, original URL | none found or added |
| `changing-their-minds` | verified-no-change; change mechanism already leads | none | verdict, metadata, original URL | none found or added |
| `convenience-store-woman` | edited; merged two opening plot paragraphs and tightened description while preserving the exact opening verdict and imported archive date | repeated setup about imitating “ordinary” coworkers | verdict, every authored judgment, metadata, original URL | none added |
| `devotion-of-suspect-x` | verified-no-change; short verdict-led form is already sufficient; cover remains intentionally held | none | verdict, metadata, original URL | none found or added |
| `doing-good-better` | verified-no-change; practical verdict and objection already lead | none | verdict, metadata, original URL | none found or added |
| `factfulness` | verified-no-change; judgment and reading value already outweigh summary | none | verdict, metadata, original URL | none found or added |
| `future-arrived-first` | verified-no-change; AI-era judgment already leads | none | verdict, metadata, original URL | none found or added |
| `goethe-said-everything` | verified-no-change; authority question already frames the review | none | verdict, metadata, original URL | none found or added |
| `habitus` | verified-no-change; social-position claim and reservation are concise | none | verdict, metadata, original URL | none found or added |
| `how-adam-smith-can-change-your-life` | verified-no-change; longest review title wraps without requiring copy changes | none | verdict, metadata, original URL | none found or added |
| `how-we-crossed-winter` | edited; condensed plot setup and conclusion, tightened description, preserved exact opening verdict and imported archive date | repeated isolation, structural critique and closing recap | verdict, named characters and authored judgments, metadata, original URL | removed unsupported cross-country superlative about elderly suicide and poverty rates |
| `lolita` | verified-no-change; critical-distance verdict already leads | none | verdict, metadata, original URL | none found or added |
| `lord-of-the-flies` | verified-no-change; responsibility thesis already leads | none | verdict, metadata, original URL | none found or added |
| `miracles-of-namiya-general-store` | verified-no-change; connection between timelines is concise and supports the verdict | none | verdict, metadata, original URL | none found or added |
| `nevertheless` | verified-no-change; philosophical verdict already leads | none | verdict, metadata, original URL | none found or added |
| `poor-charlies-almanack` | verified-no-change; mental-model verdict and caveat are already balanced | none | verdict, metadata, original URL | none found or added |
| `siddhartha` | verified-no-change; experience-over-instruction verdict already leads | none | verdict, metadata, original URL | none found or added |

### Thought decision

| Record | Evidence boundary | Outcome and changes | Repetition removed | Sources retained | Unsupported sentences |
|---|---|---|---|---|---|
| `why-i-read-in-the-ai-era` | authored reflective prose; no external packet | edited; removed article-style headings and in-body figures, reduced body from 1,918 to 1,256 characters, preserved the 2026-08-16 creation date and central judgment | repeated conclusions about AI knowing more and answers becoming abundant | original meaning, first-person stance, description and featured media | none added |

## Batch validation

Each batch ran the same five-command gate under Node 24: `validate-content`,
`article:quality`, `public-release:build`, `public-release:verify` and
`public-release:clean-test`. After the review-import date contract was rechecked,
the two affected review batches were rerun. The final deterministic release is
`b0b665fffb192c19a7dc1c08349935d110c0bd2e64098dae71456e803deea9ef`:
43 records, 6 assets, 0 private-boundary hits and 6 destructive cleanup targets
rejected. The earlier all-batch seal before that date-contract correction was
`ac45fee95fc74cae283ea67ceecdc4f402f2e8351026d6caa2d0c527169a0b94`.

| Batch | Records | Outcome |
|---|---|---|
| article evidence boundaries | `agents-md`, `aws`, `karpathy`, `shared-ai`, `uncle-bob` | pass |
| article runtimes | `graphify`, `hermes`, `lazycodex`, `oh-my-pi`, `ponytail` | pass |
| article design/workflow | `ai-design`, `codex-ui`, `context-refinement` | pass |
| article repository analysis | `andrej-karpathy-skills`, `open-design` | pass |
| article search/data | `pgvector`, `postgresql-bm25` | pass |
| reviews 1 | `art-thief` through `doing-good-better` | pass |
| reviews 2 | `factfulness` through `how-we-crossed-winter` | pass |
| reviews 3 | `lolita` through `siddhartha` | pass |
| thought | `why-i-read-in-the-ai-era` | pass |

## Browser evidence

The production static export was served on isolated local port `4398` and checked
in a headed Chromium session at `1440×900` and `390×844`. Screenshots were kept as
unstaged QA output under `output/playwright/task11-*`. All ten views had zero
document-width overflow, zero empty links, zero broken images and zero console
errors or warnings.

| Required view | Desktop and mobile evidence | Links / source panel | Rhythm and visual result |
|---|---|---|---|
| longest article: `pgvector-hybrid-search` | 126 paragraphs, 12 tables, 3 images; no overflow at either width | 5 article links, 0 empty; all 3 internal occurrences returned 200; 2 external source links; “확인한 자료” present | 31.5px body line height; longest paragraph 231 characters; long title and intro wrap without clipping |
| table-heavy article: `postgresql-bm25-pg-search` | 98 paragraphs, 10 tables; no overflow at either width | 8 external links, 0 empty; “확인한 자료” present | 31.5px body line height; longest paragraph 262 characters; at 390px every table resolves to the 346px content width |
| longest review title: `how-adam-smith-can-change-your-life` | 11 paragraphs; no overflow or broken media | no article-body links; source panel not applicable | title wraps to two deliberate lines at both widths; verdict remains the first reading paragraph |
| cover-hold review: `devotion-of-suspect-x` | 9 paragraphs, 0 images; no overflow or broken media | no article-body links; source panel not applicable | “표지 공개 보류” is visible instead of a fabricated cover; verdict and body keep a clear gap |
| thought: `why-i-read-in-the-ai-era` | 18 short paragraphs, 1 featured image; no overflow at either width | no links; source panel not applicable | 31.5px body line height; longest paragraph 120 characters; no body headings or in-body figures interrupt the prose |

Visual inspection of all ten screenshots confirmed stable margins, readable title
wrapping, intact action rails and deliberate paragraph spacing. The mobile thought
retains the single approved featured image while the body remains prose-only.

## Final verification and residual boundaries

- Focused editorial RED/GREEN: pass. Verdict-first assertions pass; review bodies
  are 770 and 831 characters; the thought is 1,256 characters with no body heading
  or body `Figure`; all three `createdAt` values are unchanged.
- Verified-no-change seal: pass. All 33 source files still match their frozen
  pre-edit SHA-256 values exactly.
- Review import contract: `scripts/site-content.test.mjs` passes 27/27 after the two
  edited reviews preserved their original archive `updatedAt` values.
- Content, article quality, final release build/verify/clean, React site build,
  agent setup and `git diff --check`: pass under Node 24. Final release is
  `b0b665fffb192c19a7dc1c08349935d110c0bd2e64098dae71456e803deea9ef`.
- `npm run validate`: reaches the test stage but remains non-green only at the
  inherited legacy media boundary: `reading-desk-cobalt` is still referenced by
  `mediaRegistry.test.ts` and the Astro parity builders after Task 1 moved the
  canonical thought media. Result: 84 test files passed, 3 failed; 755 tests
  passed, 1 failed, 3 skipped. This Task 11 source-only allowlist does not authorize
  repairing those legacy tests or Astro loaders.
- Strict media validation passes with the existing 17 review-cover redistribution
  warnings. React site build also emits the existing duplicate Sharp/libvips class
  warning, but completes and prerenders every route successfully.
