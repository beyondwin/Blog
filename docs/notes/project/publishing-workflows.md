# 콘텐츠 운영

이 문서는 `src/content/` source record를 안전하게 만들고 immutable public release까지
검증하는 현재 절차다. 모든 명령은 repository root에서 실행한다.

## 공통 공개 조건과 완료 기준

공개 조건은 모든 source collection에서 정확히 다음 둘을 함께 만족하는 것이다.

```yaml
status: "published"
draft: false
```

scaffold, import, source review, risk fix나 build 성공은 publication authorization이 아니다.
사용자가 명시적으로 승인하지 않으면 `review`/draft를 published로 바꾸지 않는다.

```bash
npm run validate
```

이 final gate는 source content, strict media/rights, article quality, public memory, 전체 tests와
typecheck, immutable release build/verify/cleanup, React static build를 실행한다. substantial prose,
table, code, image 또는 UI 영향이 있으면 실제 route도 확인한다.

## source schema와 record 만들기

schema source of truth는 `packages/content/src/schemas.ts`다. source collection은 `analysis`,
`articles`, `ideas`, `reviews`, `travel`, `thoughts`다.

```bash
npm run content:new -- <article|review|scene|idea> ...
```

이 명령은 `src/content/<collection>/<slug>.mdx`와
`src/assets/content/<collection>/<slug>/media.yml`을 collision-safe하게 함께 만든다. CLI의
`scene` 입력은 travel review scaffold를 만드는 기존 alias일 뿐 공개 scene UI를 만들지 않는다.
모든 scaffold는 `status: review`, `draft: true`다.

## ordinary article

`src/content/articles/<slug>.mdx`를 만들고 최소 공통 frontmatter를 채운다.

```mdx
---
title: "읽을 수 있는 제목"
description: "목록과 metadata에 보일 한 문장 요약."
createdAt: "2026-08-29"
updatedAt: "2026-08-29"
tags: ["workflow"]
status: "review"
draft: true
recordKind: "technical-note"
evidenceState: "personal"
---

본문.
```

blockquote 한 줄은 25단어 이하로 유지한다. `updatedAt`은 `createdAt`보다 빠를 수 없다.
확인할 route는 `/articles/<slug>/`다.

## public thought

short-form public thought는 `src/content/thoughts/<slug>.mdx`에 둔다. article subtype field나
article-like scaffolding을 붙이지 않는다. 현재 공개 thought는
`why-i-read-in-the-ai-era` 한 건이며 canonical route도 thoughts detail 하나뿐이다.

새 thought를 공개하면 schema, route inventory, thought index의 정확히 한 real cell 계약,
search/home selection과 docs를 함께 검토해야 한다. 현재 index는 real one + inert empty five를
요구하므로 두 번째 thought는 새 제품 결정 없이는 공개하지 않는다.

## source-grounded article

```bash
npm run article:new -- ...
```

evidence packet은 `docs/notes/article-factory/`, draft는 `src/content/articles/`에 생긴다.
`source-grounded` tag가 있으면 `npm run article:quality`가 아래 section과 자료 URL을 요구한다.

- `먼저 알아야 할 개념`
- `실제 구조`
- `핵심 기능`
- `좋은 점`
- `조심해야 할 점`
- `언제 쓰면 좋은가`
- `주니어 개발자가 배울 점`
- `내 결론`
- `확인한 자료`

packet의 source inventory/evidence ledger를 먼저 채우고 공식 docs, source, release note 또는
local clone으로 주장마다 확인한다. 접근할 수 없는 자료는 gap으로 남기고 발명하지 않는다.

## review와 cover rights

```bash
npm run content:new -- review --slug factfulness --title "Factfulness" --isbn 9788934985068
```

published review는 author, valid ISBN-13, publisher, verdict와 `coverState`가 필요하다.

- `coverState: hold`: `coverMedia`를 두지 않는다. text-led로 공개한다.
- `coverState: verified`: source bundle에 동일 판본 cover item이 있어야 한다. 그러나 이것만으로
  public cover byte를 허용하지 않는다.

review cover가 release에 들어가려면 `media.yml` source URL/credit/rights note, exact ISBN/edition,
source-identical bytes와 checksum, production approval registry의 controller +
independent-rights-reviewer receipt가 모두 일치해야 한다. 하나라도 없으면 strict validator는
warning을 남기고 release는 cover bytes를 제외한다.

현재 18 review 중 production-approved cover는 0건이다. 17건의 rights warning은 의도적으로
보존하며 `devotion-of-suspect-x`는 `coverState: hold`다. warning을 없애기 위해 approval을
만들거나 cover를 재생성하지 않는다.

### Naver review intake

importer는 매번 새 local intake directory만 쓴다.

```bash
node scripts/import-naver-reviews.mjs \
  --output docs/_inbox/naver-reviews-YYYY-MM-DD
```

