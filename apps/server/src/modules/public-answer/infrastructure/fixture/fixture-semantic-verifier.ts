import type { SemanticAnswerVerifier } from '../../application/ports/answer-verifier.js';

export class FixtureSemanticVerifier implements SemanticAnswerVerifier {
  async verify(input: Parameters<SemanticAnswerVerifier['verify']>[0]) {
    return Object.freeze({
      supportedSentenceIds: Object.freeze(input.sentenceUnits.map((unit) => unit.id)),
      contradictedSentenceIds: Object.freeze([]),
      usage: Object.freeze({ inputTokens: 0, outputTokens: 0 }),
    });
  }
}
