import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";

const DEMO_ACCOUNTS = [
  { label: "Job Seeker", email: "demo.seeker@example.com" },
  { label: "Recruiter", email: "demo.recruiter@example.com" },
  { label: "Admin", email: "demo.admin@example.com" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doLogin(mail: string, pass: string) {
    setError(null);
    setBusy(true);
    try {
      const user = await login(mail, pass);
      if (user.role === "ADMIN") navigate("/admin");
      else if (user.role === "RECRUITER") navigate("/recruiter");
      else navigate("/jobs");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h2>Sign in</h2>
      <p className="muted small">Welcome back to JobScope Analytics.</p>

      {error && <div className="form-error mt">{error}</div>}

      <form
        className="form-grid mt"
        onSubmit={(e) => {
          e.preventDefault();
          void doLogin(email, password);
        }}
      >
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="demo-box mt">
        <strong>Demo accounts</strong> — password{" "}
        <code>Password123!</code>
        <div className="mt" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {DEMO_ACCOUNTS.map((d) => (
            <button
              key={d.email}
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() => void doLogin(d.email, "Password123!")}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <p className="small muted mt">
        No account? <Link to="/register">Register here</Link>
      </p>
    </div>
  );
}
