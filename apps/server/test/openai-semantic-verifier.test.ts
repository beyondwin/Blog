import { describe, expect, it, vi } from 'vitest';

import type { AuthorizedEvidence } from '../src/modules/public-answer/domain/public-answer.js';
import type { SupportedSentenceUnit } from '../src/modules/public-answer/application/ports/answer-verifier.js';
import {
  OpenAiResponsesClient,
  assertExactResponsesRequest,
} from '../src/modules/public-answer/infrastructure/openai/openai-responses-client.js';
import { OpenAiSemanticVerifier, SUPPORT_SCHEMA } from '../src/modules/public-answer/infrastructure/verification/semantic-verifier.js';

const EVIDENCE_ID = 'a'.repeat(64);

const units: readonly SupportedSentenceUnit[] = Object.freeze([
  { id: 'claim-1-sentence-1', claimId: 'claim-1', text: '첫 문장.', evidenceIds: [EVIDENCE_ID], critical: true },
  { id: 'claim-1-sentence-2', claimId: 'claim-1', text: '둘째 문장.', evidenceIds: [EVIDENCE_ID], critical: true },
]);

const evidence: readonly AuthorizedEvidence[] = Object.freeze([{
  evidenceId: EVIDENCE_ID, chunkId: 'b'.repeat(64), answerReleaseId: 'c'.repeat(64),
  recordId: 'articles/example', collectionLabel: '기록', recordTitle: '제목', canonicalPath: '/articles/example/',
  locator: { kind: 'heading-paragraph', label: '판단', ordinal: 1 }, excerpt: '첫 문장. 둘째 문장.',
  excerptChecksum: `sha256:${'d'.repeat(64)}`,
}]);

function completed(value: unknown): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    usage: { input_tokens: 50, output_tokens: 4 },
  }), { status: 200 });
}

