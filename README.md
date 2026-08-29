# beyondwin

개인 지식과 긴 글을 공개하는 `FORM & THOUGHT` 정적 사이트입니다. 공개 renderer는
React Router Framework Mode 하나이며, `src/content/`의 MDX와 공개 memory projection을
검증한 immutable release만 `apps/site`가 읽습니다.

## 공개 표면

| route | 역할 |
| --- | --- |
| `/` | hero와 실제 서평·아티클·생각을 고른 editorial home |
| `/reviews/` | 공개 서평 18건과 detail |
| `/articles/` | 공개 아티클 17건과 detail |
| `/thoughts/` | 생각 한 건과 비어 있는 다섯 칸, detail |
| `/search/` | primary corpus 검색과 discovery |
| `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/` | primary navigation/search 밖의 secondary canonical routes |

`packages/content`가 source schema, trusted MDX, media와 release를 소유하고
`packages/contracts`가 public record contract를 소유합니다. 공개 memory는
`src/data/memory.public.json`만 읽으며 top-level `memory/**`를 public app에서 직접 읽지
않습니다.

## 로컬 작업

Node 24를 사용합니다.

```bash
npm ci
npm run validate
npm run site:dev
```

immutable release와 static output을 따로 확인할 때는 다음 순서입니다.

```bash
npm run public-release:build
npm run public-release:verify
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
```

`site:build`는 reserved local origin으로 evidence를 만듭니다. production build에는 명시적으로
승인된 normalized HTTPS `FORM_THOUGHT_SITE_ORIGIN`이 필요합니다. 현재 production domain은
`not_measured`, production cutover authorization은 `false`이며 build는 deploy가 아닙니다.

## 문서

- [시작하기](docs/notes/project/getting-started.md)
- [아키텍처 레퍼런스](docs/notes/project/architecture-reference.md)
- [콘텐츠 운영](docs/notes/project/publishing-workflows.md)
- [Design built truth](DESIGN.md)
- [ADR index](docs/notes/project/adr/README.md)
- [Final acceptance](docs/notes/project/evidence/form-and-thought-final-acceptance.md)

과거 Public Atlas, renderer comparison/cutover 자료는 의사결정 history입니다. 현재 작업은
ADR-0007, 실제 package scripts와 위 built-truth 문서를 따릅니다.

## Archive Docs

`docs/raw/`는 원문·provenance, `docs/notes/`는 사람이 정리한 durable source,
`docs/wiki/`는 generated navigation입니다. curated note를 추가·이동하면
`docs/_index/catalog.yml`, 필요 시 `docs/_index/topics.yml`, `docs/INDEX.md`를 함께 갱신합니다.
