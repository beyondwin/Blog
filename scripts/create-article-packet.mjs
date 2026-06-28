import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const socialHosts = new Set([
  'threads.com',
  'www.threads.com',
  'x.com',
  'twitter.com',
  'www.reddit.com',
  'reddit.com',
  'news.ycombinator.com',
]);

export function slugifyTitle(value) {
  const asciiWords = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  const slug = asciiWords
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'article';
}

export function classifyInput(value) {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();

    if (host === 'github.com' || host.endsWith('.github.com')) {
      return { type: 'github', value: trimmed };
    }

    if (socialHosts.has(host)) {
      return { type: 'social', value: trimmed };
    }

    return { type: 'url', value: trimmed };
  } catch {
    return { type: 'keyword', value: trimmed };
  }
}

function yamlString(value) {
  return JSON.stringify(value);
}

function normalizeInput(input) {
  const date = input.date ?? new Intl.DateTimeFormat('en-CA').format(new Date());
  const title = input.title.trim();
  const slug = input.slug?.trim() || slugifyTitle(title);
  const classified = input.inputType
    ? { type: input.inputType, value: input.input }
    : classifyInput(input.input ?? title);

  return {
    title,
    slug,
    input: classified.value,
    inputType: classified.type,
    date,
  };
}

export function buildPacketMarkdown(input) {
  const normalized = normalizeInput(input);

  return `# ${normalized.title} Research Packet

Date: ${normalized.date}
Status: research-ready
Target article: src/content/articles/${normalized.slug}.mdx

## Intake

- Input: ${normalized.input}
- Input type: ${normalized.inputType}
- Default angle: Deep technical analysis with a junior explanation layer.

## Source Inventory

| Source | Type | Why it matters | Status |
| --- | --- | --- | --- |
| ${normalized.input} | ${normalized.inputType} | Starting point for canonical identity research. | queued |

## Local Source Inspection

- Repository path:
- Commit:
- Files inspected:
- Execution policy: static inspection only unless the owner explicitly approves running external code.

## Evidence Ledger

| Claim | Evidence | Strength | Article Section |
| --- | --- | --- | --- |
| Canonical identity is verified before writing. | Source inventory and official material. | High | intro |
| Junior readers need a plain-language setup before implementation details. | Article Factory design. | High | 먼저 알아야 할 개념 |

## Junior Explanation Notes

- Explain the main concept without assuming prior product knowledge.
- Define unfamiliar workflow, architecture, or tooling terms before using them heavily.
- Include a practical lesson a junior developer can transfer to other projects.

## Draft Outline

1. Thesis
2. 먼저 알아야 할 개념
3. 실제 구조
4. 핵심 기능
5. 좋은 점
6. 조심해야 할 점
7. 언제 쓰면 좋은가
8. 주니어 개발자가 배울 점
9. 내 결론
10. 확인한 자료

## Quality Gate Notes

- Verified behavior is separated from market narrative.
- Source list supports the article's strongest claims.
- Repeated headings and repeated opening sentences are removed.
- The article passes npm run article:quality and npm run validate.
`;
}

export function buildArticleMarkdown(input) {
  const normalized = normalizeInput(input);

  return `---
title: ${yamlString(normalized.title)}
description: ${yamlString(`${normalized.title}의 실제 구조, 장점, 리스크, 실무 도입 기준을 출처 기반으로 정리한다.`)}
createdAt: "${normalized.date}"
updatedAt: "${normalized.date}"
tags: ["AI", "tooling", "workflow", "source-grounded"]
status: "review"
---

${normalized.title}을 한 문장으로 먼저 판단하면, 이 글은 공식 자료와 실제 소스 확인을 끝낸 뒤 구체적인 결론으로 시작해야 한다.

## 먼저 알아야 할 개념

이 섹션에서는 주니어 개발자가 글의 나머지 부분을 읽기 전에 알아야 하는 핵심 개념을 쉬운 말로 설명한다.

## 실제 구조

공식 문서, GitHub 저장소, 패키지 메타데이터, 릴리스 노트에서 확인한 실제 구조를 정리한다.

## 핵심 기능

사용자가 실제로 얻게 되는 기능과 작업 흐름을 설명한다.

## 좋은 점

검증된 근거를 바탕으로 강점을 정리한다.

## 조심해야 할 점

권한, 유지보수, 비용, 보안, 버전 변동성 같은 도입 리스크를 정리한다.

## 언제 쓰면 좋은가

실무에서 이 주제가 맞는 상황과 맞지 않는 상황을 구분한다.

## 주니어 개발자가 배울 점

도구 자체를 쓰지 않더라도 가져갈 수 있는 개발 습관과 판단 기준을 정리한다.

## 내 결론

도입 여부, 실험 순서, 다음 행동을 분명히 제안한다.

## 확인한 자료

- ${normalized.input}
`;
}

export async function createArticleFactoryFiles(input, options = {}) {
  const root = options.root ?? process.cwd();
  const normalized = normalizeInput(input);
  const packetPath = `docs/notes/article-factory/${normalized.slug}.md`;
  const articlePath = `src/content/articles/${normalized.slug}.mdx`;
  const files = [
    { path: packetPath, content: buildPacketMarkdown(normalized) },
    { path: articlePath, content: buildArticleMarkdown(normalized) },
  ];

  if (!options.dryRun) {
    for (const file of files) {
      const absolutePath = join(root, file.path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content);
    }
  }

  return {
    slug: normalized.slug,
    packetPath,
    articlePath,
    files,
  };
}

function parseArgs(argv) {
  const args = { input: '', title: '', slug: '', dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--title') {
      args.title = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--slug') {
      args.slug = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (!args.input) {
      args.input = arg;
    }
  }

  const title = args.title || args.input;

  if (!title) {
    throw new Error('Usage: npm run article:new -- "<keyword-or-url>" --title "<title>" [--slug "<slug>"] [--dry-run]');
  }

  return { ...args, title };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await createArticleFactoryFiles(
    {
      title: args.title,
      slug: args.slug,
      input: args.input || args.title,
    },
    { dryRun: args.dryRun },
  );

  console.log(`Article packet: ${result.packetPath}`);
  console.log(`Article draft: ${result.articlePath}`);

  if (args.dryRun) {
    for (const file of result.files) {
      console.log(`\n--- ${file.path} ---\n${file.content}`);
    }
  }
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
