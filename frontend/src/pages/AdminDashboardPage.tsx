import { useEffect, useState } from "react";
import { api } from "../api";
import type {
  AnalyticsOverview,
  FunnelAnalytics,
  SearchAnalytics,
  StatusCount,
  JobAnalyticsRow,
} from "../api";
import { STATUS_BADGE, statusLabel } from "../format";

type Tab = "overview" | "search" | "funnel" | "jobs";

const FUNNEL_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc"];

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [search, setSearch] = useState<SearchAnalytics | null>(null);
  const [funnel, setFunnel] = useState<FunnelAnalytics | null>(null);
  const [jobs, setJobs] = useState<JobAnalyticsRow[]>([]);
  const [statusDist, setStatusDist] = useState<StatusCount[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBusy(true);
    Promise.all([
      api.analyticsOverview(days),
      api.analyticsSearch(days),
      api.analyticsFunnel(days),
      api.analyticsJobs(days),
    ])
      .then(([o, s, f, j]) => {
        setOverview(o);
        setSearch(s);
        setFunnel(f);
        setJobs(j.jobs);
        setStatusDist(j.statusDistribution);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setBusy(false));
  }, [days]);

  if (error) return <div className="card form-error">{error}</div>;
  if (busy || !overview || !search || !funnel) return <div className="page-loading">Loading analytics…</div>;

  const maxSearchDay = Math.max(...search.searchesOverTime.map((d) => d.count), 1);
  const statusTotal = statusDist.reduce((a, s) => a + s.count, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Admin Analytics Dashboard</h1>
          <p className="muted small">
            All figures computed from stored clickstream events — nothing hard-coded.
          </p>
        </div>
        <div className="row">
          <select
            style={{ width: 160 }}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Time window"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        {(["overview", "search", "funnel", "jobs"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(t)}
          >
            {t === "overview"
              ? "Overview"
              : t === "search"
                ? "Search Analytics"
                : t === "funnel"
                  ? "Application Funnel"
                  : "Job Analytics"}
          </button>
        ))}
      </div>

      {/* ------------------------------ OVERVIEW ------------------------------ */}
      {tab === "overview" && (
        <>
          <div className="grid grid-kpi">
            <div className="kpi">
              <div className="kpi-label">Total users</div>
              <div className="kpi-value">{overview.totals.users}</div>
              <div className="kpi-sub">
                {overview.totals.jobSeekers} seekers · {overview.totals.recruiters} recruiters
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Total jobs</div>
              <div className="kpi-value">{overview.totals.jobs}</div>
              <div className="kpi-sub">{overview.totals.activeJobs} active</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Total searches</div>
              <div className="kpi-value">{overview.totals.searches.toLocaleString()}</div>
              <div className="kpi-sub">{overview.totals.pageViews.toLocaleString()} page views</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Applications</div>
              <div className="kpi-value">{overview.totals.applications}</div>
              <div className="kpi-sub">{overview.totals.jobViews.toLocaleString()} job views</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Sessions</div>
              <div className="kpi-value">{overview.totals.sessions.toLocaleString()}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Search CTR</div>
              <div className="kpi-value">{overview.searchCtr}%</div>
              <div className="kpi-sub">search → job view</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Recommendation CTR</div>
              <div className="kpi-value">{overview.recommendationCtr}%</div>
              <div className="kpi-sub">impression → click</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Job saves</div>
              <div className="kpi-value">{overview.totals.jobSaves.toLocaleString()}</div>
            </div>
          </div>

          <div className="card mt">
            <h2>Platform summary</h2>
            <div className="grid grid-kpi">
              <div className="kpi">
                <div className="kpi-label">New users ({overview.windowDays}d)</div>
                <div className="kpi-value">{overview.totals.newUsersInWindow}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Rec. impressions</div>
                <div className="kpi-value">{overview.totals.recommendationImpressions.toLocaleString()}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Rec. clicks</div>
                <div className="kpi-value">{overview.totals.recommendationClicks.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------ SEARCH ------------------------------ */}
      {tab === "search" && (
        <>
          <div className="grid grid-kpi">
            <div className="kpi">
              <div className="kpi-label">Total searches</div>
              <div className="kpi-value">{search.totalSearches.toLocaleString()}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Unique queries</div>
              <div className="kpi-value">{search.uniqueQueries}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Search CTR</div>
              <div className="kpi-value">{search.searchCtr}%</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Zero-result searches</div>
              <div className="kpi-value">{search.zeroResultSearches}</div>
              <div className="kpi-sub">{search.zeroResultRate}% of searches</div>
            </div>
          </div>

          <div className="card mt">
            <h2>Searches over time</h2>
            <div className="bar-chart">
              {search.searchesOverTime.map((d) => (
                <div
                  key={d.date}
                  className="bar"
                  style={{ height: `${(d.count / maxSearchDay) * 100}%` }}
                  title={`${d.date}: ${d.count}`}
                />
              ))}
            </div>
            <div className="row spread muted small">
              <span>{search.searchesOverTime[0]?.date}</span>
              <span>{search.searchesOverTime[search.searchesOverTime.length - 1]?.date}</span>
            </div>
          </div>

          <div className="card mt">
            <h2>Top queries</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Query</th>
                    <th>Count</th>
                    <th>Zero results</th>
                  </tr>
                </thead>
                <tbody>
                  {search.topQueries.map((q, i) => (
                    <tr key={q.query}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <code>{q.query}</code>
                      </td>
                      <td>{q.count}</td>
                      <td>{q.zeroResults > 0 ? <span className="badge badge-danger">{q.zeroResults}</span> : "0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------ FUNNEL ------------------------------ */}
      {tab === "funnel" && (
        <>
          <div className="card">
            <h2>Application Funnel ({funnel.windowDays} days)</h2>
            <p className="muted small">
              Ordered per-session funnel: {funnel.unit}. A session reaches a stage only after passing
              the previous one.
            </p>
            {funnel.stages.map((s, i) => {
              const max = funnel.stages[0].count || 1;
              const prev = i > 0 ? funnel.stages[i - 1].count : null;
              return (
                <div key={s.stage} className="funnel-stage">
                  <div className="funnel-label">
                    <span>
                      {i + 1}. {s.stage} <span className="muted">({s.eventType})</span>
                    </span>
                    <span>
                      {s.count.toLocaleString()} sessions
                      {prev !== null && prev > 0 && (
                        <span className="muted"> · {Math.round((s.count / prev) * 100)}% of previous</span>
                      )}
                    </span>
                  </div>
                  <div
                    className="funnel-bar"
                    style={{ width: `${Math.max(4, (s.count / max) * 100)}%`, background: FUNNEL_COLORS[i % 4] }}
                  >
                    {s.count}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-2 mt">
            <div className="card">
              <h3>Conversion rates</h3>
              <div className="hbar-row"><span>Search → Job View</span><span>{funnel.conversions.searchToView}%</span></div>
              <div className="hbar-track"><div className="hbar-fill" style={{ width: `${funnel.conversions.searchToView}%` }} /></div>
              <div className="hbar-row"><span>Job View → Apply Start</span><span>{funnel.conversions.viewToApplyStart}%</span></div>
              <div className="hbar-track"><div className="hbar-fill" style={{ width: `${funnel.conversions.viewToApplyStart}%` }} /></div>
              <div className="hbar-row"><span>Apply Start → Submitted</span><span>{funnel.conversions.applyStartToSubmit}%</span></div>
              <div className="hbar-track"><div className="hbar-fill" style={{ width: `${funnel.conversions.applyStartToSubmit}%` }} /></div>
              <div className="hbar-row"><span>Overall (Search → Submitted)</span><span>{funnel.conversions.overall}%</span></div>
              <div className="hbar-track"><div className="hbar-fill" style={{ width: `${funnel.conversions.overall}%` }} /></div>
            </div>
            <div className="card">
              <h3>Drop-offs</h3>
              <table>
                <thead>
                  <tr><th>Stage transition</th><th>Drop-off</th></tr>
                </thead>
                <tbody>
                  {funnel.dropOffs.map((d) => (
                    <tr key={d.from}>
                      <td>{d.from} → {d.to}</td>
                      <td>
                        <span className="badge badge-danger">{d.dropOff}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small mt">
                Raw event counts: {funnel.eventCounts.searches} searches ·{" "}
                {funnel.eventCounts.jobViews} job views · {funnel.eventCounts.applyStarts} apply starts ·{" "}
                {funnel.eventCounts.applications} submissions
              </p>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------ JOBS ------------------------------ */}
      {tab === "jobs" && (
        <>
          <div className="card">
            <h2>Job performance (all jobs)</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Company</th>
                    <th>Location</th>
                    <th>Views</th>
                    <th>Saves</th>
                    <th>Applications</th>
                    <th>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 25).map((j) => (
                    <tr key={j.jobId}>
                      <td><strong>{j.title}</strong></td>
                      <td>{j.company}</td>
                      <td>{j.location}</td>
                      <td>{j.views}</td>
                      <td>{j.saves}</td>
                      <td>{j.applications}</td>
                      <td>{j.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card mt">
            <h2>Application status distribution</h2>
            {statusDist.map((s) => (
              <div key={s.status}>
                <div className="hbar-row">
                  <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-gray"}`}>{statusLabel(s.status)}</span>
                  <span className="muted">{s.count} ({statusTotal ? Math.round((s.count / statusTotal) * 100) : 0}%)</span>
                </div>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${statusTotal ? (s.count / statusTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
