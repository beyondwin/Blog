import { providerChecksum } from '../infrastructure/openai/provider-json.js';

interface PublicEvalCase {
  readonly id: string;
  readonly question: string;
  readonly expectedMode: 'answer';
  readonly expectedEvidence: readonly { readonly recordId: string }[];
  readonly forbiddenRecordIds: readonly string[];
}
interface PublicAnswerEvalManifest { readonly schemaVersion: 1; readonly split: 'public-development'; readonly cases: readonly PublicEvalCase[] }
interface PublicAnswerCorpusApproval {
  readonly schemaVersion: 1;
  readonly entries: readonly { readonly recordId: string; readonly recordChecksum: string }[];
}
const recordPattern = /^(?:articles|reviews|thoughts)\/[a-z0-9][a-z0-9-]*$/u;
const checksumPattern = /^sha256:[a-f0-9]{64}$/u;

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} has unknown fields`);
  return record;
}

function parseManifest(input: unknown): PublicAnswerEvalManifest {
  const value = exact(input, ['schemaVersion', 'split', 'cases'], 'public evaluation manifest');
  if (value.schemaVersion !== 1 || value.split !== 'public-development' || !Array.isArray(value.cases) || value.cases.length !== 20) {
    throw new Error('public evaluation manifest identity or count is invalid');
  }
  const cases = value.cases.map((raw) => {
    const item = exact(raw, ['id', 'question', 'expectedMode', 'expectedEvidence', 'forbiddenRecordIds'], 'public evaluation case');
    if (typeof item.id !== 'string' || !/^dev-[0-9]{2}-[a-z0-9-]+$/u.test(item.id)
      || typeof item.question !== 'string' || item.question.trim().length === 0 || item.expectedMode !== 'answer'
      || !Array.isArray(item.expectedEvidence) || item.expectedEvidence.length === 0 || !Array.isArray(item.forbiddenRecordIds)) {
      throw new Error('public evaluation case is invalid');
    }
    const expectedEvidence = item.expectedEvidence.map((rawEvidence) => {
      const evidence = exact(rawEvidence, ['recordId'], 'public expected evidence');
      if (typeof evidence.recordId !== 'string' || !recordPattern.test(evidence.recordId)) throw new Error('public expected record ID is invalid');
      return Object.freeze({ recordId: evidence.recordId });
    });
    if (item.forbiddenRecordIds.some((id) => typeof id !== 'string' || !recordPattern.test(id))) throw new Error('public forbidden record ID is invalid');
    return Object.freeze({
      id: item.id,
      question: item.question,
      expectedMode: 'answer' as const,
      expectedEvidence: Object.freeze(expectedEvidence),
      forbiddenRecordIds: Object.freeze([...(item.forbiddenRecordIds as string[])]),
    });
  });
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error('public evaluation case IDs must be unique');
  return Object.freeze({ schemaVersion: 1, split: 'public-development', cases: Object.freeze(cases) });
}

function parseApproval(input: unknown): PublicAnswerCorpusApproval {
  const value = exact(input, ['schemaVersion', 'entries'], 'public corpus approval');
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 1000) throw new Error('public corpus approval is invalid');
  const entries = value.entries.map((raw) => {
    const entry = exact(raw, ['recordId', 'recordChecksum'], 'public corpus approval entry');
    if (typeof entry.recordId !== 'string' || !recordPattern.test(entry.recordId)
      || typeof entry.recordChecksum !== 'string' || !checksumPattern.test(entry.recordChecksum)) throw new Error('public corpus approval entry is invalid');
    return Object.freeze({ recordId: entry.recordId, recordChecksum: entry.recordChecksum });
  });
  if (new Set(entries.map(({ recordId }) => recordId)).size !== entries.length) throw new Error('public corpus approval IDs must be unique');
  for (let index = 1; index < entries.length; index += 1) if (entries[index - 1]!.recordId > entries[index]!.recordId) throw new Error('public corpus approval IDs must be sorted');
  return Object.freeze({ schemaVersion: 1, entries: Object.freeze(entries) });
}

export interface PublicEvaluationClassification {
  readonly runnable: PublicAnswerEvalManifest['cases'];
  readonly deferred: readonly (PublicAnswerEvalManifest['cases'][number] & {
    readonly reason: 'deferred-unapproved-record';
  })[];
  readonly runnableCount: number;
  readonly deferredCount: number;
  readonly corpusMetricStatus: 'not_measured';
  readonly corpusApprovalHash: string;
}

export function classifyPublicEvaluation(
  manifestInput: unknown,
  approvalInput: PublicAnswerCorpusApproval | unknown,
  expectedCorpusApprovalHash: string,
): Readonly<PublicEvaluationClassification> {
  const manifest = parseManifest(manifestInput);
  const approval = parseApproval(approvalInput);
  const corpusApprovalHash = providerChecksum(approval);
  if (corpusApprovalHash !== expectedCorpusApprovalHash) {
    throw new Error('public evaluation approval checksum drift');
  }
  const approved = new Set(approval.entries.map((entry) => entry.recordId));
  const runnable: PublicEvalCase[] = [];
  const deferred: Array<PublicEvalCase & { reason: 'deferred-unapproved-record' }> = [];
  for (const item of manifest.cases) {
    if (item.expectedEvidence.every(({ recordId }) => approved.has(recordId))) runnable.push(item);
    else deferred.push({ ...item, reason: 'deferred-unapproved-record' });
  }
  return Object.freeze({
    runnable: Object.freeze(runnable),
    deferred: Object.freeze(deferred),
    runnableCount: runnable.length,
    deferredCount: deferred.length,
    corpusMetricStatus: 'not_measured',
    corpusApprovalHash,
  });
}
