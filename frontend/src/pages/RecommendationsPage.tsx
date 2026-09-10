import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getSessionId } from "../tracking";
import { EMPLOYMENT_LABEL, formatSalary } from "../format";
import type { Recommendation } from "../types";

export default function RecommendationsPage() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .recommendations(getSessionId())
      .then((r) => {
        setRecs(r.recommendations);
        setWeights(r.weights);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load recommendations"))
      .finally(() => setBusy(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Recommended Jobs</h1>
          <p className="muted small">
            Content-based recommendations computed live from your profile.{" "}
            {weights &&
              `Weights: skills ${Math.round(weights.skills * 100)}% · role ${Math.round(
                weights.role * 100,
              )}% · location ${Math.round(weights.location * 100)}% · experience ${Math.round(
                weights.experience * 100,
              )}%`}
          </p>
        </div>
      </div>

      {error && <div className="card form-error">{error}</div>}
      {busy && <div className="page-loading">Computing recommendations…</div>}

      {!busy && recs.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h3>No recommendations yet</h3>
          <p className="muted small">
            Add skills and preferences to your <Link to="/profile">profile</Link> to get
            personalized job matches.
          </p>
        </div>
      )}

      <div className="grid grid-jobs">
        {recs.map((r) => (
          <div key={r.job.id} className="card job-card">
            <div className="row spread">
              <span className="badge badge-success">{r.matchPercent}% match</span>
              <span className="muted small">{EMPLOYMENT_LABEL[r.job.employmentType]}</span>
            </div>
            <Link to={`/jobs/${r.job.id}`} className="job-title" style={{ textDecoration: "none", color: "inherit" }}>
              {r.job.title}
            </Link>
            <div className="muted small">
              {r.job.companyName} · {r.job.location} · {formatSalary(r.job.salaryMin, r.job.salaryMax)}
            </div>

            <div className="score-bar">
              <div style={{ width: `${r.matchPercent}%` }} />
            </div>

            <div className="grid grid-kpi" style={{ gap: 6 }}>
              <div className="small">
                <span className="muted">Skills</span>
                <div className="score-bar">
                  <div style={{ width: `${r.skillPercent}%` }} />
                </div>
              </div>
              <div className="small">
                <span className="muted">Role</span>
                <div className="score-bar">
                  <div style={{ width: `${r.rolePercent}%` }} />
                </div>
              </div>
              <div className="small">
                <span className="muted">Location</span>
                <div className="score-bar">
                  <div style={{ width: `${r.locationPercent}%` }} />
                </div>
              </div>
              <div className="small">
                <span className="muted">Experience</span>
                <div className="score-bar">
                  <div style={{ width: `${r.experiencePercent}%` }} />
                </div>
              </div>
            </div>

            <div>
              <strong className="small">Why recommended:</strong>
              <ul className="explain-reasons">
                {r.explanation.reasons.length > 0 ? (
                  r.explanation.reasons.map((reason, i) => <li key={i}>{reason}</li>)
                ) : (
                  <li>General match with your profile</li>
                )}
              </ul>
            </div>

            <div className="tags">
              {r.explanation.matchedSkills.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>

            <Link className="btn btn-outline btn-sm" to={`/jobs/${r.job.id}`}>
              View job
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
