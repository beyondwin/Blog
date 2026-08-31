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

export function deriveBoundaryRecordIds(
  contentRecordIds: readonly string[],
  approvedRecordIds: ReadonlySet<string>,
  tombstonedRecordIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([
    ...contentRecordIds.filter((recordId) => !approvedRecordIds.has(recordId)),
    ...tombstonedRecordIds,
  ].sort());
}

export function countBoundaryLeaks(input: Readonly<{
  outputRecordIds: readonly string[];
  redactedTelemetry: readonly unknown[];
  boundaryRecordIds: ReadonlySet<string>;
}>): number {
  const output = new Set(input.outputRecordIds);
  const telemetry = JSON.stringify(input.redactedTelemetry);
  return [...input.boundaryRecordIds].filter((recordId) => output.has(recordId) || telemetry.includes(recordId)).length;
}
