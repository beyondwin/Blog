import { describe, expect, it } from 'vitest';

import {
  assertRealHiddenEvaluationAuthority,
  parseHiddenEvalManifest,
} from '../../src/modules/public-answer/evaluation/hidden-eval-manifest.js';

const checksum = (character: string) => `sha256:${character.repeat(64)}`;
const categories = [
  ...Array(30).fill('answerable'),
  ...Array(12).fill('unanswerable'),
  ...Array(12).fill('adversarial'),
  ...Array(6).fill('robustness'),
] as const;

function manifest(split: 'hidden-runtime' | 'test-only-hidden-shape' = 'test-only-hidden-shape') {
  return {
    schemaVersion: 1,
    split,
    custodianRole: 'site-owner',
    frozenAt: '2026-08-30T00:00:00.000Z',
    corpusApprovalHash: checksum('a'),
    retrievalPolicyHash: checksum('b'),
    cases: categories.map((category, index) => ({
      id: split === 'hidden-runtime' ? `hidden-${index + 1}` : `test-hidden-${index + 1}`,
      category,
      question: `synthetic structural question ${index + 1}`,
      expectedMode: category === 'answerable' || category === 'robustness' ? 'answer' : 'search',
      requiredEvidence: category === 'answerable' || category === 'robustness'
        ? [{ recordId: 'articles/approved' }] : [],
      allowedEvidence: category === 'answerable' || category === 'robustness'
        ? [{ recordId: 'articles/approved' }] : [],
      forbiddenRecordIds: category === 'answerable' || category === 'robustness'
        ? ['articles/forbidden'] : [],
      ...(category === 'robustness' ? { robustnessGroup: `group-${index}` } : {}),
    })),
  };
}

const options = {
  approvedRecordIds: new Set(['articles/approved']),
  publicDevelopmentQuestions: new Set(['public question']),
  corpusApprovalHash: checksum('a'),
  retrievalPolicyHash: checksum('b'),
};

describe('hidden evaluation manifest authority', () => {
  it('accepts the 30/12/12/6 structural test shape but never accepts it as promotion evidence', () => {
    const parsed = parseHiddenEvalManifest(manifest(), options);
    expect(parsed.cases).toHaveLength(60);
    expect(() => assertRealHiddenEvaluationAuthority(parsed)).toThrow(/test-only|synthetic|evidence/i);
  });

  it('accepts only the real hidden split with hidden IDs as evaluation evidence', () => {
    const parsed = parseHiddenEvalManifest(manifest('hidden-runtime'), options);
    expect(assertRealHiddenEvaluationAuthority(parsed)).toBe(parsed);
  });

  it('rejects unknown/prohibited fields, public duplicates, approval drift, and evidence set violations', () => {
    const source = manifest();
    expect(() => parseHiddenEvalManifest({ ...source, rawSourcePath: '/private' }, options)).toThrow(/unknown|field/i);
    expect(() => parseHiddenEvalManifest({ ...source, cases: [{ ...source.cases[0], excerpt: 'secret' }, ...source.cases.slice(1)] }, options)).toThrow(/unknown|field/i);
    expect(() => parseHiddenEvalManifest({ ...source, corpusApprovalHash: checksum('c') }, options)).toThrow(/approval/i);
    expect(() => parseHiddenEvalManifest({ ...source, cases: [{ ...source.cases[0], question: 'public question' }, ...source.cases.slice(1)] }, options)).toThrow(/public/i);
    expect(() => parseHiddenEvalManifest({ ...source, cases: [{ ...source.cases[0], requiredEvidence: [{ recordId: 'reviews/not-allowed' }] }, ...source.cases.slice(1)] }, options)).toThrow(/approval|record|required|allowed/i);
    expect(() => parseHiddenEvalManifest({ ...source, cases: [{ ...source.cases[0], allowedEvidence: [], requiredEvidence: [{ recordId: 'articles/approved' }] }, ...source.cases.slice(1)] }, options)).toThrow(/required|allowed/i);
    expect(() => parseHiddenEvalManifest({ ...source, cases: [{ ...source.cases[0], forbiddenRecordIds: ['articles/approved'] }, ...source.cases.slice(1)] }, options)).toThrow(/overlap/i);
  });

  it('rejects count/category/id/date/hash drift', () => {
    const source = manifest();
    expect(() => parseHiddenEvalManifest({ ...source, cases: source.cases.slice(1) }, options)).toThrow(/60|count/i);
    expect(() => parseHiddenEvalManifest({ ...source, cases: source.cases.map((item) => ({ ...item, category: 'answerable' })) }, options)).toThrow(/category|count/i);
    expect(() => parseHiddenEvalManifest({ ...source, frozenAt: 'yesterday' }, options)).toThrow(/date|instant/i);
    expect(() => parseHiddenEvalManifest({ ...source, retrievalPolicyHash: checksum('c') }, options)).toThrow(/retrieval/i);
  });
});
