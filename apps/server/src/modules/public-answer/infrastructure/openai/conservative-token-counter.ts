import { PublicAnswerInvalidResponseError } from '../../domain/public-answer-errors.js';

export interface EvidenceBudgetItem {
  readonly evidenceId: string;
  readonly excerpt: string;
}

export interface EvidenceBudgetResult {
  readonly evidence: readonly EvidenceBudgetItem[];
  readonly evidenceTokens: number;
  readonly totalTokens: number;
}

const utf8 = new TextEncoder();

export class ConservativeTokenCounter {
  estimateText(value: string): number {
    return utf8.encode(value).byteLength;
  }

  truncateText(value: string, tokenBudget: number): { text: string; estimatedTokens: number; truncated: boolean } {
    if (!Number.isInteger(tokenBudget) || tokenBudget < 0) throw new TypeError('token budget is invalid');
    let text = '';
    let estimatedTokens = 0;
    for (const codePoint of value) {
      const size = this.estimateText(codePoint);
      if (estimatedTokens + size > tokenBudget) break;
      text += codePoint;
      estimatedTokens += size;
    }
    return { text, estimatedTokens, truncated: text !== value };
  }

  fitEvidence(input: {
    readonly fixedInput: string;
    readonly evidence: readonly EvidenceBudgetItem[];
    readonly maxEvidenceTokens: number;
    readonly maxTotalTokens: number;
  }): EvidenceBudgetResult {
    const fixedTokens = this.estimateText(input.fixedInput);
    if (fixedTokens >= input.maxTotalTokens) {
      throw new PublicAnswerInvalidResponseError('provider input budget exhausted before evidence');
    }
    if (input.evidence.length === 0) throw new PublicAnswerInvalidResponseError('provider input requires evidence');

    const selected: EvidenceBudgetItem[] = [];
    let evidenceTokens = 0;
    for (const item of input.evidence) {
      const available = Math.min(
        input.maxEvidenceTokens - evidenceTokens,
        input.maxTotalTokens - fixedTokens - evidenceTokens,
      );
      if (available <= 0) break;
      const fit = this.truncateText(item.excerpt, available);
      if (selected.length === 0 && fit.truncated) {
        throw new PublicAnswerInvalidResponseError('provider input cannot preserve one complete excerpt');
      }
      if (fit.text.length === 0) break;
      selected.push(Object.freeze({ evidenceId: item.evidenceId, excerpt: fit.text }));
      evidenceTokens += fit.estimatedTokens;
      if (fit.truncated) break;
    }
    if (selected.length === 0) throw new PublicAnswerInvalidResponseError('provider input cannot preserve one complete excerpt');
    return Object.freeze({
      evidence: Object.freeze(selected),
      evidenceTokens,
      totalTokens: fixedTokens + evidenceTokens,
    });
  }
}
