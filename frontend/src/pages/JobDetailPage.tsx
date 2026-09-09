import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { EMPLOYMENT_LABEL, formatSalary, timeAgo } from "../format";
import type { Job } from "../types";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [showApply, setShowApply] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { job } = await api.getJob(id);
      setJob(job);
      // Clickstream: JOB_VIEW (fires once per page load).
      api
        .track("JOB_VIEW", { jobId: id, metadata: { source: "direct" } })
        .catch(() => undefined);
      if (user) {
        const flags = await api.checkFlags([id]);
        setSaved(flags.savedJobIds.includes(id));
        setApplied(flags.appliedJobIds.includes(id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
    }
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleSave() {
    if (!id || !job) return;
    if (!user) return navigate("/login");
    setBusy(true);
    try {
      if (saved) {
        await api.unsaveJob(id);
        setSaved(false);
      } else {
        await api.saveJob(id);
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitApply(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!user) return navigate("/login");
    setBusy(true);
    setError(null);
    try {
      // APPLY_START fires when the user opens the apply form.
      await api.track("APPLY_START", { jobId: id });
      await api.apply(id, coverLetter || undefined);
      setApplied(true);
      setShowApply(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Application failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !job) return <div className="card form-error">{error}</div>;
  if (!job) return <div className="page-loading">Loading job…</div>;

  return (
    <div>
      <div className="row spread">
        <Link to="/jobs" className="muted small" style={{ textDecoration: "none" }}>
          ← Back to search
        </Link>
        <span className="badge badge-gray">{job.status ?? "ACTIVE"}</span>
      </div>

      {error && <div className="form-error mt">{error}</div>}

      <div className="card mt">
        <div className="row spread" style={{ alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>{job.title}</h1>
            <div className="muted mt">
              {job.company.name} · {job.location} · posted {timeAgo(job.postedAt)}
            </div>
          </div>
          <div className="row">
            {user?.role === "JOB_SEEKER" && (
              <>
                <button className="btn btn-outline" onClick={toggleSave} disabled={busy}>
                  {saved ? "★ Saved" : "☆ Save job"}
                </button>
                {applied ? (
                  <span className="badge badge-success" style={{ padding: "8px 16px" }}>
                    ✓ Applied
                  </span>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setShowApply(true);
                      api.track("APPLY_START", { jobId: job.id }).catch(() => undefined);
                    }}
                  >
                    Apply now
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-kpi mt">
          <div className="kpi">
            <div className="kpi-label">Salary</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {formatSalary(job.salaryMin, job.salaryMax)}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Experience</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {job.experienceRequired}+ yrs
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Type</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}
            </div>
          </div>
          {job.applicationDeadline && (
            <div className="kpi">
              <div className="kpi-label">Apply by</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>
                {new Date(job.applicationDeadline).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        <h3 className="mt">Job description</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>

        <h3>Skills required</h3>
        <div className="tags">
          {job.skills.map((s) => (
            <span key={s.id} className="tag">
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {showApply && !applied && (
        <div className="card mt">
          <h3>Apply to {job.title}</h3>
          <form className="form-grid mt" onSubmit={submitApply}>
            <div>
              <label htmlFor="cover">Cover letter (optional)</label>
              <textarea
                id="cover"
                rows={5}
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="Tell the recruiter why you're a great fit…"
              />
            </div>
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit application"}
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setShowApply(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
