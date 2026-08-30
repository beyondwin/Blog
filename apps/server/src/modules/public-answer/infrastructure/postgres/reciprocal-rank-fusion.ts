export const RRF_K = 60 as const;

export interface RankedCandidate { readonly chunkId: string; readonly recordId: string }
export interface FusedCandidate extends RankedCandidate {
  readonly lexicalRank: number | null; readonly vectorRank: number | null; readonly rrfScore: number;
}

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

export function fuseRankedCandidates(
  lexical: readonly RankedCandidate[], vector: readonly RankedCandidate[], maxEvidence = 6,
): readonly FusedCandidate[] {
  const candidates = new Map<string, { chunkId: string; recordId: string; lexicalRank: number | null; vectorRank: number | null }>();
  lexical.forEach((item, index) => candidates.set(item.chunkId, { ...item, lexicalRank: index + 1, vectorRank: null }));
  vector.forEach((item, index) => {
    const prior = candidates.get(item.chunkId);
    if (prior && prior.recordId !== item.recordId) throw new Error('rank branches disagree on record identity');
    candidates.set(item.chunkId, { ...item, lexicalRank: prior?.lexicalRank ?? null, vectorRank: index + 1 });
  });
  const fused = [...candidates.values()].map((item) => Object.freeze({
    ...item,
    rrfScore: (item.lexicalRank === null ? 0 : 1 / (RRF_K + item.lexicalRank))
      + (item.vectorRank === null ? 0 : 1 / (RRF_K + item.vectorRank)),
  })).sort((a, b) => b.rrfScore - a.rrfScore || codePointCompare(a.chunkId, b.chunkId));
  const selected: FusedCandidate[] = []; const records = new Set<string>();
  for (const candidate of fused) {
    if (records.size >= 3 || records.has(candidate.recordId)) continue;
    selected.push(candidate); records.add(candidate.recordId);
    if (selected.length === maxEvidence) return Object.freeze(selected);
  }
  for (const candidate of fused) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate); if (selected.length === maxEvidence) break;
  }
  return Object.freeze(selected);
}

export function retrievalIsSufficient(selected: readonly FusedCandidate[]): boolean {
  return selected.length >= 2
    && selected[0]!.rrfScore >= 1 / 61
    && selected[1]!.rrfScore >= 1 / 70
    && selected.some((candidate) => candidate.lexicalRank !== null && candidate.lexicalRank <= 5)
    && selected.some((candidate) => candidate.vectorRank !== null && candidate.vectorRank <= 5);
}
