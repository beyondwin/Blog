import type { AnswerReleaseCatalogSnapshot } from '../../domain/public-answer.js';

export type { AnswerReleaseCatalogSnapshot } from '../../domain/public-answer.js';

export interface AnswerReleaseCatalogSource {
  snapshot(signal: AbortSignal): Promise<AnswerReleaseCatalogSnapshot>;
}
