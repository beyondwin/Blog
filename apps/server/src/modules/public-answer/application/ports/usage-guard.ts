export interface ProviderTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export const PUBLIC_ANSWER_REQUEST_TIMEOUT_MS = 12_000;

export type ProviderStage = 'embedding' | 'generation' | 'semantic';

export interface GenerationLease {
  release(): void;
}

export interface UsageLease {
  acquireGeneration(signal: AbortSignal): Promise<GenerationLease>;
  beginStage(stage: ProviderStage): void;
  settleStage(stage: ProviderStage, usage: ProviderTokenUsage): void;
  release(): Promise<void>;
}

export interface UsageGuard {
  acquire(input: {
    networkKey: string;
    requestId: string;
    signal: AbortSignal;
  }): Promise<UsageLease>;
}
