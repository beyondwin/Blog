# Queue Sync Contract

사용자가 “queue sync 해줘”라고 요청하면 이 문서를 작업 계약으로 본다.

## 입력

- [queue.md](queue.md)를 읽는다.
- unchecked item 중 `comment:` metadata가 있는 항목만 처리한다.
- 사용자가 batch를 명시하지 않으면 한 세션에 한 항목만 처리한다.

## 필수 동작

1. 글을 쓰기 전에 source URL을 직접 읽는다.
2. `comment:`를 editorial angle로 사용한다.
3. source-specific fact는 기억에 의존하지 않는다.
4. source를 길게 베끼지 않는다.
5. 직접 인용은 quote당 25단어 이하로 제한한다.
6. 분석 형식은 아래 중 하나로 고른다.
   - `research-report`
   - `essay`
   - `visual-page`
7. 결과 MDX는 `src/content/analysis/` 아래에 만든다.
8. frontmatter는 [src/content.config.ts](src/content.config.ts)의 `analysis` schema를 따른다.
9. 결과는 검토 가능한 글이어야 한다. source 요약, 반론, 실무 판단을 분리한다.
10. `npm run validate`를 통과시킨다.
11. 생성 작업은 `codex/` branch에서 진행한다.
12. commit, push, GitHub PR 생성을 완료한다.
13. 처리한 queue item에 `output:`과 `pr:`을 기록한다.

## Queue Item Format

```md
- [ ] https://example.com/some-article
  comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
```

## 성공한 항목

```md
- [x] https://example.com/some-article
  comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
  output: src/content/analysis/some-article.mdx
  pr: https://github.com/owner/repo/pull/123
```

## 막힌 항목

```md
- [ ] https://example.com/paywalled
  comment: 사업적 시사점 중심으로.
  status: blocked
  error: paywall or access restriction
```

## Generated MDX Shape

```mdx
---
title: "Clear generated title"
description: "One sentence summary for listing and SEO."
sourceUrl: "https://example.com/source"
sourceTitle: "Original source title"
comment: "Original queue comment"
format: "research-report"
createdAt: "2026-06-30"
updatedAt: "2026-06-30"
tags: ["strategy"]
status: "review"
draft: false
---

## Summary

Summarize the source in original language.

## Core argument

Explain the main claim and evidence.

## Counterpoints

List missing assumptions, risks, or alternate explanations.

## Takeaways

Connect the source to practical decisions.
```

## 완료 기준

- `npm run validate`가 통과한다.
- `queue.md`에 `output:`이 실제 `.mdx` 파일을 가리킨다.
- PR이 있다면 `pr:`은 HTTPS URL이다.
- source 접근 불가, paywall, 라이선스 문제는 글을 억지로 만들지 않고 `status: blocked`로 남긴다.
