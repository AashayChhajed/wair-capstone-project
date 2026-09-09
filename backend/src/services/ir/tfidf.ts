/**
 * TF-IDF Vector Space Model with cosine similarity.
 *
 * Each job posting is a document d in a corpus D of N documents:
 *   tf(t, d)  = raw count of term t in document d (log-normalized: 1 + ln tf)
 *   idf(t)    = ln((N + 1) / (df(t) + 1)) + 1   (smoothed, keeps rare terms strong)
 *   w(t, d)   = tf(t, d) * idf(t)
 *
 * A document is a sparse vector w_d in |V|-dimensional term space. The query
 * is projected into the SAME vector space and documents are ranked by cosine
 * similarity:
 *
 *   sim(q, d) = (q . d) / (||q|| * ||d||)
 *
 * Nothing here is hard-coded: every weight and score is derived from the
 * actual corpus statistics at index time.
 */

import { processQuery } from "./tokenizer";

export interface IndexedDocument {
  id: string;
  termFrequencies: Map<string, number>;
  vector: Map<string, number>; // tf-idf weights, L2-normalized
  norm: number; // ||d||
  length: number; // total term count (used by BM25)
}

export interface ScoredResult {
  id: string;
  score: number;
  matchedTerms: string[];
}

export class TfidfIndex {
  private documents = new Map<string, IndexedDocument>();
  private documentFrequency = new Map<string, number>(); // df(t)
  private totalDocuments = 0;

  /**
   * Build the index from a corpus. Each document's text is tokenized with the
   * shared pipeline, term frequencies counted, then tf-idf vectors computed.
   */
  constructor(docs: { id: string; text: string }[]) {
    const tokenLists = new Map<string, string[]>();

    // Pass 1: tokenize + count term frequencies + document frequencies.
    for (const doc of docs) {
      const tokens = processQuery(doc.text);
      tokenLists.set(doc.id, tokens);
      const tf = new Map<string, number>();
      for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      }
      for (const term of tf.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
      this.documents.set(doc.id, {
        id: doc.id,
        termFrequencies: tf,
        vector: new Map(),
        norm: 0,
        length: tokens.length,
      });
    }
    this.totalDocuments = this.documents.size;

    // Pass 2: compute tf-idf weights and L2 norm per document.
    for (const doc of this.documents.values()) {
      let sumOfSquares = 0;
      for (const [term, rawTf] of doc.termFrequencies) {
        const tf = 1 + Math.log(rawTf); // log-normalized term frequency
        const idf = this.idf(term);
        const weight = tf * idf;
        doc.vector.set(term, weight);
        sumOfSquares += weight * weight;
      }
      doc.norm = Math.sqrt(sumOfSquares);
    }
  }

  /** Smoothed inverse document frequency. */
  idf(term: string): number {
    const df = this.documentFrequency.get(term) ?? 0;
    return Math.log((this.totalDocuments + 1) / (df + 1)) + 1;
  }

  get size(): number {
    return this.totalDocuments;
  }

  get vocabulary(): string[] {
    return [...this.documentFrequency.keys()].sort();
  }

  /** Number of documents containing the term. */
  documentFrequencyFor(term: string): number {
    return this.documentFrequency.get(term) ?? 0;
  }

  /** Total number of occurrences of the term across the corpus. */
  totalOccurrences(term: string): number {
    let n = 0;
    for (const doc of this.documents.values()) {
      n += doc.termFrequencies.get(term) ?? 0;
    }
    return n;
  }

  documentTerms(id: string): string[] {
    return [...(this.documents.get(id)?.termFrequencies.keys() ?? [])];
  }

  /**
   * Rank documents against a query using cosine similarity in the TF-IDF
   * vector space. Returns every document with a non-zero score, descending.
   */
  search(query: string, limit = 50): ScoredResult[] {
    const queryTokens = processQuery(query);
    if (queryTokens.length === 0 || this.totalDocuments === 0) return [];

    // Build the query vector in the same space.
    const queryTf = new Map<string, number>();
    for (const token of queryTokens) {
      queryTf.set(token, (queryTf.get(token) ?? 0) + 1);
    }
    const queryVector = new Map<string, number>();
    let queryNorm = 0;
    for (const [term, rawTf] of queryTf) {
      const tf = 1 + Math.log(rawTf);
      const idf = this.idf(term);
      const weight = tf * idf;
      queryVector.set(term, weight);
      queryNorm += weight * weight;
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return [];

    // Cosine similarity against every indexed document.
    const results: ScoredResult[] = [];
    for (const doc of this.documents.values()) {
      if (doc.norm === 0) continue;
      let dot = 0;
      const matchedTerms: string[] = [];
      for (const [term, qWeight] of queryVector) {
        const dWeight = doc.vector.get(term);
        if (dWeight !== undefined) {
          dot += qWeight * dWeight;
          matchedTerms.push(term);
        }
      }
      if (dot <= 0) continue;
      const score = dot / (queryNorm * doc.norm); // cosine similarity, [0, 1]
      results.push({ id: doc.id, score, matchedTerms });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Explain the score of one document for one query: per-term contributions.
   * Used by the Search Intelligence page.
   */
  explain(query: string, docId: string) {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    const queryTokens = processQuery(query);
    const queryTf = new Map<string, number>();
    for (const token of queryTokens) queryTf.set(token, (queryTf.get(token) ?? 0) + 1);

    let queryNorm = 0;
    const terms: {
      term: string;
      queryTf: number;
      queryWeight: number;
      docTf: number;
      docWeight: number;
      idf: number;
      contribution: number;
    }[] = [];

    for (const [term, rawTf] of queryTf) {
      const tf = 1 + Math.log(rawTf);
      const idf = this.idf(term);
      const qWeight = tf * idf;
      queryNorm += qWeight * qWeight;
      const dTf = doc.termFrequencies.get(term) ?? 0;
      const dWeight = doc.vector.get(term) ?? 0;
      terms.push({
        term,
        queryTf: rawTf,
        queryWeight: qWeight,
        docTf: dTf,
        docWeight: dWeight,
        idf,
        contribution: qWeight * dWeight,
      });
    }
    queryNorm = Math.sqrt(queryNorm);
    const dot = terms.reduce((acc, t) => acc + t.contribution, 0);
    const score = queryNorm > 0 && doc.norm > 0 ? dot / (queryNorm * doc.norm) : 0;
    terms.sort((a, b) => b.contribution - a.contribution);
    return { score, dotProduct: dot, queryNorm, docNorm: doc.norm, terms };
  }
}
