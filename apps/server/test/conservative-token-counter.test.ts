import { describe, expect, it } from 'vitest';

import {
  ConservativeTokenCounter,
} from '../src/modules/public-answer/infrastructure/openai/conservative-token-counter.js';

describe('ConservativeTokenCounter', () => {
  it('counts UTF-8 bytes as a conservative token upper bound', () => {
    const counter = new ConservativeTokenCounter();
    expect(counter.estimateText('abc')).toBe(3);
    expect(counter.estimateText('한')).toBe(3);
    expect(counter.estimateText('😀')).toBe(4);
  });

  it('truncates only at Unicode code-point boundaries', () => {
    const counter = new ConservativeTokenCounter();
    expect(counter.truncateText('가😀나', 7)).toEqual({ text: '가😀', estimatedTokens: 7, truncated: true });
  });

  it('preserves one complete excerpt and enforces evidence and total budgets', () => {
    const counter = new ConservativeTokenCounter();
    const selected = counter.fitEvidence({
      fixedInput: 'x'.repeat(1_900),
      evidence: [
        { evidenceId: 'a'.repeat(64), excerpt: '가'.repeat(1_000) },
        { evidenceId: 'b'.repeat(64), excerpt: '나'.repeat(1_000) },
      ],
      maxEvidenceTokens: 4_000,
      maxTotalTokens: 6_000,
    });
    expect(selected.evidence).toHaveLength(2);
    expect(selected.evidence[0]?.excerpt).toBe('가'.repeat(1_000));
    expect(selected.evidenceTokens).toBeLessThanOrEqual(4_000);
    expect(selected.totalTokens).toBeLessThanOrEqual(6_000);
    expect([...selected.evidence[1]!.excerpt].length).toBeGreaterThan(0);
  });

  it('rejects before provider work when fixed input exhausts the total budget', () => {
    const counter = new ConservativeTokenCounter();
    expect(() => counter.fitEvidence({
      fixedInput: 'x'.repeat(6_000),
      evidence: [{ evidenceId: 'a'.repeat(64), excerpt: 'complete' }],
      maxEvidenceTokens: 4_000,
      maxTotalTokens: 6_000,
    })).toThrow(/provider input budget/u);
  });

  it('rejects rather than emitting a partial first excerpt', () => {
    const counter = new ConservativeTokenCounter();
    expect(() => counter.fitEvidence({
      fixedInput: 'x'.repeat(5_995),
      evidence: [{ evidenceId: 'a'.repeat(64), excerpt: 'complete' }],
      maxEvidenceTokens: 4_000,
      maxTotalTokens: 6_000,
    })).toThrow(/complete excerpt/u);
  });
});
