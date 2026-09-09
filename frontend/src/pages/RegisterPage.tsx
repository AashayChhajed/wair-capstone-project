import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "JOB_SEEKER",
    companyName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.role === "RECRUITER" && form.companyName
          ? { companyName: form.companyName }
          : {}),
      });
      if (user.role === "ADMIN") navigate("/admin");
      else if (user.role === "RECRUITER") navigate("/recruiter");
      else navigate("/profile");
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = err.fields
          ? Object.values(err.fields).flat().join(", ")
          : null;
        setError(fieldErrors ? `${err.message}: ${fieldErrors}` : err.message);
      } else {
        setError("Registration failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h2>Create account</h2>
      <p className="muted small">Join JobScope Analytics as a seeker or recruiter.</p>

      {error && <div className="form-error mt">{error}</div>}

      <form className="form-grid mt" onSubmit={onSubmit}>
        <div>
          <label htmlFor="name">Full name</label>
          <input
            id="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Rahul Sharma"
            required
            minLength={2}
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </div>
        <div>
          <label htmlFor="role">I am a</label>
          <select id="role" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="JOB_SEEKER">Job seeker</option>
            <option value="RECRUITER">Recruiter</option>
          </select>
        </div>
        {form.role === "RECRUITER" && (
          <div>
            <label htmlFor="companyName">Company name</label>
            <input
              id="companyName"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="TechNova Solutions"
            />
          </div>
        )}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="small muted mt">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
