import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ApplicantRow, type RecruiterOverview } from "../api";
import { STATUS_BADGE, statusLabel, timeAgo } from "../format";

const STATUSES = ["APPLIED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "REJECTED", "HIRED"];

export default function RecruiterDashboardPage() {
  const [overview, setOverview] = useState<RecruiterOverview | null>(null);
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [o, a] = await Promise.all([
        api.recruiterOverview(),
        api.listRecruiterApplicants(statusFilter || undefined),
      ]);
      setOverview(o);
      setApplicants(a.applicants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setBusy(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(id: string, status: string) {
    await api.updateApplicationStatus(id, status);
    setApplicants((list) => list.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  if (busy && !overview) return <div className="page-loading">Loading recruiter dashboard…</div>;
  if (error) return <div className="card form-error">{error}</div>;
  if (!overview) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Recruiter Dashboard</h1>
          <p className="muted small">
            Per-job performance from real clickstream events over the last 30 days.
          </p>
        </div>
        <Link className="btn btn-primary" to="/recruiter/jobs/new">
          + Post a job
        </Link>
      </div>

      <div className="grid grid-kpi">
        <div className="kpi">
          <div className="kpi-label">Total views</div>
          <div className="kpi-value">{overview.totals.views.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Saves</div>
          <div className="kpi-value">{overview.totals.saves.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Applications</div>
          <div className="kpi-value">{overview.totals.applications.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Conversion rate</div>
          <div className="kpi-value">{overview.totals.conversionRate}%</div>
          <div className="kpi-sub">applications ÷ views</div>
        </div>
      </div>

      <div className="card mt">
        <h2>Job performance</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Location</th>
                <th>Views</th>
                <th>Saves</th>
                <th>Applications</th>
                <th>Conversion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overview.jobs.map((j) => (
                <tr key={j.jobId}>
                  <td>
                    <strong>{j.title}</strong>
                    <div className="muted small">{j.company}</div>
                  </td>
                  <td>{j.location}</td>
                  <td>{j.views}</td>
                  <td>{j.saves}</td>
                  <td>{j.applications}</td>
                  <td>
                    <span className={j.conversionRate >= 10 ? "badge badge-success" : "badge badge-gray"}>
                      {j.conversionRate}%
                    </span>
                  </td>
                  <td>
                    <Link className="btn btn-outline btn-sm" to={`/recruiter/jobs/${j.jobId}/analytics`}>
                      Analytics
                    </Link>
                  </td>
                </tr>
              ))}
              {overview.jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center" }}>
                    No jobs posted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt">
        <div className="row spread">
          <h2>Applicants</h2>
          <select
            style={{ width: 200 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Skills</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Update status</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.user.name}</strong>
                    <div className="muted small">{a.user.email}</div>
                    {a.user.profile?.experience !== null &&
                      a.user.profile?.experience !== undefined && (
                        <div className="muted small">{a.user.profile.experience} yrs exp</div>
                      )}
                  </td>
                  <td>{a.job.title}</td>
                  <td>
                    <div className="tags">
                      {(a.user.skills ?? []).slice(0, 4).map((s) => (
                        <span key={s.skill.name} className="tag">
                          {s.skill.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[a.status] ?? "badge-gray"}`}>
                      {statusLabel(a.status)}
                    </span>
                  </td>
                  <td className="muted small">{timeAgo(a.createdAt)}</td>
                  <td>
                    <select
                      value={a.status}
                      onChange={(e) => void changeStatus(a.id, e.target.value)}
                      style={{ width: 160 }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {applicants.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                    No applications yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
