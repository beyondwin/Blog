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

function exactStressClaim(index: number): string {
  const unit = `${index + 1}번째 검증된 공개 기록에 기반한 답변 `;
  return [...unit.repeat(Math.ceil(600 / [...unit].length))].slice(0, 600).join('');
}

/** Test-only boundary driver. Composition restricts this generator to fixture mode and the stress-max CLI scenario. */
export class StressFixtureAnswerGenerator implements AnswerGenerator {
  async generate(input: Parameters<AnswerGenerator['generate']>[0]) {
    if (input.evidence.length < 6) {
      throw new PublicAnswerInvalidResponseError('stress fixture requires six authorized evidence items');
    }
    const sources = input.evidence.slice(0, 6);
    const claims = sources.slice(0, 5).map((source, index) => Object.freeze({
      claimId: `claim-${index + 1}`,
      text: exactStressClaim(index),
      evidenceIds: Object.freeze(index === 0
        ? [source.evidenceId, sources[5]!.evidenceId]
        : [source.evidenceId]),
    }));
    return Object.freeze({
      claims: Object.freeze(claims),
      usage: Object.freeze({ inputTokens: 0, outputTokens: 0 }),
    });
  }
}
