import { createHash } from 'node:crypto';
import { publicRecordSchema, type PublicRecord } from '@beyondwin/contracts';

export const ANSWER_CHUNKER_VERSION = 'public-blocks-v1' as const;
export const ANSWER_NORMALIZER_VERSION = 'nfkc-lower-hangul-ngram-v1' as const;

function codePointCompare(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index].codePointAt(0)! - rightPoints[index].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => codePointCompare(left, right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export const canonicalJsonLine = (value: unknown): string => JSON.stringify(canonicalize(value));
export const sha256Hex = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const sha256Checksum = (value: string | Buffer): string => `sha256:${sha256Hex(value)}`;
export const canonicalPublicRecordChecksum = (record: PublicRecord): string => (
  sha256Checksum(canonicalJsonLine(publicRecordSchema.parse(record)))
);

export { codePointCompare };