describe('OpenAiSemanticVerifier', () => {
  it('omits uniqueItems from the sealed Luna support schema', () => {
    expect(JSON.stringify(SUPPORT_SCHEMA)).not.toContain('uniqueItems');
  });

  it('sends the recursive exact semantic tree with sentence and evidence application data only', async () => {
    const requests: any[] = [];
    const verifier = new OpenAiSemanticVerifier(new OpenAiResponsesClient('fixture-key', vi.fn(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return completed({ supportedSentenceIds: units.map((unit) => unit.id), contradictedSentenceIds: [] });
    })));
    const result = await verifier.verify({ sentenceUnits: units, evidence, signal: new AbortController().signal });
    expect(result).toEqual({ supportedSentenceIds: units.map((unit) => unit.id), contradictedSentenceIds: [], usage: { inputTokens: 50, outputTokens: 4 } });
    const request = requests[0];
    expect(Object.keys(request).sort()).toEqual(['input', 'max_output_tokens', 'model', 'reasoning', 'store', 'text', 'tools']);
    expect(request).toMatchObject({
      model: 'gpt-5.6-luna', store: false, tools: [],
      reasoning: { effort: 'high' }, max_output_tokens: 500,
    });
    expect(request.text).toEqual({ format: { type: 'json_schema', name: 'public_answer_support_v1', strict: true, schema: SUPPORT_SCHEMA } });
    const data = JSON.parse(request.input[1].content[0].text);
    expect(data.sentences).toEqual(units.map((unit) => ({ sentenceId: unit.id, text: unit.text, evidenceIds: unit.evidenceIds })));
    expect(data.evidence[0]).toEqual({ evidenceId: EVIDENCE_ID, excerpt: expect.stringContaining('UNTRUSTED_RETRIEVED_TEXT') });
    expect(JSON.stringify(request)).not.toMatch(/claimId|critical|recordTitle|recordId|chunkId|canonicalPath|locator|checksum|releaseId|bindingId|approval|receipt/u);
  });

  it.each([
    ['missing', { supportedSentenceIds: [units[0]!.id], contradictedSentenceIds: [] }],
    ['foreign', { supportedSentenceIds: [...units.map((unit) => unit.id), 'foreign'], contradictedSentenceIds: [] }],
    ['duplicate', { supportedSentenceIds: [units[0]!.id, units[0]!.id], contradictedSentenceIds: [units[1]!.id] }],
    ['overlap', { supportedSentenceIds: units.map((unit) => unit.id), contradictedSentenceIds: [units[1]!.id] }],
    ['extra-key', { supportedSentenceIds: units.map((unit) => unit.id), contradictedSentenceIds: [], repaired: true }],
  ])('rejects %s sentence partition without repair', async (_label, payload) => {
    let calls = 0;
    const verifier = new OpenAiSemanticVerifier(new OpenAiResponsesClient('fixture-key', async () => {
      calls += 1;
      return completed(payload);
    }));
    await expect(verifier.verify({ sentenceUnits: units, evidence, signal: new AbortController().signal })).rejects.toThrow(/semantic provider output/u);
    expect(calls).toBe(1);
  });

  it('makes exactly one semantic call and accepts a complete contradicted partition', async () => {
    let calls = 0;
    const verifier = new OpenAiSemanticVerifier(new OpenAiResponsesClient('fixture-key', async () => {
      calls += 1;
      return completed({ supportedSentenceIds: [units[0]!.id], contradictedSentenceIds: [units[1]!.id] });
    }));
    await expect(verifier.verify({ sentenceUnits: units, evidence, signal: new AbortController().signal })).resolves.toMatchObject({
      supportedSentenceIds: [units[0]!.id], contradictedSentenceIds: [units[1]!.id],
    });
    expect(calls).toBe(1);
  });

  it.each([
    ['sentence array item', (data: any) => data.sentences.push({ sentenceId: 'foreign', text: 'x', evidenceIds: [EVIDENCE_ID] })],
    ['sentence object key', (data: any) => { data.sentences[0].claimId = 'forbidden'; }],
    ['sentence evidence array item', (data: any) => data.sentences[0].evidenceIds.push('f'.repeat(64))],
    ['evidence object key', (data: any) => { data.evidence[0].locator = { label: 'forbidden' }; }],
  ])('recursive exact semantic comparison rejects an extra %s', async (_label, mutate) => {
    let expected: any;
    const verifier = new OpenAiSemanticVerifier(new OpenAiResponsesClient('fixture-key', async (_url, init) => {
      expected = JSON.parse(String(init?.body));
      return completed({ supportedSentenceIds: units.map((unit) => unit.id), contradictedSentenceIds: [] });
    }));
    await verifier.verify({ sentenceUnits: units, evidence, signal: new AbortController().signal });
    const actual = structuredClone(expected);
    const data = JSON.parse(actual.input[1].content[0].text);
    mutate(data);
    actual.input[1].content[0].text = JSON.stringify(data);
    expect(() => assertExactResponsesRequest(actual, expected, {
      schemaName: 'public_answer_support_v1', applicationKind: 'semantic', schema: SUPPORT_SCHEMA,
    })).toThrow();
  });

  it('keeps the final semantic request within the shared 6,000-byte input budget', async () => {
    let serialized = '';
    const ids = Array.from({ length: 4 }, (_, index) => String(index + 1).repeat(64));
    const semanticEvidence = ids.map((evidenceId) => ({ ...evidence[0]!, evidenceId, excerpt: '\\'.repeat(1_000) }));
    const semanticUnits = [{ ...units[0]!, evidenceIds: ids }];
    const verifier = new OpenAiSemanticVerifier(new OpenAiResponsesClient('fixture-key', async (_url, init) => {
      serialized = String(init?.body);
      return completed({ supportedSentenceIds: [semanticUnits[0]!.id], contradictedSentenceIds: [] });
    }));
    await verifier.verify({ sentenceUnits: semanticUnits, evidence: semanticEvidence, signal: new AbortController().signal });
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(6_000);
    const request = JSON.parse(serialized);
    const application = JSON.parse(request.input[1].content[0].text);
    expect(application.evidence[0].excerpt).toContain('\\'.repeat(1_000));
  });

  it('rejects a non-server sentence ID before semantic provider work', async () => {
    const fetcher = vi.fn(async () => completed({ supportedSentenceIds: [], contradictedSentenceIds: [] }));
    const verifier = new OpenAiSemanticVerifier(new OpenAiResponsesClient('fixture-key', fetcher));
    await expect(verifier.verify({
      sentenceUnits: [{ ...units[0]!, id: 'provider-chosen' }], evidence, signal: new AbortController().signal,
    })).rejects.toThrow(/sentence units/u);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
