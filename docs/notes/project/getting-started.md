# beyondwin 시작하기

이 문서는 현재 React-only `FORM & THOUGHT` public site를 로컬에서 검증하고 여는 최소 절차다.

## 준비물

- Node.js 24.x
- npm 11.x
- Git checkout 또는 isolated worktree

## 1. 상태와 dependency 확인

```bash
git status --short --branch
node --version
npm --version
npm ci
```

기존 dirty file과 local server를 보존한다. `npm ci`는 committed lockfile의 React Router,
React, TypeScript, Vitest, Playwright, MDX, Zod, Sharp를 설치한다.

## 2. 전체 검증

```bash
npm run validate
```

이 명령은 다음을 순서대로 실행한다.

1. agent/docs contract
2. source content와 25-word quote limit
3. strict media/approval inventory
4. source-grounded article quality
5. public memory projection
6. 전체 Vitest와 workspace typecheck
7. immutable public release build, verify, cleanup guard
8. local-origin React static export

strict media가 17 review-cover redistribution warning을 출력하는 것은 현재 text-led production
경계의 알려진 상태다. warning을 숨기거나 cover byte를 임의로 공개하지 않는다.

## 3. 개발 서버

```bash
npm run site:dev
```

다른 server를 종료하지 말고 필요하면 별도 port를 사용한다. 공개 route는 active verified
release를 읽는다. source MDX를 바꾼 뒤에는 `npm run public-release:build`를 먼저 실행한다.

## 4. static artifact와 실제 host

```bash
npm run public-release:build
npm run public-release:verify
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
```

`site:build`는 local evidence용 `https://form-thought.local.invalid` canonical을 사용한다.
production build는 승인된 domain이 있을 때만 다음 형태로 실행한다.

```bash
FORM_THOUGHT_SITE_ORIGIN=https://example.com npm run site:build:production
```

현재 실제 production origin은 `not_measured`, cutover authorization은 `false`다.

## 5. 주요 route 확인

- Home: `http://127.0.0.1:4391/`
- primary: `/reviews/`, `/articles/`, `/thoughts/`, `/search/`
- secondary: `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/`
- actual 404: `/definitely-not-a-public-route/`

UI 변경이면 1440×900, route별 calibrated reference width, 768px, 390×844, 320px에서
console, keyboard, serious/critical accessibility, overflow, no-JS, reduced motion, image failure를
확인한다.

## 한 record가 공개되는 경로

```text
src/content/<collection>/<slug>.mdx
  -> packages/content/src/schemas.ts
  -> packages/content/src/source-records.ts
  -> packages/content/src/release/build-release.ts
  -> build/public-releases/<sha256>/manifest.json
  -> apps/site/app/release.server.ts
  -> apps/site/app/routes.ts + route module
  -> apps/site/build/client/<route>/index.html
```

media는 `src/assets/content/<collection>/<slug>/media.yml`에서 같은 release로 들어간다. UI는
manifest나 source path를 직접 해석하지 않는다.

## 완료 기준

`npm run agent:check`, `npm run validate`, affected Playwright suite, `git diff --check`, final
status와 diff review가 모두 최신 실행이어야 한다. production origin, production traffic,
authorization처럼 실행하지 않은 항목은 `not_measured` 또는 `false`로 기록한다.
