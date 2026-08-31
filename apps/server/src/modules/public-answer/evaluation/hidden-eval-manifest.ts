import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { providerChecksum } from '../infrastructure/openai/provider-json.js';

const checksumPattern = /^sha256:[a-f0-9]{64}$/u;
const recordIdPattern = /^(?:articles|reviews|thoughts)\/[a-z0-9][a-z0-9-]*$/u;
const exactInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const topKeys = ['schemaVersion', 'split', 'custodianRole', 'frozenAt', 'corpusApprovalHash', 'retrievalPolicyHash', 'cases'] as const;
const caseRequiredKeys = ['id', 'category', 'question', 'expectedMode', 'requiredEvidence', 'allowedEvidence', 'forbiddenRecordIds'] as const;
const evidenceKeys = ['recordId'] as const;
const categoryCounts = Object.freeze({ answerable: 30, unanswerable: 12, adversarial: 12, robustness: 6 });

export type HiddenEvalCategory = keyof typeof categoryCounts;
export interface HiddenEvalCase {
  readonly id: string;
  readonly category: HiddenEvalCategory;
  readonly question: string;
  readonly expectedMode: 'answer' | 'search';
  readonly requiredEvidence: readonly { readonly recordId: string }[];
  readonly allowedEvidence: readonly { readonly recordId: string }[];
  readonly forbiddenRecordIds: readonly string[];
  readonly robustnessGroup?: string;
}
export interface HiddenEvalManifest {
  readonly schemaVersion: 1;
  readonly split: 'hidden-runtime' | 'test-only-hidden-shape';
  readonly custodianRole: 'site-owner';
  readonly frozenAt: string;
  readonly corpusApprovalHash: string;
  readonly retrievalPolicyHash: string;
  readonly cases: readonly HiddenEvalCase[];
  readonly manifestHash: string;
}
export interface HiddenManifestOptions {
  readonly approvedRecordIds: ReadonlySet<string>;
  readonly publicDevelopmentQuestions: ReadonlySet<string>;
  readonly corpusApprovalHash: string;
  readonly retrievalPolicyHash: string;
}

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has missing or unknown fields`);
  }
  return value as Record<string, unknown>;
}

function recordList(value: unknown, label: string): readonly { recordId: string }[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const entries = value.map((item) => {
    const record = exactObject(item, evidenceKeys, label);
    if (typeof record.recordId !== 'string' || !recordIdPattern.test(record.recordId)) {
      throw new Error(`${label} contains an invalid public record ID`);
    }
    return Object.freeze({ recordId: record.recordId });
  });
  if (new Set(entries.map(({ recordId }) => recordId)).size !== entries.length) throw new Error(`${label} contains duplicate record IDs`);
  return Object.freeze(entries);
}

function parseCase(value: unknown, split: HiddenEvalManifest['split'], options: HiddenManifestOptions): HiddenEvalCase {
  const raw = value as Record<string, unknown>;
  const keys = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'robustnessGroup')
    ? [...caseRequiredKeys, 'robustnessGroup'] : caseRequiredKeys;
  const item = exactObject(value, keys, 'hidden evaluation case');
  const idPattern = split === 'hidden-runtime' ? /^hidden-[a-z0-9][a-z0-9-]*$/u : /^test-hidden-[a-z0-9][a-z0-9-]*$/u;
  if (typeof item.id !== 'string' || !idPattern.test(item.id)) throw new Error('hidden evaluation case ID does not match its split');
  if (typeof item.category !== 'string' || !(item.category in categoryCounts)) throw new Error('hidden evaluation category is invalid');
  const category = item.category as HiddenEvalCategory;
  if (typeof item.question !== 'string' || item.question.trim() !== item.question || item.question.length === 0
    || [...item.question].length > 500 || options.publicDevelopmentQuestions.has(item.question)) {
    throw new Error('hidden question is invalid or duplicates a public-development question');
  }
  const expectedMode = item.expectedMode;
  if (expectedMode !== 'answer' && expectedMode !== 'search') throw new Error('hidden expected mode is invalid');
  if ((category === 'answerable' || category === 'robustness') !== (expectedMode === 'answer')) {
    throw new Error('hidden category and expected mode disagree');
  }
  const requiredEvidence = recordList(item.requiredEvidence, 'required evidence');
  const allowedEvidence = recordList(item.allowedEvidence, 'allowed evidence');
  const allowed = new Set(allowedEvidence.map(({ recordId }) => recordId));
  if (requiredEvidence.some(({ recordId }) => !allowed.has(recordId))) throw new Error('required evidence must be included in allowed evidence');
  if ([...allowed].some((recordId) => !options.approvedRecordIds.has(recordId))) {
    throw new Error('hidden allowed evidence is absent from expanded approval');
  }
  if (!Array.isArray(item.forbiddenRecordIds) || item.forbiddenRecordIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('hidden forbidden record IDs are invalid');
  }
  const forbiddenRecordIds = item.forbiddenRecordIds as string[];
  if (new Set(forbiddenRecordIds).size !== forbiddenRecordIds.length) throw new Error('hidden forbidden record IDs contain duplicates');
  if (forbiddenRecordIds.some((recordId) => allowed.has(recordId))) throw new Error('hidden allowed and forbidden record IDs overlap');
  if (category === 'robustness') {
    if (typeof item.robustnessGroup !== 'string' || item.robustnessGroup.length === 0) throw new Error('robustness case requires a group');
  } else if (Object.prototype.hasOwnProperty.call(item, 'robustnessGroup')) {
    throw new Error('robustness group is valid only for robustness cases');
  }
  return Object.freeze({
    id: item.id,
    category,
    question: item.question,
    expectedMode,
    requiredEvidence,
    allowedEvidence,
    forbiddenRecordIds: Object.freeze([...forbiddenRecordIds]),
    ...(category === 'robustness' ? { robustnessGroup: item.robustnessGroup as string } : {}),
  });
}

export function parseHiddenEvalManifest(input: unknown, options: HiddenManifestOptions): Readonly<HiddenEvalManifest> {
  const raw = exactObject(input, topKeys, 'hidden evaluation manifest');
  if (raw.schemaVersion !== 1 || (raw.split !== 'hidden-runtime' && raw.split !== 'test-only-hidden-shape')
    || raw.custodianRole !== 'site-owner') throw new Error('hidden evaluation manifest identity is invalid');
  if (typeof raw.frozenAt !== 'string' || !exactInstantPattern.test(raw.frozenAt) || Number.isNaN(Date.parse(raw.frozenAt))) {
    throw new Error('hidden frozenAt must be an exact ISO UTC instant');
  }
  if (raw.corpusApprovalHash !== options.corpusApprovalHash || typeof raw.corpusApprovalHash !== 'string'
    || !checksumPattern.test(raw.corpusApprovalHash)) throw new Error('hidden corpus approval hash drift');
  if (raw.retrievalPolicyHash !== options.retrievalPolicyHash || typeof raw.retrievalPolicyHash !== 'string'
    || !checksumPattern.test(raw.retrievalPolicyHash)) throw new Error('hidden retrieval policy hash drift');
  if (!Array.isArray(raw.cases) || raw.cases.length !== 60) throw new Error('hidden evaluation manifest must contain exactly 60 cases');
  const cases = raw.cases.map((item) => parseCase(item, raw.split as HiddenEvalManifest['split'], options));
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error('hidden evaluation case IDs must be unique');
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (cases.filter((item) => item.category === category).length !== count) throw new Error('hidden evaluation category counts must equal 30/12/12/6');
  }
  const canonical = {
    schemaVersion: 1 as const,
    split: raw.split as HiddenEvalManifest['split'],
    custodianRole: 'site-owner' as const,
    frozenAt: raw.frozenAt,
    corpusApprovalHash: raw.corpusApprovalHash,
    retrievalPolicyHash: raw.retrievalPolicyHash,
    cases,
  };
  return Object.freeze({ ...canonical, manifestHash: providerChecksum(canonical) });
}

export function assertRealHiddenEvaluationAuthority(manifest: HiddenEvalManifest): HiddenEvalManifest {
  if (manifest.split !== 'hidden-runtime' || manifest.cases.some((item) => !item.id.startsWith('hidden-'))) {
    throw new Error('test-only or synthetic hidden manifests are not evaluation evidence');
  }
  return manifest;
}

export async function readHiddenEvalManifest(path: string, options: HiddenManifestOptions): Promise<Readonly<HiddenEvalManifest>> {
  if (!isAbsolute(path)) throw new Error('hidden evaluation manifest path must be absolute');
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error('hidden evaluation manifest must not be a symbolic link');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || state.size > 512 * 1024
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error('hidden evaluation manifest must be one owned regular file');
    }
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) {
      throw new Error('hidden evaluation manifest changed while reading');
    }
    return parseHiddenEvalManifest(JSON.parse(bytes.toString('utf8')), options);
  } finally {
    await handle.close();
  }
}
