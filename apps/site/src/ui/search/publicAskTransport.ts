import type { PublicAskResponse } from '@beyondwin/contracts';

export interface PublicAnswerReleaseBinding {
  contentReleaseId: string;
  answerReleaseId: string;
}

export interface PublicAskProvider {
  ask(question: string, options: { signal: AbortSignal }): Promise<PublicAskResponse>;
}

export type PublicAskTransportCode = 'timeout' | 'unavailable' | 'invalid-response';

export class PublicAskTransportError extends Error {
  readonly code: PublicAskTransportCode;

  constructor(code: PublicAskTransportCode, cause?: unknown) {
    super(`Public ask transport failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = 'PublicAskTransportError';
    this.code = code;
  }
}
