import type { AnswerViewModel } from './answerViewModel';

export interface LivingEvidenceDeskProps {
  phase: 'idle' | 'retrieving' | 'connecting' | 'composing' | 'answered';
  answer: AnswerViewModel | null;
  interactive: boolean;
  onOpenEvidence(evidenceId: string, trigger: HTMLElement): void;
}

function displayedEvidence(answer: AnswerViewModel | null) {
  if (!answer) return [];
  const seen = new Set<string>();
  return answer.claims.flatMap((claim) => claim.evidenceIds).flatMap((evidenceId) => {
    if (seen.has(evidenceId)) return [];
    seen.add(evidenceId);
    const evidence = answer.evidenceById.get(evidenceId);
    if (!evidence) throw new Error('claim evidence must resolve');
    return [evidence];
  }).slice(0, 3);
}

export function LivingEvidenceDesk({
  answer,
  interactive,
  onOpenEvidence,
  phase,
}: LivingEvidenceDeskProps) {
  const evidenceItems = displayedEvidence(answer);
  const hasVerifiedEvidence = evidenceItems.length > 0;

  return (
    <div className="living-evidence-desk" data-phase={phase}>
      {hasVerifiedEvidence ? (
        <>
          <span className="living-evidence-desk__decoration" aria-hidden="true" />
          <svg
            className="living-evidence-desk__threads"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {evidenceItems.map((evidence, index) => (
              <path
                key={evidence.evidenceId}
                data-evidence-id={evidence.evidenceId}
                d={`M 50 54 C ${22 + (index * 26)} 48, ${18 + (index * 31)} ${28 + (index * 25)}, ${16 + (index * 34)} ${16 + (index * 31)}`}
              />
            ))}
          </svg>
          <div className="living-evidence-desk__cards">
            {evidenceItems.map((evidence) => (
              <button
                key={evidence.evidenceId}
                className="living-evidence-desk__card"
                type="button"
                data-evidence-id={evidence.evidenceId}
                aria-label={`${evidence.recordTitle} · ${evidence.locator.label} 근거 보기`}
                disabled={!interactive}
                onClick={(event) => onOpenEvidence(evidence.evidenceId, event.currentTarget)}
              >
                <strong>{evidence.recordTitle}</strong>
                <span>{evidence.locator.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="living-evidence-desk__papers" aria-hidden="true">
          <span className="living-evidence-desk__paper" aria-hidden="true" />
          <span className="living-evidence-desk__paper" aria-hidden="true" />
          <span className="living-evidence-desk__paper" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
