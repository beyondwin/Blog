import {
  PublicAnswerInvalidResponseError,
  PublicAnswerTransportError,
} from '../../domain/public-answer-errors.js';
import { canonicalProviderJson } from './provider-json.js';
import { assertCurrentResponsesPolicy } from './provider-model-policy.js';

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
    void error;
    throw new PublicAnswerInvalidResponseError('provider application data is invalid JSON');
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
  assertCurrentResponsesPolicy(root);
  exactKeys(root.reasoning, ['effort'], 'Responses reasoning');
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

function releaseReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try { reader.releaseLock(); } catch { /* A pending read releases through its attached settlement handler. */ }
}

function cancelReaderWithoutWaiting(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pending?: Promise<ReadableStreamReadResult<Uint8Array>>,
): void {
  try {
    const cancellation = reader.cancel();
    void cancellation.then(() => releaseReader(reader), () => releaseReader(reader));
  } catch { /* The abort outcome must not depend on provider cancellation cooperation. */ }
  releaseReader(reader);
  if (pending) void pending.then(() => releaseReader(reader), () => releaseReader(reader));
}

function cancelBodyWithoutWaiting(body: ReadableStream<Uint8Array> | null): void {
  if (!body) return;
  try { void body.cancel().catch(() => undefined); } catch { /* Provider cancellation is untrusted and best-effort. */ }
}

function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    cancelReaderWithoutWaiting(reader);
    return Promise.reject(signal.reason);
  }
  const pending = reader.read();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      operation();
    };
    const onAbort = () => finish(() => {
      cancelReaderWithoutWaiting(reader, pending);
      reject(signal.reason);
    });
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then(
      (value) => finish(() => resolve(value)),
      () => finish(() => {
        if (signal.aborted) reject(signal.reason);
        else reject(new PublicAnswerInvalidResponseError('provider response is invalid'));
      }),
    );
  });
}

async function readCappedBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new PublicAnswerInvalidResponseError('provider response is invalid');
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = response.body.getReader(); } catch {
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await readWithSignal(reader, signal);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > RESPONSE_CAP) {
        cancelReaderWithoutWaiting(reader);
        throw new PublicAnswerInvalidResponseError('provider response exceeded byte cap');
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof PublicAnswerInvalidResponseError) throw error;
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
  } finally {
    releaseReader(reader);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    void error;
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
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
    void error;
    throw new PublicAnswerInvalidResponseError('provider response is invalid');
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
    } catch {
      if (signal.aborted) throw signal.reason;
      throw new PublicAnswerTransportError('provider response request failed');
    }
    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      cancelBodyWithoutWaiting(response.body);
      throw new PublicAnswerTransportError('provider response request failed');
    }
    return extractStructured(await readCappedBody(response, signal));
  }
}
