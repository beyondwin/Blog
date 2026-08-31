import { retrievalMetrics } from './retrieval-metrics.js';

export interface SentenceMetricUnit { readonly characters: number; readonly supported: boolean; readonly critical: boolean }

export function answerMetrics(input: Readonly<{
  citedEvidenceIds: readonly string[];
  catalogEvidenceIds: ReadonlySet<string>;
  sentenceUnits: readonly SentenceMetricUnit[];
  deterministicPass: boolean;
  semanticPass: boolean;
}>): Readonly<{
  citationCorrectness: number | null;
  sentenceCitationCoverage: number | null;
  criticalCoverage: number | null;
  grounded: boolean;
}> {
  const citationCorrectness = input.citedEvidenceIds.length === 0 ? null
    : input.citedEvidenceIds.filter((id) => input.catalogEvidenceIds.has(id)).length / input.citedEvidenceIds.length;
  const total = input.sentenceUnits.reduce((sum, unit) => sum + unit.characters, 0);
  const supported = input.sentenceUnits.reduce((sum, unit) => sum + (unit.supported ? unit.characters : 0), 0);
  const critical = input.sentenceUnits.filter((unit) => unit.critical);
  const criticalTotal = critical.reduce((sum, unit) => sum + unit.characters, 0);
  const criticalSupported = critical.reduce((sum, unit) => sum + (unit.supported ? unit.characters : 0), 0);
  return Object.freeze({
    citationCorrectness,
    sentenceCitationCoverage: total === 0 ? null : supported / total,
    criticalCoverage: criticalTotal === 0 ? null : criticalSupported / criticalTotal,
    grounded: input.deterministicPass && input.semanticPass && total > 0 && supported === total && criticalSupported === criticalTotal,
  });
}

export function evaluateCapturedCaseMetrics(input: Readonly<{
  requiredRecordIds: readonly string[];
  fusedRecordIds: readonly string[];
  citedEvidenceIds: readonly string[];
  catalogEvidenceIds: ReadonlySet<string>;
  sentenceUnits: readonly { readonly id: string; readonly characters: number; readonly critical: boolean }[];
  supportedSentenceIds: ReadonlySet<string>;
  deterministicPass: boolean;
  contradictedSentenceIds: readonly string[];
}>): Readonly<{
  retrieval: ReturnType<typeof retrievalMetrics>;
  citedEvidenceCount: number;
  correctCitationCount: number;
  sentenceCharacters: number;
  supportedSentenceCharacters: number;
  criticalCharacters: number;
  supportedCriticalCharacters: number;
  grounded: boolean;
}> {
  const sentenceUnits = input.sentenceUnits.map((unit) => ({
    characters: unit.characters,
    supported: input.supportedSentenceIds.has(unit.id),
    critical: unit.critical,
  }));
  const answer = answerMetrics({
    citedEvidenceIds: input.citedEvidenceIds,
    catalogEvidenceIds: input.catalogEvidenceIds,
    sentenceUnits,
    deterministicPass: input.deterministicPass,
    semanticPass: input.contradictedSentenceIds.length === 0,
  });
  return Object.freeze({
    retrieval: retrievalMetrics(input.requiredRecordIds, input.fusedRecordIds),
    citedEvidenceCount: input.citedEvidenceIds.length,
    correctCitationCount: input.citedEvidenceIds.filter((id) => input.catalogEvidenceIds.has(id)).length,
    sentenceCharacters: sentenceUnits.reduce((sum, unit) => sum + unit.characters, 0),
    supportedSentenceCharacters: sentenceUnits.reduce((sum, unit) => sum + (unit.supported ? unit.characters : 0),
      0),
    criticalCharacters: sentenceUnits.reduce((sum, unit) => sum + (unit.critical ? unit.characters : 0), 0),
    supportedCriticalCharacters: sentenceUnits.reduce((sum, unit) => sum
      + (unit.critical && unit.supported ? unit.characters : 0), 0),
    grounded: answer.grounded,
  });
}

const integrityReasons = new Set([
  'response-evidence-set', 'catalog-evidence-set', 'catalog-evidence-mismatch',
  'answer-release-mismatch', 'excerpt-integrity', 'canonical-locator',
]);

export function classifyDeterministicFailure(reason: string): 'integrity' | 'invalid-fallback' {
  return integrityReasons.has(reason) ? 'integrity' : 'invalid-fallback';
}

export function deriveBoundaryIdentifiers(
  contentRecordIds: readonly string[],
  approvedRecordIds: ReadonlySet<string>,
  tombstones: ReadonlySet<string>,
  evidenceRecordIds: ReadonlyMap<string, string>,
): Readonly<{ recordIds: ReadonlySet<string>; evidenceIds: ReadonlySet<string> }> {
  const recordIds = new Set(contentRecordIds.filter((recordId) => !approvedRecordIds.has(recordId)));
  const evidenceIds = new Set<string>();
  for (const tombstone of tombstones) {
    if (tombstone.startsWith('record:')) recordIds.add(tombstone.slice('record:'.length));
    else if (tombstone.startsWith('evidence:')) {
      const evidenceId = tombstone.slice('evidence:'.length);
      evidenceIds.add(evidenceId);
      const recordId = evidenceRecordIds.get(evidenceId);
      if (recordId) recordIds.add(recordId);
    }
  }
  return Object.freeze({
    recordIds: new Set([...recordIds].sort()),
    evidenceIds: new Set([...evidenceIds].sort()),
  });
}

export function countBoundaryLeaks(input: Readonly<{
  outputRecordIds: readonly string[];
  outputEvidenceIds: readonly string[];
  outputText?: string;
  redactedTelemetry: readonly unknown[];
  boundaryRecordIds: ReadonlySet<string>;
  boundaryEvidenceIds: ReadonlySet<string>;
}>): number {
  const outputRecords = new Set(input.outputRecordIds);
  const outputEvidence = new Set(input.outputEvidenceIds);
  const outputText = input.outputText ?? '';
  const telemetry = JSON.stringify(input.redactedTelemetry);
  return [...input.boundaryRecordIds].filter((recordId) => outputRecords.has(recordId)
    || outputText.includes(recordId) || telemetry.includes(recordId)).length
    + [...input.boundaryEvidenceIds].filter((evidenceId) => outputEvidence.has(evidenceId)
      || outputText.includes(evidenceId) || telemetry.includes(evidenceId)).length;
}
