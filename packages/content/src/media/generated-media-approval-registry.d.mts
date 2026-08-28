export const GENERATED_MEDIA_APPROVAL_REGISTRY_PATH: 'packages/content/generated-media-approval-batches.json';

export interface GeneratedMediaApprovalRegistrySelection {
  candidateId: string;
  collection: 'analysis' | 'articles' | 'ideas' | 'reviews' | 'travel' | 'thoughts';
  recordId: string;
  mediaId: string;
}

export interface GeneratedMediaApprovalRegistryBatch {
  batchId: string;
  decisionManifest: string;
  decisionManifestChecksum: string;
  selections: GeneratedMediaApprovalRegistrySelection[];
}

export interface GeneratedMediaApprovalRegistry {
  version: 1;
  batches: GeneratedMediaApprovalRegistryBatch[];
}

export function parseGeneratedMediaApprovalRegistry(
  source: string,
  path?: string,
): GeneratedMediaApprovalRegistry;

export function assertGeneratedMediaRegistrySelections(
  registered: GeneratedMediaApprovalRegistryBatch,
  assets: GeneratedMediaApprovalRegistrySelection[],
): void;
