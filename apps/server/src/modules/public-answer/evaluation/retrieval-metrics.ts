export interface RetrievalMetrics {
  readonly hitAt3: 0 | 1;
  readonly recallAt5: number | null;
  readonly ndcgAt5: number | null;
}

export function retrievalMetrics(expectedRecordIds: readonly string[], rankedRecordIds: readonly string[]): Readonly<RetrievalMetrics> {
  const expected = new Set(expectedRecordIds);
  if (expected.size === 0) return Object.freeze({ hitAt3: 0, recallAt5: null, ndcgAt5: null });
  const top3 = rankedRecordIds.slice(0, 3);
  const top5 = rankedRecordIds.slice(0, 5);
  const hitAt3 = top3.some((id) => expected.has(id)) ? 1 : 0;
  const recalled = new Set(top5.filter((id) => expected.has(id))).size;
  const recallAt5 = recalled / expected.size;
  const dcg = top5.reduce((sum, id, index) => sum + (expected.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const idealCount = Math.min(expected.size, 5);
  const ideal = Array.from({ length: idealCount }, (_unused, index) => 1 / Math.log2(index + 2)).reduce((a, b) => a + b, 0);
  return Object.freeze({ hitAt3, recallAt5, ndcgAt5: dcg / ideal });
}
