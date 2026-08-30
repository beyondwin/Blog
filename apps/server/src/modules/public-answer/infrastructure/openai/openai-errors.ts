export class OpenAIEmbeddingError extends Error {
  constructor(readonly code: 'aborted' | 'http' | 'body-too-large' | 'invalid-json' | 'invalid-response', options?: ErrorOptions) {
    super(`OpenAI embedding request failed: ${code}`, options); this.name = 'OpenAIEmbeddingError';
  }
}
