import type { EmbeddingClient } from '../../application/ports/embedding-client.js';
import { OpenAIEmbeddingError } from './openai-errors.js';
import { exactObject, readCappedJson } from './provider-json.js';

const MODEL = 'text-embedding-3-large' as const; const DIMENSIONS = 3072 as const;
const PRODUCTION_BASE = 'https://api.openai.com/v1';

interface Options { readonly baseUrl?: string; readonly fetch?: typeof fetch; readonly maxBatchSize?: number }

export class OpenAIEmbeddingClient implements EmbeddingClient {
  readonly model = MODEL; readonly dimensions = DIMENSIONS;
  private readonly baseUrl: string; private readonly request: typeof fetch; private readonly maxBatchSize: number;
  constructor(private readonly apiKey: string, options: Options = {}) {
    if (!apiKey) throw new Error('OpenAI API key is required');
    this.baseUrl = options.baseUrl ?? PRODUCTION_BASE;
    if (this.baseUrl !== PRODUCTION_BASE && !/^http:\/\/127\.0\.0\.1:\d+\/v1$/u.test(this.baseUrl)) throw new Error('OpenAI base URL is forbidden');
    this.request = options.fetch ?? globalThis.fetch; this.maxBatchSize = options.maxBatchSize ?? 256;
  }

  async embed(texts: readonly string[], signal: AbortSignal) {
    if (texts.length < 1 || texts.length > this.maxBatchSize || texts.some((text) => typeof text !== 'string' || text.length === 0)) {
      throw new Error('embedding input batch is invalid');
    }
    const body = { input: [...texts], model: MODEL, dimensions: DIMENSIONS, encoding_format: 'float' } as const;
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/embeddings`, {
        method: 'POST', headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? new OpenAIEmbeddingError('aborted');
      throw new OpenAIEmbeddingError('http', { cause: error });
    }
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new OpenAIEmbeddingError('http'); }
    const parsed = exactObject(await readCappedJson(response, texts.length === 1 ? 256 * 1024 : 8 * 1024 * 1024), ['object', 'data', 'model', 'usage']);
    if (parsed.object !== 'list' || parsed.model !== MODEL || !Array.isArray(parsed.data)) throw new OpenAIEmbeddingError('invalid-response');
    const usage = exactObject(parsed.usage, ['prompt_tokens', 'total_tokens']);
    if (!Number.isInteger(usage.prompt_tokens) || !Number.isInteger(usage.total_tokens)
      || (usage.prompt_tokens as number) < 0 || usage.total_tokens !== usage.prompt_tokens) throw new OpenAIEmbeddingError('invalid-response');
    const vectors: readonly number[][] = parsed.data.map((entry, expectedIndex) => {
      const item = exactObject(entry, ['object', 'index', 'embedding']);
      if (item.object !== 'embedding' || item.index !== expectedIndex || !Array.isArray(item.embedding)
        || item.embedding.length !== DIMENSIONS || item.embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new OpenAIEmbeddingError('invalid-response');
      }
      return Object.freeze([...item.embedding]) as number[];
    });
    if (vectors.length !== texts.length) throw new OpenAIEmbeddingError('invalid-response');
    return Object.freeze({ vectors: Object.freeze(vectors), usage: Object.freeze({ calls: 1, inputTokens: usage.prompt_tokens as number, outputTokens: 0 }) });
  }
}
