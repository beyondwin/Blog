import { describe, expect, it } from 'vitest';
import { findQueueProblems, parseQueue } from './queue.mjs';

describe('parseQueue', () => {
  it('parses unchecked and checked queue items with metadata', () => {
    const markdown = `# Queue

- [ ] https://example.com/a
  comment: 제품 전략 관점에서 분석해줘.

- [x] https://example.com/b
  comment: 이미 처리된 항목.
  output: src/content/analysis/example-b.mdx
  pr: https://github.com/owner/repo/pull/1
`;

    expect(parseQueue(markdown)).toEqual([
      {
        checked: false,
        line: 3,
        url: 'https://example.com/a',
        metadata: {
          comment: '제품 전략 관점에서 분석해줘.',
        },
      },
      {
        checked: true,
        line: 6,
        url: 'https://example.com/b',
        metadata: {
          comment: '이미 처리된 항목.',
          output: 'src/content/analysis/example-b.mdx',
          pr: 'https://github.com/owner/repo/pull/1',
        },
      },
    ]);
  });

  it('reports unchecked items without comments', () => {
    const markdown = `# Queue

- [ ] https://example.com/a
`;

    const items = parseQueue(markdown);
    expect(findQueueProblems(items)).toEqual([
      'Line 3: queued URL is missing an indented comment line.',
    ]);
  });

  it('ignores text that is not a queue item', () => {
    const markdown = `# Queue

Add one URL with one short comment per item.
`;

    expect(parseQueue(markdown)).toEqual([]);
  });

  it('ignores queue-looking examples inside fenced code blocks', () => {
    const markdown = `# Queue

\`\`\`md
- [ ] https://example.com/example
  comment: 예시 항목입니다.
\`\`\`
`;

    expect(parseQueue(markdown)).toEqual([]);
  });
});
