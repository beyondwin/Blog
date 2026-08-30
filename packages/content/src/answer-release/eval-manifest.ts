import { z } from 'zod';
import type { PublicAnswerChunk } from '@beyondwin/contracts';

const answerRecordIdSchema = z.string().regex(
  /^(?:articles|reviews|thoughts)\/[a-z0-9][a-z0-9-]*$/u,
);

const expectedEvidenceSchema = z.object({ recordId: answerRecordIdSchema }).strict();

const publicAnswerEvalCaseSchema = z.object({
  id: z.string().regex(/^dev-[0-9]{2}-[a-z0-9-]+$/u),
  question: z.string().trim().min(1).refine((value) => Array.from(value).length <= 500),
  expectedMode: z.literal('answer'),
  expectedEvidence: z.array(expectedEvidenceSchema).min(1).max(6),
  forbiddenRecordIds: z.array(answerRecordIdSchema).default([]),
}).strict().superRefine((item, context) => {
  const expected = new Set(item.expectedEvidence.map((evidence) => evidence.recordId));
  for (const [index, recordId] of item.forbiddenRecordIds.entries()) {
    if (expected.has(recordId)) {
      context.addIssue({
        code: 'custom',
        path: ['forbiddenRecordIds', index],
        message: 'forbidden record IDs must not overlap expected evidence',
      });
    }
  }
});

export const publicAnswerEvalManifestSchema = z.object({
  schemaVersion: z.literal(1),
  split: z.literal('public-development'),
  cases: z.array(publicAnswerEvalCaseSchema).length(20),
}).strict().superRefine((manifest, context) => {
  const ids = new Set<string>();
  for (const [index, item] of manifest.cases.entries()) {
    if (ids.has(item.id)) {
      context.addIssue({ code: 'custom', path: ['cases', index, 'id'], message: 'case IDs must be unique' });
    }
    ids.add(item.id);
  }
});

export type PublicAnswerEvalManifest = z.infer<typeof publicAnswerEvalManifestSchema>;

export function parsePublicAnswerEvalManifest(input: unknown): PublicAnswerEvalManifest {
  return publicAnswerEvalManifestSchema.parse(input);
}

export function validatePublicAnswerEvalManifest(
  manifest: PublicAnswerEvalManifest,
  chunks: readonly PublicAnswerChunk[],
): {
  runnable: PublicAnswerEvalManifest['cases'];
  deferred: Array<PublicAnswerEvalManifest['cases'][number] & { reason: 'deferred-unapproved-record' }>;
  corpusMetricStatus: 'not_measured';
} {
  const materializedRecordIds = new Set(chunks.map((chunk) => chunk.recordId));
  const runnable: PublicAnswerEvalManifest['cases'] = [];
  const deferred: Array<PublicAnswerEvalManifest['cases'][number] & { reason: 'deferred-unapproved-record' }> = [];

  for (const item of manifest.cases) {
    if (item.expectedEvidence.every((evidence) => materializedRecordIds.has(evidence.recordId))) {
      runnable.push(item);
    } else {
      deferred.push({ ...item, reason: 'deferred-unapproved-record' });
    }
  }

  return { runnable, deferred, corpusMetricStatus: 'not_measured' };
}
