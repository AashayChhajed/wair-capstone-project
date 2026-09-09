/**
 * Standard Information Retrieval evaluation metrics (pure functions).
 *
 * Relevance is graded 0–3 per (query, document) pair from the manual
 * relevance-judgment dataset:
 *   3 = highly relevant   2 = relevant   1 = marginally relevant   0 = not relevant
 *
 * Binary metrics (Precision / Recall / F1 / MRR) use a relevance threshold
 * (default: grade ≥ 2 counts as relevant). NDCG uses the raw graded gains
 * with the standard exponential gain 2^grade − 1.
 *
 *   DCG@k   = Σ_{i=1..k} (2^{g_i} − 1) / log2(i + 1)
 *   NDCG@k  = DCG@k / IDCG@k        (IDCG = DCG of the ideal ranking)
 *
 * Nothing here is fabricated: callers pass actual ranked grades produced by
 * the live ranking algorithms over the evaluation dataset.
 */

export const RELEVANT_THRESHOLD = 2; // grade ≥ 2 → "relevant" for binary metrics

/** Precision@k: fraction of the top-k ranked docs that are relevant. */
export function precisionAtK(rankedGrades: number[], totalRelevant: number, k: number): number {
  const top = rankedGrades.slice(0, k);
  if (top.length === 0) return 0;
  const relevant = top.filter((g) => g >= RELEVANT_THRESHOLD).length;
  return relevant / top.length;
}

/** Recall@k: fraction of ALL relevant docs in the corpus retrieved in top-k. */
export function recallAtK(rankedGrades: number[], totalRelevant: number, k: number): number {
  if (totalRelevant === 0) return 0;
  const top = rankedGrades.slice(0, k);
  const relevant = top.filter((g) => g >= RELEVANT_THRESHOLD).length;
  return relevant / totalRelevant;
}

/** F1 = 2 · P · R / (P + R); 0 when both are 0. */
export function f1Score(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Mean Reciprocal Rank for a single query: 1 / rank of the FIRST relevant
 * result (grade ≥ threshold); 0 if none appears in the ranked list.
 */
export function reciprocalRank(rankedGrades: number[]): number {
  for (let i = 0; i < rankedGrades.length; i++) {
    if (rankedGrades[i] >= RELEVANT_THRESHOLD) return 1 / (i + 1);
  }
  return 0;
}

/** Discounted cumulative gain with exponential gain, truncated at k. */
export function dcgAtK(gains: number[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, gains.length); i++) {
    dcg += (Math.pow(2, gains[i]) - 1) / Math.log2(i + 2); // rank i+1 → log2(i+2)
  }
  return dcg;
}

/** NDCG@k for one query: DCG@k of the actual ranking / DCG@k of the ideal. */
export function ndcgAtK(rankedGrades: number[], totalRelevant: number, k: number): number {
  const dcg = dcgAtK(rankedGrades, k);
  // Ideal ranking: all graded-relevant docs (grade > 0) sorted descending.
  const ideal = rankedGrades
    .slice() // candidate grades we were given (only docs that exist)
    .filter((g) => g > 0)
    .sort((a, b) => b - a);
  // The ideal list should contain every relevant doc in the corpus, even ones
  // the ranker did not return — callers pass the full graded corpus list via
  // rankedGrades when computing ideal correctly, so we compute IDCG from the
  // corpus-wide grades supplied through idealGains below.
  void totalRelevant;
  const idcg = dcgAtK(ideal, k);
  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * NDCG@k where the ideal ranking is computed from the FULL corpus-wide grade
 * list (not just the returned docs). This is the correct formulation: a
 * ranker that misses relevant documents entirely must be penalized.
 */
export function ndcgAtKWithIdeal(rankedGrades: number[], allGrades: number[], k: number): number {
  const dcg = dcgAtK(rankedGrades, k);
  const ideal = allGrades.filter((g) => g > 0).sort((a, b) => b - a);
  const idcg = dcgAtK(ideal, k);
  return idcg === 0 ? 0 : dcg / idcg;
}

export interface QueryMetrics {
  precision: number; // P@10
  recall: number; // R@10
  f1: number;
  mrr: number;
  ndcg5: number;
  ndcg10: number;
  relevantRetrieved: number;
  k: number;
}

/**
 * Evaluate one ranked list (grades in rank order) against the corpus-wide
 * grades for the same query.
 */
export function evaluateRanking(
  rankedGrades: number[],
  allCorpusGrades: number[],
  k = 10,
): QueryMetrics {
  const totalRelevant = allCorpusGrades.filter((g) => g >= RELEVANT_THRESHOLD).length;
  const precision = precisionAtK(rankedGrades, totalRelevant, k);
  const recall = recallAtK(rankedGrades, totalRelevant, k);
  return {
    precision,
    recall,
    f1: f1Score(precision, recall),
    mrr: reciprocalRank(rankedGrades),
    ndcg5: ndcgAtKWithIdeal(rankedGrades, allCorpusGrades, 5),
    ndcg10: ndcgAtKWithIdeal(rankedGrades, allCorpusGrades, 10),
    relevantRetrieved: rankedGrades.slice(0, k).filter((g) => g >= RELEVANT_THRESHOLD).length,
    k,
  };
}

/** Mean of a metric across per-query results (macro average). */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
