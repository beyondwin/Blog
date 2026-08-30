import { createHash } from 'node:crypto';

import type { DeterministicAnswerVerifier, SupportedSentenceUnit } from '../../application/ports/answer-verifier.js';
import type { AuthorizedEvidence, GeneratedClaim } from '../../domain/public-answer.js';

const EVIDENCE_ID = /^[a-f0-9]{64}$/u;
const UNSAFE_MARKUP = /<\/?[a-z!][^>]*>|!?\[[^\]]*\]\([^)]*\)|https?:\/\//iu;
const INSTRUCTION_METADATA = /(?:^|[^\p{L}\p{N}_])(?:recordId|chunkId|recordTitle|collectionLabel|canonicalPath|locator|checksum|releaseId|bindingId|approval(?:Hash)?|receipt(?:Hash)?|system|developer|assistant)\s*:/iu;

function fail(reason: string): ReturnType<DeterministicAnswerVerifier['verify']> {
  return Object.freeze({ ok: false, reason });
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function sameLocator(left: AuthorizedEvidence['locator'], right: AuthorizedEvidence['locator']): boolean {
  return left.kind === right.kind && left.label === right.label && left.ordinal === right.ordinal;
}

function sameEvidence(left: AuthorizedEvidence, right: AuthorizedEvidence): boolean {
  return left.evidenceId === right.evidenceId
    && left.chunkId === right.chunkId
    && left.answerReleaseId === right.answerReleaseId
    && left.recordId === right.recordId
    && left.collectionLabel === right.collectionLabel
    && left.recordTitle === right.recordTitle
    && left.canonicalPath === right.canonicalPath
    && sameLocator(left.locator, right.locator)
    && left.excerpt === right.excerpt
    && left.excerptChecksum === right.excerptChecksum;
}

function directCanonicalPath(value: string): boolean {
  return /^\/(?:[a-z0-9][a-z0-9-]*\/)+$/u.test(value)
    && !value.includes('//') && !value.includes('/./') && !value.includes('/../')
    && !value.includes('?') && !value.includes('#');
}

function splitSentences(text: string, claimId: string, evidenceIds: readonly string[]): readonly SupportedSentenceUnit[] {
  const result: SupportedSentenceUnit[] = [];
  let current = '';
  const flush = () => {
    const value = current.trim();
    current = '';
    if (value.length === 0) return;
    result.push(Object.freeze({
      id: `${claimId}-sentence-${result.length + 1}`,
      claimId,
      text: value,
      evidenceIds: Object.freeze([...evidenceIds]),
      critical: true,
    }));
  };
  for (const character of text) {
    if (character === '\r') continue;
    if (character === '\n') { flush(); continue; }
    current += character;
    if (character === '.' || character === '!' || character === '?' || character === '。') flush();
  }
  flush();
  return Object.freeze(result);
}

function quoteBodies(text: string): readonly string[] {
  const bodies: string[] = [];
  const patterns = [/“([^”]+)”/gu, /‘([^’]+)’/gu, /"([^"\n]+)"/gu, /'([^'\n]+)'/gu];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) if (match[1]) bodies.push(match[1]);
  }
  return bodies;
}

function normalizedNewlines(value: string): string {
  return value.replace(/\r\n?/gu, '\n');
}

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => character !== '\n'
    && (/[\p{Cc}\p{Cf}]/u.test(character)));
}

function validateClaim(claim: GeneratedClaim, index: number): string | undefined {
  if (claim.claimId !== `claim-${index + 1}`) return 'claim-id';
  if (typeof claim.text !== 'string' || [...claim.text].length < 1 || [...claim.text].length > 600) return 'claim-text';
  if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length < 1 || claim.evidenceIds.length > 6
    || claim.evidenceIds.some((id) => typeof id !== 'string' || !EVIDENCE_ID.test(id))
    || new Set(claim.evidenceIds).size !== claim.evidenceIds.length) return 'claim-citations';
  if (UNSAFE_MARKUP.test(claim.text) || INSTRUCTION_METADATA.test(claim.text) || hasUnsafeControl(claim.text)) return 'unsafe-claim';
  return undefined;
}

export class CitationVerifier implements DeterministicAnswerVerifier {
  verify(input: Parameters<DeterministicAnswerVerifier['verify']>[0]): ReturnType<DeterministicAnswerVerifier['verify']> {
    if (input.claims.length < 1 || input.claims.length > 5) return fail('claim-count');
    for (let index = 0; index < input.claims.length; index += 1) {
      const reason = validateClaim(input.claims[index]!, index);
      if (reason) return fail(reason);
    }

    const citedIds = [...new Set(input.claims.flatMap((claim) => [...claim.evidenceIds]))];
    if (citedIds.length < 1 || citedIds.length > 6) return fail('evidence-count');
    if (input.evidence.length !== citedIds.length || new Set(input.evidence.map((item) => item.evidenceId)).size !== input.evidence.length) {
      return fail('response-evidence-set');
    }
    const canonical = input.catalog.evidenceFor(citedIds);
    if (canonical.length !== citedIds.length || new Set(canonical.map((item) => item.evidenceId)).size !== canonical.length) {
      return fail('catalog-evidence-set');
    }
    const suppliedById = new Map(input.evidence.map((item) => [item.evidenceId, item]));
    const canonicalById = new Map(canonical.map((item) => [item.evidenceId, item]));
    for (const evidenceId of citedIds) {
      const supplied = suppliedById.get(evidenceId);
      const authority = canonicalById.get(evidenceId);
      if (!supplied || !authority || !sameEvidence(supplied, authority)) return fail('catalog-evidence-mismatch');
      if (authority.answerReleaseId !== input.catalog.answerReleaseId) return fail('answer-release-mismatch');
      if ([...authority.excerpt].length > 1_200 || checksum(authority.excerpt) !== authority.excerptChecksum) return fail('excerpt-integrity');
      if (!directCanonicalPath(authority.canonicalPath) || authority.locator.label.trim().length === 0
        || !Number.isInteger(authority.locator.ordinal) || authority.locator.ordinal < 1
        || !input.catalog.hasAuthorizedEvidenceLocation(authority)) return fail('canonical-locator');
    }

    const sentenceUnits: SupportedSentenceUnit[] = [];
    for (const claim of input.claims) {
      const excerpts = claim.evidenceIds.map((id) => normalizedNewlines(canonicalById.get(id)!.excerpt));
      if (quoteBodies(claim.text).some((quoted) => !excerpts.some((excerpt) => excerpt.includes(normalizedNewlines(quoted))))) {
        return fail('quote-mismatch');
      }
      const units = splitSentences(claim.text, claim.claimId, claim.evidenceIds);
      if (units.length === 0) return fail('sentence-units');
      sentenceUnits.push(...units);
    }
    return Object.freeze({ ok: true, sentenceUnits: Object.freeze(sentenceUnits) });
  }
}
