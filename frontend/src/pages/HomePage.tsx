import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Intelligent Job Search, Recommendation & Recruitment Analytics</h1>
          <p>
            A capstone project for Web Analytics and Information Retrieval — TF-IDF & BM25 ranking,
            explainable content-based recommendations, and full clickstream analytics.
          </p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>🔍 Information Retrieval Search</h2>
          <p className="muted small">
            Jobs are ranked with a real IR pipeline: tokenization → stop-word removal → light
            stemming → <strong>TF-IDF vector space model with cosine similarity</strong> and{" "}
            <strong>Okapi BM25</strong>. Compare both algorithms side by side on the same corpus.
          </p>
          <Link className="btn btn-primary mt" to="/jobs">
            Search jobs
          </Link>
          <Link className="btn btn-outline mt" to="/intelligence">
            Search Intelligence demo
          </Link>
        </div>

        <div className="card">
          <h2>🎯 Explainable Recommendations</h2>
          <p className="muted small">
            Content-based engine that scores every job against your skills, preferred role,
            location and experience — and tells you <em>why</em> it was recommended.
          </p>
          <Link className="btn btn-primary mt" to={user?.role === "JOB_SEEKER" ? "/recommendations" : "/login"}>
            View recommendations
          </Link>
        </div>

        <div className="card">
          <h2>📊 Clickstream Analytics</h2>
          <p className="muted small">
            Every search, view, save and application is tracked as an event. The admin dashboard
            computes KPIs, search analytics and the application funnel from real stored events —
            nothing is hard-coded.
          </p>
          <Link className="btn btn-outline mt" to={user?.role === "ADMIN" ? "/admin" : "/login"}>
            Admin dashboard
          </Link>
        </div>

        <div className="card">
          <h2>💼 Recruiter Analytics</h2>
          <p className="muted small">
            Per-job views, saves, applications and conversion rates, plus applicant tracking with
            status distribution (Applied → Hired).
          </p>
          <Link className="btn btn-outline mt" to={user?.role === "RECRUITER" ? "/recruiter" : "/login"}>
            Recruiter dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
