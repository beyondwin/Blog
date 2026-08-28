import { z } from 'zod';

export const GENERATED_MEDIA_APPROVAL_REGISTRY_PATH = 'packages/content/generated-media-approval-batches.json';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const collection = z.enum(['analysis', 'articles', 'ideas', 'reviews', 'travel', 'thoughts']);
const candidateId = z.string().regex(/^[A-Z][0-9]{2}$/);

const selection = z.object({
  candidateId,
  collection,
  recordId: id,
  mediaId: id,
}).strict();

const batch = z.object({
  batchId: id,
  decisionManifest: z.string().regex(
    /^docs\/notes\/project\/assets\/form-and-thought-generated\/[a-z0-9][a-z0-9-]*\/decision-manifest\.yml$/,
  ),
  decisionManifestChecksum: checksum,
  selections: z.array(selection).min(1),
}).strict().superRefine((value, context) => {
  const expectedPath = `docs/notes/project/assets/form-and-thought-generated/${value.batchId}/decision-manifest.yml`;
  if (value.decisionManifest !== expectedPath) {
    context.addIssue({
      code: 'custom',
      path: ['decisionManifest'],
      message: 'registered decision manifest must match its canonical batch path',
    });
  }
  const candidates = value.selections.map((entry) => entry.candidateId);
  if (new Set(candidates).size !== candidates.length) {
    context.addIssue({ code: 'custom', path: ['selections'], message: 'registered candidate IDs must be unique' });
  }
  const identities = value.selections.map((entry) => `${entry.collection}/${entry.recordId}/${entry.mediaId}`);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: 'custom', path: ['selections'], message: 'registered selected media identities must be unique' });
  }
});

const registrySchema = z.object({
  version: z.literal(1),
  batches: z.array(batch),
}).strict().superRefine((value, context) => {
  const batchIds = value.batches.map((entry) => entry.batchId);
  const paths = value.batches.map((entry) => entry.decisionManifest);
  if (new Set(batchIds).size !== batchIds.length) {
    context.addIssue({ code: 'custom', path: ['batches'], message: 'registered batch IDs must be unique' });
  }
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: 'custom', path: ['batches'], message: 'registered decision manifest paths must be unique' });
  }
});

export function parseGeneratedMediaApprovalRegistry(source, path = GENERATED_MEDIA_APPROVAL_REGISTRY_PATH) {
  let input;
  try {
    input = JSON.parse(source);
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`${path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return parsed.data;
}

export function assertGeneratedMediaRegistrySelections(registered, assets) {
  const actual = new Map(assets.map((asset) => [asset.candidateId, asset]));
  if (actual.size !== registered.selections.length) {
    throw new Error(`required generated approval batch ${registered.batchId}: registered selections do not match the decision manifest`);
  }
  for (const selection of registered.selections) {
    const asset = actual.get(selection.candidateId);
    if (
      !asset
      || asset.collection !== selection.collection
      || asset.recordId !== selection.recordId
      || asset.mediaId !== selection.mediaId
    ) {
      throw new Error(`required generated approval batch ${registered.batchId}: registered selection ${selection.candidateId} does not match the decision manifest`);
    }
  }
}
