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

function canonicalJsonValue(value: unknown): string | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonValue(item) ?? 'null').join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => codePointCompare(left, right))
      .flatMap(([key, child]) => {
        const serialized = canonicalJsonValue(child);
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
      })
      .join(',')}}`;
  }
  return undefined;
}

export const canonicalJsonLine = (value: unknown): string => {
  const serialized = canonicalJsonValue(value);
  if (serialized === undefined) throw new TypeError('canonical JSON value must be serializable');
  return serialized;
};
export const sha256Hex = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const sha256Checksum = (value: string | Buffer): string => `sha256:${sha256Hex(value)}`;
export const canonicalPublicRecordChecksum = (record: PublicRecord): string => (
  sha256Checksum(canonicalJsonLine(publicRecordSchema.parse(record)))
);

export { codePointCompare };
