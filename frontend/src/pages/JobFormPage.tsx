import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";

const SKILL_SUGGESTIONS = [
  "Java", "Spring Boot", "SQL", "REST APIs", "Python", "React", "TypeScript",
  "JavaScript", "Node.js", "Docker", "Kubernetes", "AWS", "PostgreSQL",
  "MongoDB", "Microservices", "Machine Learning", "Pandas", "TensorFlow",
  "Selenium", "CI/CD",
];
const LOCATIONS = ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Delhi", "Chennai", "Remote"];

export default function JobFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "Pune",
    experienceRequired: 2,
    salaryMin: 600000,
    salaryMax: 1200000,
    employmentType: "FULL_TIME",
    skills: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSkill(name: string) {
    set("skills", form.skills.includes(name) ? form.skills.filter((s) => s !== name) : [...form.skills, name]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createJob({ ...form });
      navigate("/recruiter");
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = err.fields ? Object.values(err.fields).flat().join(", ") : null;
        setError(fieldErrors ? `${err.message}: ${fieldErrors}` : err.message);
      } else {
        setError("Failed to create job");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Post a Job</h1>
          <p className="muted small">
            New jobs are indexed immediately and appear in TF-IDF/BM25 search results.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <form className="card" onSubmit={onSubmit}>
        <div className="grid grid-2">
          <div>
            <label htmlFor="title">Job title</label>
            <input
              id="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Java Developer"
              required
              minLength={3}
            />
          </div>
          <div>
            <label htmlFor="location">Location</label>
            <select id="location" value={form.location} onChange={(e) => set("location", e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="exp">Experience required (years)</label>
            <input
              id="exp"
              type="number"
              min={0}
              max={30}
              value={form.experienceRequired}
              onChange={(e) => set("experienceRequired", Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="type">Employment type</label>
            <select
              id="type"
              value={form.employmentType}
              onChange={(e) => set("employmentType", e.target.value)}
            >
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERNSHIP">Internship</option>
            </select>
          </div>
          <div>
            <label htmlFor="salMin">Salary min (₹/year)</label>
            <input
              id="salMin"
              type="number"
              min={0}
              step={50000}
              value={form.salaryMin}
              onChange={(e) => set("salaryMin", Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="salMax">Salary max (₹/year)</label>
            <input
              id="salMax"
              type="number"
              min={0}
              step={50000}
              value={form.salaryMax}
              onChange={(e) => set("salaryMax", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt">
          <label htmlFor="desc">Description</label>
          <textarea
            id="desc"
            rows={6}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Describe the role, responsibilities, and what a strong candidate looks like…"
            required
            minLength={30}
          />
        </div>

        <div className="mt">
          <label>Skills (select at least one)</label>
          <div className="tags mt" style={{ gap: 8 }}>
            {SKILL_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSkill(s)}
                className={`btn btn-sm ${form.skills.includes(s) ? "btn-primary" : "btn-outline"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="row mt">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Posting…" : "Publish job"}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => navigate("/recruiter")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
