import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ExplainResponse } from "../types";

const SAMPLE_QUERIES = [
  "Java Spring Boot developer Pune",
  "Python data scientist Bangalore",
  "React frontend developer remote",
  "DevOps engineer AWS Kubernetes",
  "machine learning engineer",
];

const INTENT_LABEL: Record<string, string> = {
  INFORMATIONAL: "User wants to learn / explore",
  NAVIGATIONAL: "User wants a specific known entity",
  TRANSACTIONAL: "User wants to do something (find & apply)",
};

export default function SearchIntelligencePage() {
  const [query, setQuery] = useState("Java Spring Boot developer Pune");
  const [algorithm, setAlgorithm] = useState<"tfidf" | "bm25">("tfidf");
  // Phase 2: controlled query expansion on/off for this analysis.
  const [expand, setExpand] = useState(false);
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0); // first result expanded

  const run = useCallback(async (q: string, algo: "tfidf" | "bm25", withExpand: boolean) => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setData(await api.explain(q, algo, withExpand));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explain failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run("Java Spring Boot developer Pune", "tfidf", false);
  }, [run]);

  function switchAlgorithm(algo: "tfidf" | "bm25") {
    setAlgorithm(algo);
    void run(query, algo, expand);
  }

  function toggleExpand() {
    const next = !expand;
    setExpand(next);
    void run(query, algorithm, next);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Search Intelligence</h1>
          <p className="muted small">
            Inspect how the IR engine processes a query and ranks jobs. Same corpus, same
            tokenization — switch between <strong>TF-IDF</strong> (vector space model, cosine
            similarity) and <strong>BM25</strong> (probabilistic ranking) to compare.
          </p>
        </div>
      </div>

      <div className="card">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(query, algorithm, expand);
          }}
        >
          <input
            style={{ flex: 1, minWidth: 220 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "Java Spring Boot developer Pune"'
            aria-label="Query"
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </form>

        <div className="row mt">
          <span className="muted small">Ranking algorithm:</span>
          <button
            className={`btn btn-sm ${algorithm === "tfidf" ? "btn-primary" : "btn-outline"}`}
            onClick={() => switchAlgorithm("tfidf")}
            type="button"
          >
            TF-IDF
          </button>
          <button
            className={`btn btn-sm ${algorithm === "bm25" ? "btn-primary" : "btn-outline"}`}
            onClick={() => switchAlgorithm("bm25")}
            type="button"
          >
            BM25
          </button>
          <span className="muted small" style={{ marginLeft: 12 }}>
            Try:
          </span>
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setQuery(q);
                void run(q, algorithm, expand);
              }}
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            className={`btn btn-sm ${expand ? "btn-primary" : "btn-outline"}`}
            onClick={toggleExpand}
            style={{ marginLeft: "auto" }}
            title="Phase 2: apply the controlled synonym/alias dictionary before ranking"
          >
            Query expansion {expand ? "on" : "off"}
          </button>
        </div>
      </div>

      {error && <div className="card form-error mt">{error}</div>}
      {busy && !data && <div className="page-loading">Analyzing…</div>}

      {data && (
        <>
          {/* ---------------- query processing ---------------- */}
          <div className="card mt">
            <h2>1 · Query processing</h2>
            <div className="row spread mt">
              <div>
                <div className="muted small">Raw query</div>
                <code>"{data.query}"</code>
              </div>
              {data.expansion.requested && (
                <div>
                  <div className="muted small">Effective query (after expansion)</div>
                  <code>"{data.effectiveQuery}"</code>
                  {data.expansion.applied.length > 0 && (
                    <div className="muted small mt">
                      {data.expansion.applied.map((a) => `${a.from} → ${a.to.join(" + ")}`).join(" · ")}
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="muted small">Corpus</div>
                <strong>{data.corpusSize} active jobs indexed</strong>
              </div>
              <div>
                <div className="muted small">Algorithm</div>
                <span className="badge badge-primary">{data.algorithm.toUpperCase()}</span>
              </div>
            </div>
            <div className="mt">
              <div className="muted small">
                Pipeline: lowercase → tokenize → stop-word removal → light stemming
              </div>
              <div className="row mt">
                {data.processedQuery.map((t, i) => (
                  <div key={`${t}-${i}`} className="term-chip">
                    <span className="term">{t}</span>
                  </div>
                ))}
                {data.processedQuery.length === 0 && (
                  <span className="muted small">No tokens after stop-word removal.</span>
                )}
              </div>
            </div>
          </div>

          {/* ---------------- search intent (Phase 3) ---------------- */}
          <div className="card mt">
            <h2>2 · Search intent <span className="muted small">(baseline, rule-based)</span></h2>
            <div className="row mt" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className={`badge ${data.intent.intent === "INFORMATIONAL" ? "badge-primary" : data.intent.intent === "NAVIGATIONAL" ? "badge-warning" : "badge-success"}`} style={{ fontSize: 15, padding: "6px 14px" }}>
                {data.intent.intent}
              </span>
              <span className="muted small">{INTENT_LABEL[data.intent.intent]}</span>
              <span className="muted small">confidence {data.intent.confidence.toFixed(2)}</span>
            </div>
            <ul className="muted small mt" style={{ marginBottom: 0 }}>
              {data.intent.signals.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="muted small mt" style={{ marginBottom: 0 }}>
              <strong>Academic note:</strong> this is a deliberately simple, transparent BASELINE — a
              hand-written lexical rule system over the Broder (2002) taxonomy (informational /
              navigational / transactional). It is <strong>not</strong> an ML model: nothing is trained,
              and every decision is explainable from the signals above.
            </p>
          </div>

          {/* ---------------- term statistics ---------------- */}
          <div className="card mt">
            <h2>3 · Term statistics (computed from the live corpus)</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Document frequency (df)</th>
                    <th>Total occurrences</th>
                    <th>IDF (TF-IDF)</th>
                    <th>IDF (BM25)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.termStats.map((t) => (
                    <tr key={t.term}>
                      <td><strong>{t.term}</strong></td>
                      <td>{t.documentFrequency}</td>
                      <td>{t.totalOccurrences}</td>
                      <td>{t.idfTfidf}</td>
                      <td>{t.idfBm25}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small mt">
              Rare terms get higher IDF — that's why <code>pune</code> or <code>spring</code> can
              dominate the ranking even when <code>developer</code> appears in more documents.
            </p>
          </div>

          {/* ---------------- ranked results ---------------- */}
          <div className="card mt">
            <h2>4 · Ranked results ({data.results.length})</h2>
            {data.results.length === 0 && (
              <p className="muted small">No documents matched this query.</p>
            )}
            {data.results.map((r) => (
              <div key={r.job.id} className="card" style={{ marginTop: 10 }}>
                <div
                  className="row spread"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === r.rank ? null : r.rank)}
                >
                  <div>
                    <span className="badge badge-primary">#{r.rank}</span>{" "}
                    <strong>{r.job.title}</strong>{" "}
                    <span className="muted small">
                      — {r.job.companyName}, {r.job.location}
                    </span>
                  </div>
                  <div className="row">
                    <span className="badge badge-success">score {r.score.toFixed(4)}</span>
                    <span className="muted small">{expanded === r.rank ? "▲" : "▼"} breakdown</span>
                  </div>
                </div>

                <div className="tags mt">
                  {r.matchedTerms.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>

                {expanded === r.rank && r.explanation && (
                  <div className="mt">
                    <div className="muted small">
                      {data.algorithm === "tfidf"
                        ? `Cosine similarity = dot(q, d) / (||q|| · ||d||) = ${r.explanation.dotProduct?.toFixed(4)} / (${r.explanation.queryNorm?.toFixed(4)} × ${r.explanation.docNorm?.toFixed(4)})`
                        : `BM25: k1=${r.explanation.k1}, b=${r.explanation.b}, avgdl=${r.explanation.avgdl?.toFixed(1)}, |d|=${r.explanation.docLength} terms`}
                    </div>
                    <div className="table-wrap mt">
                      <table>
                        <thead>
                          <tr>
                            <th>Term</th>
                            {data.algorithm === "tfidf" && <th>Query TF-IDF weight</th>}
                            <th>Doc TF</th>
                            <th>IDF</th>
                            {data.algorithm === "bm25" && <th>TF component</th>}
                            <th>Contribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.explanation.terms.map((t) => (
                            <tr key={t.term}>
                              <td><strong>{t.term}</strong></td>
                              {data.algorithm === "tfidf" && <td>{t.queryWeight?.toFixed(4)}</td>}
                              <td>{t.docTf}</td>
                              <td>{t.idf.toFixed(4)}</td>
                              {data.algorithm === "bm25" && <td>{t.tfComponent?.toFixed(4)}</td>}
                              <td>
                                <strong>{t.contribution.toFixed(4)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
