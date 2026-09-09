import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ApplicationRow } from "../api";
import { STATUS_BADGE, statusLabel, timeAgo } from "../format";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMyApplications()
      .then((r) => setApps(r.applications))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load applications"))
      .finally(() => setBusy(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Applications</h1>
          <p className="muted small">{apps.length} application{apps.length === 1 ? "" : "s"} submitted</p>
        </div>
      </div>

      {error && <div className="card form-error">{error}</div>}
      {busy && <div className="page-loading">Loading…</div>}

      {!busy && apps.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h3>No applications yet</h3>
          <p className="muted small">
            Find a job you like and hit <strong>Apply</strong>.
          </p>
          <Link to="/jobs" className="btn btn-primary mt">
            Browse jobs
          </Link>
        </div>
      )}

      {apps.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Company</th>
                <th>Location</th>
                <th>Status</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/jobs/${a.job.id}`} style={{ textDecoration: "none" }}>
                      <strong>{a.job.title}</strong>
                    </Link>
                  </td>
                  <td>{a.job.company.name}</td>
                  <td>{a.job.location}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[a.status] ?? "badge-gray"}`}>
                      {statusLabel(a.status)}
                    </span>
                  </td>
                  <td className="muted small">{timeAgo(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
