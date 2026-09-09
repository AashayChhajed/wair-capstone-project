import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type RecruiterJobAnalytics } from "../api";
import { STATUS_BADGE, statusLabel } from "../format";

export default function RecruiterJobAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RecruiterJobAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api.recruiterJobAnalytics(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="card form-error">{error}</div>;
  if (!data) return <div className="page-loading">Loading job analytics…</div>;

  const maxViews = Math.max(...data.viewsOverTime.map((d) => d.count), 1);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/recruiter" className="muted small" style={{ textDecoration: "none" }}>
            ← Back to recruiter dashboard
          </Link>
          <h1 className="mt">{data.job.title}</h1>
          <p className="muted small">
            {data.job.company} · {data.job.location} · {data.job.status}
          </p>
        </div>
      </div>

      <div className="grid grid-kpi">
        <div className="kpi">
          <div className="kpi-label">Views</div>
          <div className="kpi-value">{data.kpis.views.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Saves</div>
          <div className="kpi-value">{data.kpis.saves.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Applications</div>
          <div className="kpi-value">{data.kpis.applications.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Conversion rate</div>
          <div className="kpi-value">{data.kpis.conversionRate}%</div>
          <div className="kpi-sub">applications ÷ views</div>
        </div>
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <h2>Views over time (30 days)</h2>
          {data.kpis.views === 0 ? (
            <p className="muted small">No views recorded in this window yet.</p>
          ) : (
            <div className="bar-chart">
              {data.viewsOverTime.map((d) => (
                <div
                  key={d.date}
                  className="bar"
                  style={{ height: `${(d.count / maxViews) * 100}%` }}
                  title={`${d.date}: ${d.count} views`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Application status distribution</h2>
          {data.statusDistribution.length === 0 ? (
            <p className="muted small">No applications yet.</p>
          ) : (
            data.statusDistribution.map((s) => {
              const total = data.statusDistribution.reduce((acc, x) => acc + x.count, 0);
              return (
                <div key={s.status}>
                  <div className="hbar-row">
                    <span>
                      <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-gray"}`}>
                        {statusLabel(s.status)}
                      </span>
                    </span>
                    <span className="muted">
                      {s.count} ({Math.round((s.count / total) * 100)}%)
                    </span>
                    <div className="hbar-track">
                      <div className="hbar-fill" style={{ width: `${(s.count / total) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
