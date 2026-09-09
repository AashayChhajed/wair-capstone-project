/**
 * Unit tests for the IR evaluation metrics (Phase 1).
 * Expected values are hand-computed — no fabrication; the functions under
 * test are the same ones used by the live evaluation endpoint and admin page.
 */
import { describe, it, expect } from "vitest";
import {
  precisionAtK,
  recallAtK,
  f1Score,
  reciprocalRank,
  dcgAtK,
  ndcgAtKWithIdeal,
  evaluateRanking,
  mean,
  RELEVANT_THRESHOLD,
} from "../src/services/ir/metrics";

describe("binary relevance metrics", () => {
  // grades: 3 = highly relevant, 2 = relevant, 1 = marginal, 0 = not relevant
  it("computes P@10 as the share of top-k results with grade ≥ 2", () => {
    // top 10 grades: 2 relevant (3 and 2; the 1 is marginal) out of 10 → 0.2
    const grades = [3, 0, 2, 0, 1, 0, 0, 0, 0, 0];
    expect(precisionAtK(grades, 2, 10)).toBeCloseTo(0.2, 6);
  });

  it("counts only grades at or above the threshold as relevant", () => {
    expect(RELEVANT_THRESHOLD).toBe(2);
    // grade 1 (marginal) is NOT relevant for binary metrics
    const grades = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    expect(precisionAtK(grades, 5, 10)).toBe(0);
  });

  it("computes R@10 against the corpus-wide relevant count", () => {
    // 3 relevant in top-k, 5 relevant corpus-wide → 0.6
    const grades = [3, 0, 2, 0, 2, 0, 0, 0, 0, 0];
    expect(recallAtK(grades, 5, 10)).toBeCloseTo(0.6, 6);
  });

  it("returns recall 0 when the corpus has no relevant documents", () => {
    expect(recallAtK([3, 3, 3], 0, 10)).toBe(0);
  });

  it("computes F1 as the harmonic mean of P and R", () => {
    // P = 0.3, R = 0.6 → F1 = 2*0.3*0.6 / 0.9 = 0.4
    expect(f1Score(0.3, 0.6)).toBeCloseTo(0.4, 6);
    expect(f1Score(0, 0)).toBe(0);
  });
});

describe("MRR", () => {
  it("is 1/rank of the first relevant result", () => {
    // first relevant (grade ≥ 2) at rank 3 → 1/3
    expect(reciprocalRank([0, 1, 2, 3])).toBeCloseTo(1 / 3, 6);
  });

  it("is 1 when the first result is relevant", () => {
    expect(reciprocalRank([3, 0, 0])).toBe(1);
  });

  it("is 0 when no relevant result appears", () => {
    expect(reciprocalRank([1, 0, 1])).toBe(0);
    expect(reciprocalRank([])).toBe(0);
  });
});

describe("NDCG with graded relevance", () => {
  it("computes DCG@k with the exponential gain 2^g − 1", () => {
    // DCG@3 of grades [3, 0, 1] = (2^3−1)/log2(2) + 0 + (2^1−1)/log2(4)
    //                            = 7/1 + 0 + 1/2 = 7.5
    expect(dcgAtK([3, 0, 1], 3)).toBeCloseTo(7.5, 6);
  });

  it("penalizes a ranker that misses relevant documents (corpus-wide ideal)", () => {
    // Corpus grades: [3, 3] (2 relevant docs); ranker only returns [3] (missed one).
    // DCG@5 = 7 / 1 = 7; IDCG@5 = 7 + 7/log2(3) ≈ 11.413 → NDCG ≈ 0.613
    const ndcg = ndcgAtKWithIdeal([3], [3, 3], 5);
    expect(ndcg).toBeGreaterThan(0.61);
    expect(ndcg).toBeLessThan(0.62);
  });

  it("is 1 for the perfect ranking and 0 when nothing relevant exists", () => {
    expect(ndcgAtKWithIdeal([3, 2], [3, 2], 5)).toBeCloseTo(1, 6);
    expect(ndcgAtKWithIdeal([0, 0], [0, 0], 5)).toBe(0);
  });
});

describe("evaluateRanking (per-query bundle)", () => {
  it("produces a consistent metric bundle for one ranking", () => {
    // ranked top-10: relevant at ranks 1 and 4; corpus-wide: 4 relevant
    const ranked = [3, 0, 0, 2, 0, 0, 0, 0, 0, 0];
    const corpus = [3, 0, 0, 2, 0, 3, 3, 0, 0, 0];
    const m = evaluateRanking(ranked, corpus, 10);
    expect(m.precision).toBeCloseTo(0.2, 6);
    expect(m.recall).toBeCloseTo(0.5, 6);
    expect(m.f1).toBeCloseTo(2 * 0.2 * 0.5 / 0.7, 6);
    expect(m.mrr).toBe(1);
    // NDCG@10 with corpus-wide ideal: DCG = 7 + 3/log2(5); IDCG adds 3/log2(3)+3/log2(4)
    expect(m.ndcg10).toBeGreaterThan(0.5);
    expect(m.ndcg10).toBeLessThanOrEqual(1);
  });
});

describe("macro averaging", () => {
  it("means per-query metric values", () => {
    expect(mean([0.2, 0.4, 0.6])).toBeCloseTo(0.4, 6);
    expect(mean([])).toBe(0);
  });
});
