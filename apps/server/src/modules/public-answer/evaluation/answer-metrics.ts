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
