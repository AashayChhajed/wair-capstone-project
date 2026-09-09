import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EMPLOYMENT_LABEL, formatSalary, timeAgo } from "../format";
import type { Job } from "../types";

export default function SavedJobsPage() {
  const [jobs, setJobs] = useState<{ savedAt: string; job: Job }[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSavedJobs()
      .then((r) => setJobs(r.savedJobs))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load saved jobs"))
      .finally(() => setBusy(false));
  }, []);

  async function unsave(jobId: string) {
    await api.unsaveJob(jobId);
    setJobs((list) => list.filter((j) => j.job.id !== jobId));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Saved Jobs</h1>
          <p className="muted small">{jobs.length} saved</p>
        </div>
      </div>

      {error && <div className="card form-error">{error}</div>}
      {busy && <div className="page-loading">Loading…</div>}

      {!busy && jobs.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h3>No saved jobs</h3>
          <p className="muted small">Save jobs while browsing to revisit them here.</p>
          <Link to="/jobs" className="btn btn-primary mt">
            Browse jobs
          </Link>
        </div>
      )}

      <div className="grid grid-jobs">
        {jobs.map(({ job, savedAt }) => (
          <div key={job.id} className="card job-card">
            <div className="job-title">
              <Link to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                {job.title}
              </Link>
            </div>
            <div className="muted small">
              {job.company.name} · {job.location}
            </div>
            <div className="job-meta">
              <span>{EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}</span>
              <span>·</span>
              <span>{formatSalary(job.salaryMin, job.salaryMax)}</span>
            </div>
            <div className="row spread">
              <span className="muted small">Saved {timeAgo(savedAt)}</span>
              <div className="row">
                <Link className="btn btn-outline btn-sm" to={`/jobs/${job.id}`}>
                  View
                </Link>
                <button className="btn btn-danger btn-sm" onClick={() => void unsave(job.id)}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
