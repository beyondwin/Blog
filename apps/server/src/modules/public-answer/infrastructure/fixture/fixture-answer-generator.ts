import type { AnswerGenerator } from '../../application/ports/answer-generator.js';
import { PublicAnswerInvalidResponseError } from '../../domain/public-answer-errors.js';

function firstPlainSentence(value: string): string {
  const normalized = value.replace(/\r\n?/gu, '\n').trim();
  const boundary = [...normalized].findIndex((character) => '.!?。\n'.includes(character));
  const selected = boundary < 0 ? normalized : [...normalized].slice(0, boundary + 1).join('');
  if (!selected || /<\/?[a-z!][^>]*>|!?\[[^\]]*\]\([^)]*\)|https?:\/\//iu.test(selected)
    || [...selected].some((character) => character !== '\n' && /[\p{Cc}\p{Cf}]/u.test(character))) {
    throw new PublicAnswerInvalidResponseError('fixture evidence cannot form a safe claim');
  }
  return [...selected].slice(0, 600).join('');
}

export class FixtureAnswerGenerator implements AnswerGenerator {
  async generate(input: Parameters<AnswerGenerator['generate']>[0]) {
    const source = input.evidence[0];
    if (!source) throw new PublicAnswerInvalidResponseError('fixture generation requires authorized evidence');
    const claim = Object.freeze({
      claimId: 'claim-1',
      text: firstPlainSentence(source.excerpt),
      evidenceIds: Object.freeze([source.evidenceId]),
    });
    return Object.freeze({
      claims: Object.freeze([claim]),
      usage: Object.freeze({ inputTokens: 0, outputTokens: 0 }),
    });
  }
}
