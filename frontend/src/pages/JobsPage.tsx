import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { SearchResponse } from "../types";
import { getSessionId } from "../tracking";
import { EMPLOYMENT_LABEL, formatSalary, timeAgo } from "../format";

const LOCATIONS = ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Delhi", "Chennai", "Remote"];

export default function JobsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const algorithm = (params.get("algorithm") as "tfidf" | "bm25") ?? "tfidf";
  const location = params.get("location") ?? "";
  // Phase 2: controlled query expansion (?expand=1) — opt-in per search.
  const expand = params.get("expand") === "1";

  const [data, setData] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState(query);

  // Keep input in sync when URL changes (e.g. after navigation).
  useEffect(() => setInput(query), [query]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      setData(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sessionId = getSessionId();
      // IR search endpoint (TF-IDF / BM25). Location is applied as a post-filter
      // client-side only for display purposes; the backend tracks FILTER_USED.
      // Phase 2: ?expand=1 enables the controlled synonym/alias dictionary.
      const res = await api.search(query, algorithm, sessionId, expand);
      let results = res.results;
      if (location) {
        results = results.filter(
          (r) => r.job.location.toLowerCase() === location.toLowerCase(),
        );
        // Track the filter usage for the clickstream.
        api.track("FILTER_USED", { searchQuery: query, metadata: { filter: "location", value: location } }).catch(() => undefined);
      }
      setData({ ...res, results, total: results.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }, [query, algorithm, location, expand]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  function updateParams(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ q: input });
  }

  const emptyState = !busy && data && data.total === 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Job Search</h1>
          <p className="muted small">
            Ranked by {algorithm === "tfidf" ? "TF-IDF cosine similarity (vector space model)" : "Okapi BM25"} over
            the indexed job corpus.
          </p>
        </div>
      </div>

      <div className="card">
        <form className="row" onSubmit={onSubmit}>
          <input
            style={{ flex: 1, minWidth: 220 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Try "Java Spring Boot developer Pune"'
            aria-label="Search jobs"
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="row spread mt">
          <div className="row">
            <span className="muted small">Ranking algorithm:</span>
            <button
              className={`btn btn-sm ${algorithm === "tfidf" ? "btn-primary" : "btn-outline"}`}
              onClick={() => updateParams({ algorithm: "tfidf" })}
              type="button"
            >
              TF-IDF
            </button>
            <button
              className={`btn btn-sm ${algorithm === "bm25" ? "btn-primary" : "btn-outline"}`}
              onClick={() => updateParams({ algorithm: "bm25" })}
              type="button"
            >
              BM25
            </button>
            <span className="muted small" style={{ marginLeft: 12 }}>
              Expansion:
            </span>
            <button
              className={`btn btn-sm ${expand ? "btn-primary" : "btn-outline"}`}
              onClick={() => updateParams({ expand: expand ? undefined : "1" })}
              type="button"
              title="Phase 2: controlled synonym/alias expansion (e.g. JS → JavaScript, ML → Machine Learning)"
            >
              {expand ? "On" : "Off"}
            </button>
          </div>
          <select
            style={{ width: 180 }}
            value={location}
            onChange={(e) => updateParams({ location: e.target.value || undefined })}
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {data && (
          <div className="muted small mt">
            Processed query tokens: <strong>{data.processedQuery.join(" · ") || "(none)"}</strong> ·{" "}
            {data.total} ranked result{data.total === 1 ? "" : "s"} in {data.tookMs} ms
            {data.abVariant && (
              <>
                {" · "}
                <span className={`badge ${data.abVariant === "B" ? "badge-warning" : "badge-gray"}`}>
                  A/B variant {data.abVariant}
                  {data.personalized ? " · personalized ranking" : " · standard ranking"}
                </span>
              </>
            )}
          </div>
        )}

        {/* Phase 2: show what the controlled expansion did (when enabled). */}
        {data?.expansion?.applied.length ? (
          <div className="muted small mt">
            <strong>Query expansion:</strong>{" "}
            <code>"{data.expansion.originalQuery}"</code> →{" "}
            <code>"{data.expansion.expandedQuery}"</code>{" "}
            <span className="muted">
              ({data.expansion.applied.map((a) => `${a.from} → ${a.to.join(" + ")}`).join(" · ")})
            </span>
          </div>
        ) : data && expand ? (
          <div className="muted small mt">
            Query expansion is on — no dictionary expansions applied for this query.
          </div>
        ) : null}
      </div>

      {error && <div className="card mt form-error">{error}</div>}

      {busy && <div className="page-loading">Searching…</div>}

      {emptyState && (
        <div className="card mt" style={{ textAlign: "center", padding: 40 }}>
          <h3>No matching jobs</h3>
          <p className="muted small">
            Try different keywords, or browse all jobs without a query.
          </p>
        </div>
      )}

      {!query && !busy && (
        <div className="card mt" style={{ textAlign: "center", padding: 40 }}>
          <h3>Search the job corpus</h3>
          <p className="muted small">
            Enter keywords such as <strong>Java Spring Boot developer Pune</strong>. Results are
            ranked dynamically by the selected IR algorithm — scores come from the live index, not
            hard-coded.
          </p>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="grid grid-jobs mt">
          {data.results.map((hit) => (
            <Link key={hit.job.id} to={`/jobs/${hit.job.id}`} className="card job-card">
              <div className="row spread">
                <span className="badge badge-primary">#{hit.rank}</span>
                <span className="muted small">score {hit.score.toFixed(4)}</span>
              </div>
              <div className="job-title">{hit.job.title}</div>
              <div className="muted small">
                {hit.job.companyName} · {hit.job.location}
              </div>
              <div className="job-meta">
                <span>{EMPLOYMENT_LABEL[hit.job.employmentType] ?? hit.job.employmentType}</span>
                <span>·</span>
                <span>{formatSalary(hit.job.salaryMin, hit.job.salaryMax)}</span>
                <span>·</span>
                <span>{timeAgo(hit.job.postedAt)}</span>
              </div>
              <div className="tags">
                {hit.job.skills.slice(0, 5).map((skill) => (
                  <span key={skill} className={`tag ${hit.matchedTerms.includes(skill.toLowerCase().replace(/[^a-z0-9+#.]/g, "")) ? "" : "tag-out"}`}>
                    {skill}
                  </span>
                ))}
              </div>
              <div className="score-bar">
                <div style={{ width: `${Math.min(100, hit.score * 100)}%` }} />
              </div>
              <div className="muted small">Matched: {hit.matchedTerms.join(", ") || "—"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
