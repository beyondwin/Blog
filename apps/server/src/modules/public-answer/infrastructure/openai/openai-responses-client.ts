import {
  PublicAnswerInvalidResponseError,
  PublicAnswerTransportError,
} from '../../domain/public-answer-errors.js';
import { canonicalProviderJson } from './provider-json.js';

const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const RESPONSE_CAP = 64 * 1024;

export type ResponsesApplicationKind = 'generation' | 'semantic';

export interface ResponsesContract {
  readonly schemaName: string;
  readonly applicationKind: ResponsesApplicationKind;
  readonly schema: unknown;
}

export interface StructuredResponse {
  readonly value: unknown;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new PublicAnswerInvalidResponseError(`${label} must be an object`);
  if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new PublicAnswerInvalidResponseError(`${label} has extra or missing keys`);
  }
  return value;
}

function assertEvidenceApplication(value: unknown): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw new PublicAnswerInvalidResponseError('provider application evidence is invalid');
  }
  for (const item of value) {
    const record = exactKeys(item, ['evidenceId', 'excerpt'], 'provider application evidence item');
    if (typeof record.evidenceId !== 'string' || typeof record.excerpt !== 'string') {
      throw new PublicAnswerInvalidResponseError('provider application evidence item is invalid');
    }
  }
}

function assertApplicationData(text: string, kind: ResponsesApplicationKind): void {
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch (error) {
    throw new PublicAnswerInvalidResponseError('provider application data is invalid JSON', { cause: error });
  }
  const record = exactKeys(
    decoded,
    kind === 'generation' ? ['question', 'evidence'] : ['sentences', 'evidence'],
    'provider application data',
  );
  assertEvidenceApplication(record.evidence);
  if (kind === 'generation') {
    if (typeof record.question !== 'string') throw new PublicAnswerInvalidResponseError('provider application question is invalid');
    return;
  }
  if (!Array.isArray(record.sentences) || record.sentences.length < 1) {
    throw new PublicAnswerInvalidResponseError('provider application sentences are invalid');
  }
  for (const sentence of record.sentences) {
    const item = exactKeys(sentence, ['sentenceId', 'text', 'evidenceIds'], 'provider application sentence');
    if (typeof item.sentenceId !== 'string' || typeof item.text !== 'string' || !Array.isArray(item.evidenceIds)
      || item.evidenceIds.some((id) => typeof id !== 'string')) {
      throw new PublicAnswerInvalidResponseError('provider application sentence is invalid');
    }
  }
}

export function assertCanonicalResponsesRequest(request: unknown, contract: ResponsesContract): void {
  const root = exactKeys(
    request,
    ['model', 'store', 'tools', 'reasoning', 'max_output_tokens', 'input', 'text'],
    'Responses request',
  );
  if (root.model !== 'gpt-5.4-mini-2026-03-17' || root.store !== false || root.max_output_tokens !== 500
    || !Array.isArray(root.tools) || root.tools.length !== 0) {
    throw new PublicAnswerInvalidResponseError('Responses request settings are invalid');
  }
  const reasoning = exactKeys(root.reasoning, ['effort'], 'Responses reasoning');
  if (reasoning.effort !== 'none') throw new PublicAnswerInvalidResponseError('Responses reasoning is invalid');
  const text = exactKeys(root.text, ['format'], 'Responses text');
  const format = exactKeys(text.format, ['type', 'name', 'strict', 'schema'], 'Responses format');
  if (format.type !== 'json_schema' || format.name !== contract.schemaName || format.strict !== true
    || canonicalProviderJson(format.schema) !== canonicalProviderJson(contract.schema)) {
    throw new PublicAnswerInvalidResponseError('Responses schema is invalid');
  }
  if (!Array.isArray(root.input) || root.input.length !== 2) {
    throw new PublicAnswerInvalidResponseError('Responses request must contain two messages');
  }
  const expectedRoles = ['developer', 'user'];
  root.input.forEach((value, index) => {
    const message = exactKeys(value, ['role', 'content'], 'Responses message');
    if (message.role !== expectedRoles[index] || !Array.isArray(message.content) || message.content.length !== 1) {
      throw new PublicAnswerInvalidResponseError('Responses message is invalid');
    }
    const content = exactKeys(message.content[0], ['type', 'text'], 'Responses content');
    if (content.type !== 'input_text' || typeof content.text !== 'string') {
      throw new PublicAnswerInvalidResponseError('Responses content is invalid');
    }
    if (index === 1) assertApplicationData(content.text, contract.applicationKind);
  });
}

export function assertExactResponsesRequest(actual: unknown, expected: unknown, contract: ResponsesContract): void {
  assertCanonicalResponsesRequest(actual, contract);
  assertCanonicalResponsesRequest(expected, contract);
  if (canonicalProviderJson(actual) !== canonicalProviderJson(expected)) {
    throw new PublicAnswerInvalidResponseError('Responses request differs from the sealed request tree');
  }
}

async function readCappedBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new PublicAnswerInvalidResponseError('provider response is invalid');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > RESPONSE_CAP) {
        await reader.cancel().catch(() => undefined);
        throw new PublicAnswerInvalidResponseError('provider response exceeded byte cap');
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? error;
    if (error instanceof PublicAnswerInvalidResponseError) throw error;
    throw new PublicAnswerInvalidResponseError('provider response is invalid', { cause: error });
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new PublicAnswerInvalidResponseError('provider response is invalid', { cause: error });
  }
}

function extractStructured(parsed: unknown): StructuredResponse {
  if (!isPlainObject(parsed) || parsed.status !== 'completed' || !Array.isArray(parsed.output)
    || parsed.output.length !== 1) {
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
  }
  const message = parsed.output[0];
  if (!isPlainObject(message) || message.type !== 'message' || message.role !== 'assistant'
    || !Array.isArray(message.content) || message.content.length !== 1) {
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
  }
  const content = message.content[0];
  if (!isPlainObject(content) || content.type !== 'output_text' || typeof content.text !== 'string') {
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
  }
  const usage = parsed.usage;
  if (!isPlainObject(usage) || !Number.isInteger(usage.input_tokens) || !Number.isInteger(usage.output_tokens)
    || (usage.input_tokens as number) < 0 || (usage.output_tokens as number) < 0) {
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
  }
  let value: unknown;
  try { value = JSON.parse(content.text); } catch (error) {
    throw new PublicAnswerInvalidResponseError('provider response is invalid', { cause: error });
  }
  return Object.freeze({
    value,
    usage: Object.freeze({ inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number }),
  });
}

export class OpenAiResponsesClient {
  constructor(private readonly apiKey: string, private readonly request: typeof fetch = globalThis.fetch) {
    if (!apiKey) throw new Error('OpenAI API key is required');
  }

  async structured(request: unknown, contract: ResponsesContract, signal: AbortSignal): Promise<StructuredResponse> {
    assertCanonicalResponsesRequest(request, contract);
    let response: Response;
    try {
      response = await this.request(RESPONSES_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      throw new PublicAnswerTransportError('provider response request failed', { cause: error });
    }
    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel().catch(() => undefined);
      throw new PublicAnswerTransportError('provider response request failed');
    }
    return extractStructured(await readCappedBody(response, signal));
  }
}
