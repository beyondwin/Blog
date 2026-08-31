import type {
  PublicAnswerEvidence,
  PublicAskClaim,
  PublicAskResponse,
} from '@beyondwin/contracts';

type PublicAnswerResponse = Extract<PublicAskResponse, { kind: 'answer' }>;

export interface AnswerViewModel {
  source: 'provider';
  answerReleaseId: string;
  claims: readonly { id: string; text: string; evidenceIds: readonly string[] }[];
  evidence: readonly PublicAnswerEvidence[];
  evidenceById: ReadonlyMap<string, PublicAnswerEvidence>;
}

function copyClaim(claim: PublicAskClaim): AnswerViewModel['claims'][number] {
  return { id: claim.id, text: claim.text, evidenceIds: [...claim.evidenceIds] };
}

export function createAnswerViewModel(answer: PublicAnswerResponse): AnswerViewModel {
  const evidence = [...answer.evidence];
  const evidenceById = new Map<string, PublicAnswerEvidence>();
  for (const item of evidence) {
    if (evidenceById.has(item.evidenceId)) throw new Error('evidence IDs must be unique');
    evidenceById.set(item.evidenceId, item);
  }

  const referenced = new Set<string>();
  for (const claim of answer.claims) {
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceById.has(evidenceId)) throw new Error('claim evidence must resolve');
      referenced.add(evidenceId);
    }
  }
  for (const item of evidence) {
    if (!referenced.has(item.evidenceId)) throw new Error('response evidence must be referenced');
  }

  return {
    source: 'provider',
    answerReleaseId: answer.answerReleaseId,
    claims: answer.claims.map(copyClaim),
    evidence,
    evidenceById,
  };
}
