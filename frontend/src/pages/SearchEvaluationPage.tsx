import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { EvaluationResult, PerQueryEval } from "../types";

/** Color badge for a 0..1 metric: green (high) / amber (mid) / red (low). */
function metricBadge(v: number): string {
  if (v >= 0.6) return "badge badge-success";
  if (v >= 0.3) return "badge badge-warning";
  return "badge badge-danger";
}

function AlgorithmTable({ result }: { result: EvaluationResult }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Precision@{result.k}</th>
            <th>Recall@{result.k}</th>
            <th>F1</th>
            <th>MRR</th>
            <th>NDCG@5</th>
            <th>NDCG@10</th>
          </tr>
        </thead>
        <tbody>
          {result.algorithms.map((a) => (
            <tr key={a.algorithm}>
              <td>
                <strong>{a.algorithm === "tfidf" ? "TF-IDF (cosine)" : "BM25 (k1=1.5, b=0.75)"}</strong>
              </td>
              <td>{a.meanMetrics.precision.toFixed(4)}</td>
              <td>{a.meanMetrics.recall.toFixed(4)}</td>
              <td>{a.meanMetrics.f1.toFixed(4)}</td>
              <td>{a.meanMetrics.mrr.toFixed(4)}</td>
              <td>{a.meanMetrics.ndcg5.toFixed(4)}</td>
              <td>
                <span className={metricBadge(a.meanMetrics.ndcg10)}>
                  {a.meanMetrics.ndcg10.toFixed(4)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerQueryTable({ algo }: { algo: EvaluationResult["algorithms"][number] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Query</th>
            <th>P@{algo.perQuery[0]?.metrics.k ?? 10}</th>
            <th>R@{algo.perQuery[0]?.metrics.k ?? 10}</th>
            <th>F1</th>
            <th>MRR</th>
            <th>NDCG@5</th>
            <th>NDCG@10</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {algo.perQuery.map((pq: PerQueryEval) => (
            <>
              <tr key={pq.queryId}>
                <td className="muted">{pq.queryId}</td>
                <td>
                  <code>{pq.query}</code>
                </td>
                <td>{pq.metrics.precision.toFixed(2)}</td>
                <td>{pq.metrics.recall.toFixed(2)}</td>
                <td>{pq.metrics.f1.toFixed(2)}</td>
                <td>{pq.metrics.mrr.toFixed(2)}</td>
                <td>{pq.metrics.ndcg5.toFixed(2)}</td>
                <td>{pq.metrics.ndcg10.toFixed(2)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setOpen(open === pq.queryId ? null : pq.queryId)}
                  >
                    {open === pq.queryId ? "Hide" : "Details"}
                  </button>
                </td>
              </tr>
              {open === pq.queryId && (
                <tr key={`${pq.queryId}-detail`}>
                  <td colSpan={9}>
                    <div className="muted small">
                      Judged relevant (grade ≥ 2) in corpus: <strong>{pq.judgedRelevant}</strong> ·
                      retrieved in top-{pq.metrics.k}: <strong>{pq.retrieved}</strong> · relevant
                      retrieved: <strong>{pq.metrics.relevantRetrieved}</strong>
                    </div>
                    <div className="row mt" style={{ flexWrap: "wrap" }}>
                      {pq.rankedJobs.map((rj) => (
                        <span
                          key={rj.jobId}
                          className={`badge ${rj.grade >= 2 ? "badge-success" : rj.grade === 1 ? "badge-warning" : "badge-gray"}`}
                          title={`grade ${rj.grade}`}
                        >
                          #{rj.rank} {rj.title} · g{rj.grade}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SearchEvaluationPage() {
  const [data, setData] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [algoTab, setAlgoTab] = useState<"tfidf" | "bm25">("tfidf");

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api.searchEvaluation());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const algo = data?.algorithms.find((a) => a.algorithm === algoTab);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Search Evaluation</h1>
          <p className="muted small">
            Standard IR metrics for <strong>TF-IDF</strong> and <strong>BM25</strong> over a manual
            qrels dataset ({data?.queries ?? 8} queries, grades 0–3). Every number is computed live
            from the actual index and rankings — nothing is hard-coded or simulated.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Evaluating…" : "Run / Recalculate"}
          </button>
        </div>
      </div>

      {error && <div className="card form-error">{error}</div>}
      {busy && !data && <div className="page-loading">Evaluating…</div>}

      {data && (
        <>
          <div className="card">
            <div className="row spread">
              <h2 style={{ margin: 0 }}>Summary (macro-average over {data.queries} queries)</h2>
              <span className="muted small">
                corpus {data.corpusSize} jobs · ran {new Date(data.ranAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="mt">
              <AlgorithmTable result={data} />
            </div>
            <p className="muted small mt">
              P/R/F1 are @{data.k} with relevance threshold grade ≥ 2. MRR = mean reciprocal rank
              of the first relevant result. NDCG uses the exponential gain 2^g − 1 with the
              corpus-wide ideal ranking (a ranker that misses relevant docs is penalized).
            </p>
          </div>

          <div className="card mt">
            <div className="row spread">
              <h2 style={{ margin: 0 }}>Per-query results</h2>
              <div className="row">
                {(["tfidf", "bm25"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`btn btn-sm ${algoTab === a ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setAlgoTab(a)}
                  >
                    {a.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {algo && <PerQueryTable algo={algo} />}
          </div>

          <div className="card mt">
            <h3>Methodology note</h3>
            <p className="muted small">
              Relevance judgments are a small manual qrels set (TREC-style): for each query, a set
              of jobs is selected by deterministic title/location selectors and assigned grades 0–3
              by hand. Unjudged documents are treated as not relevant (the standard P/R assumption).
              This is an academic baseline evaluation — not a large-scale user study.
            </p>
            <p className="muted small">
              Compare the ranking behavior of each algorithm query-by-query on the{" "}
              <Link to="/intelligence">Search Intelligence</Link> page.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
