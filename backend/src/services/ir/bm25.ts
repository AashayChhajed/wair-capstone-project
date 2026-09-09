/**
 * BM25 (Okapi Best Match 25) ranking function.
 *
 *   score(q, d) = Σ_{t ∈ q} IDF(t) · ( f(t,d) · (k1 + 1) )
 *                                   / ( f(t,d) + k1 · (1 − b + b · |d| / avgdl) )
 *
 *   k1 = 1.5  → term-frequency saturation
 *   b  = 0.75 → document-length normalization strength
 *   IDF(t)    = ln(1 + (N − df + 0.5) / (df + 0.5))   (always ≥ 0)
 *
 * All statistics (tf, df, |d|, avgdl, N) come from the actual corpus —
 * scores are computed, never faked.
 */

import { processQuery } from "./tokenizer";

export interface Bm25Document {
  id: string;
  termFrequencies: Map<string, number>;
  length: number;
}

export interface Bm25Result {
  id: string;
  score: number;
  matchedTerms: string[];
}

export class Bm25Index {
  private documents = new Map<string, Bm25Document>();
  private documentFrequency = new Map<string, number>();
  private totalDocuments = 0;
  private totalLength = 0;

  constructor(
    docs: { id: string; text: string }[],
    private k1 = 1.5,
    private b = 0.75,
  ) {
    for (const doc of docs) {
      const tokens = processQuery(doc.text);
      const tf = new Map<string, number>();
      for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      for (const term of tf.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
      this.documents.set(doc.id, { id: doc.id, termFrequencies: tf, length: tokens.length });
      this.totalLength += tokens.length;
    }
    this.totalDocuments = this.documents.size;
  }

  /** BM25-style IDF (non-negative variant). */
  idf(term: string): number {
    const df = this.documentFrequency.get(term) ?? 0;
    return Math.log(1 + (this.totalDocuments - df + 0.5) / (df + 0.5));
  }

  get averageDocLength(): number {
    return this.totalDocuments === 0 ? 0 : this.totalLength / this.totalDocuments;
  }

  get size(): number {
    return this.totalDocuments;
  }

  /** Rank documents against a query with the BM25 scoring function. */
  search(query: string, limit = 50): Bm25Result[] {
    const queryTokens = processQuery(query);
    if (queryTokens.length === 0 || this.totalDocuments === 0) return [];

    // Distinct query terms with their query-term frequency weight (standard
    // BM25 treats repeated query terms with a qtf component; we use the
    // common simplification of scoring each distinct term once, weighted by
    // its query frequency — for short queries this is identical in practice).
    const queryTermCounts = new Map<string, number>();
    for (const token of queryTokens) {
      queryTermCounts.set(token, (queryTermCounts.get(token) ?? 0) + 1);
    }

    const avgdl = this.averageDocLength;
    const results: Bm25Result[] = [];

    for (const doc of this.documents.values()) {
      let score = 0;
      const matchedTerms: string[] = [];
      for (const [term, qtf] of queryTermCounts) {
        const f = doc.termFrequencies.get(term) ?? 0;
        if (f === 0) continue;
        const tfComponent =
          (f * (this.k1 + 1)) /
          (f + this.k1 * (1 - this.b + this.b * (doc.length / avgdl)));
        score += this.idf(term) * tfComponent * qtf;
        matchedTerms.push(term);
      }
      if (score > 0) results.push({ id: doc.id, score, matchedTerms });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Explain the score of one document for one query (per-term breakdown). */
  explain(query: string, docId: string) {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    const queryTokens = processQuery(query);
    const queryTermCounts = new Map<string, number>();
    for (const token of queryTokens) queryTermCounts.set(token, (queryTermCounts.get(token) ?? 0) + 1);

    const avgdl = this.averageDocLength;
    let score = 0;
    const terms: {
      term: string;
      docTf: number;
      idf: number;
      tfComponent: number;
      contribution: number;
    }[] = [];

    for (const [term, qtf] of queryTermCounts) {
      const f = doc.termFrequencies.get(term) ?? 0;
      if (f === 0) {
        terms.push({ term, docTf: 0, idf: this.idf(term), tfComponent: 0, contribution: 0 });
        continue;
      }
      const tfComponent =
        (f * (this.k1 + 1)) /
        (f + this.k1 * (1 - this.b + this.b * (doc.length / avgdl)));
      const contribution = this.idf(term) * tfComponent * qtf;
      score += contribution;
      terms.push({ term, docTf: f, idf: this.idf(term), tfComponent, contribution });
    }
    terms.sort((a, b) => b.contribution - a.contribution);
    return { score, avgdl, docLength: doc.length, k1: this.k1, b: this.b, terms };
  }
}
