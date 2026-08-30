export type PublicAnswerPortErrorKind =
  | 'rate-limit'
  | 'concurrency'
  | 'cost-limit'
  | 'deadline'
  | 'transport'
  | 'invalid-response';

export type PublicAnswerRateLimitBucket =
  | 'network-burst'
  | 'network-hour'
  | 'network-day'
  | 'global-day';

export class PublicAnswerPortError extends Error {
  constructor(
    readonly kind: PublicAnswerPortErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class PublicAnswerRateLimitError extends PublicAnswerPortError {
  constructor(message: string, readonly rateBucket: PublicAnswerRateLimitBucket = 'global-day', options?: ErrorOptions) {
    super('rate-limit', message, options);
  }
}

export class PublicAnswerConcurrencyError extends PublicAnswerPortError {
  constructor(message: string, options?: ErrorOptions) {
    super('concurrency', message, options);
  }
}

export class PublicAnswerCostLimitError extends PublicAnswerPortError {
  constructor(message: string, options?: ErrorOptions) {
    super('cost-limit', message, options);
  }
}

export class PublicAnswerDeadlineError extends PublicAnswerPortError {
  constructor(message: string, options?: ErrorOptions) {
    super('deadline', message, options);
  }
}

export class PublicAnswerTransportError extends PublicAnswerPortError {
  constructor(message: string, options?: ErrorOptions) {
    super('transport', message, options);
  }
}

export class PublicAnswerInvalidResponseError extends PublicAnswerPortError {
  constructor(message: string, options?: ErrorOptions) {
    super('invalid-response', message, options);
  }
}