output은 `status: review`, `draft: true`이고 발견한 cover URL은 intake JSON의 조사 단서로만
남는다. `src/`, `public/`, existing directory를 output으로 쓰지 않는다. 본문/verdict, bibliography,
edition, media와 rights를 각각 검토하고 명시적 승인을 받은 뒤 exact record만 옮긴다.

## idea와 travel

idea는 `maturity: seed|sketch|proposal`을 명시한다. travel은 `location`을 요구하고 optional
`visitedAt`을 display date로 쓴다. published travel에는 `privacyReviewed: true`와 verified
`leadMedia`가 모두 필요하다.

secondary routes는 same FORM & THOUGHT shell을 쓰지만 primary navigation/search에는 들어가지
않는다.

## media bundle

asset과 `media.yml`은 반드시 같은
`src/assets/content/<collection>/<slug>/` bundle에 둔다. item은 다음을 기록한다.

- unique media id와 local `file`
- `kind`, non-empty `alt`, `credit`
- 정확히 하나의 `sourceUrl` 또는 safe `sourcePath`
- `verifiedAt`, `rightsNote`, SHA-256 checksum, dimensions
- book cover이면 ISBN-13과 edition

```bash
npm run media:validate
npm run media:validate -- --strict
```

non-strict는 진단, strict는 completion boundary다. UI에서 remote URL을 hotlink하거나
`media.yml`을 직접 읽지 않는다. frontmatter의 `featuredMedia`, `coverMedia`, `leadMedia` id를
release builder가 resolve한다.

### repository-generated media

generated image는 ignored local intake에서 candidate/contact sheet를 먼저 만든다. public asset이
되려면 모두 필요하다.

1. canonical required-batch registry entry
2. candidate checksum과 placement를 가진 durable decision manifest
3. exact `controller` + `independent-visual-reviewer` approval
4. approved contact sheet와 approved original checksum
5. rights review `approve-repository-publication`
6. `sourceKind: repository-generated`와 matching generation metadata

현재 rights caveat는 `non-exclusive generated output; copyrightability/uniqueness not
guaranteed`다. 승인되지 않은 후보, HOLD와 rejected image는 public release에 넣지 않고
text-led fallback을 유지한다.

## queue analysis

[SYNC.md](../../../SYNC.md)를 따른다. unchecked URL과 `comment:`를 읽고 source를 직접 확인한
뒤 `src/content/analysis/<slug>.mdx`를 만든다. 접근 제한이면 source-specific fact를 추정하지
않고 item에 `status: blocked`, `error:`를 기록한다.

성공한 item은 checkbox, exact `output:`과 실제 PR이 있을 때만 `pr:`을 기록한다. 분석 record도
publication authority 전에는 `review`/draft 상태다.

## public memory

public route/release는 `src/data/memory.public.json`만 읽는다.

```bash
npm run memory:seed
npm run memory:review -- report
npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD
npm run memory:project
npm run memory:validate
```

promotion은 명시적으로 승인된 slug만 수행한다. public projection eligibility는
`confidentiality: public`, `surfaces: [memory-public]`, accepted review와 하나 이상의 safe source다.
local review queue는 commit하지 않는다. public app code에 top-level `memory/**` import를
추가하지 않는다.

## immutable release와 route preview

source나 media를 바꾼 뒤 현재 public artifact를 본다.

```bash
npm run public-release:build
npm run public-release:verify
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
```

`site:build`는 local reserved origin용이다. production build는 approved normalized exact HTTPS
origin이 있을 때만 `FORM_THOUGHT_SITE_ORIGIN=... npm run site:build:production`으로 실행한다.
현재 production origin은 `not_measured`, authorization은 `false`다.

## archive docs

original wording/provenance는 `docs/raw/`, curated source는 `docs/notes/<topic>/`, unsorted intake는
`docs/_inbox/`, generated navigation은 `docs/wiki/`에 둔다. durable note를 추가·이동하면
catalog, 필요 시 topics, `docs/INDEX.md`를 함께 갱신한다.

## troubleshooting

`Content validation failed`
: `packages/content/src/schemas.ts`의 field, status/draft, URL, date, 25-word quote를 확인한다.

`Strict media validation failed`
: bundle path/checksum/dimensions/provenance, generated approval batch, review redistribution receipt를
확인한다. warning을 approval로 해석하지 않는다.

route가 보이지 않는다
: source가 `published && !draft`인지, active release를 다시 build/verify했는지, release-derived
route inventory에 있는지 확인한다. UI source가 source MDX를 직접 읽도록 우회하지 않는다.

검색의 no-JS query 결과가 보이지 않는다
: 현재 static architecture의 known limitation이다. GET URL과 base discovery는 유지되지만
query-specific filter/input restore는 hydration-dependent다. 해결하려면 delivery/URL architecture
결정이 먼저 필요하다.
