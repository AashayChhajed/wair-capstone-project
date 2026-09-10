import { Component, useEffect } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { endSession, getSessionId, trackPageView } from "./tracking";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import ProfilePage from "./pages/ProfilePage";
import RecommendationsPage from "./pages/RecommendationsPage";
import ApplicationsPage from "./pages/ApplicationsPage";
import SavedJobsPage from "./pages/SavedJobsPage";
import RecruiterDashboardPage from "./pages/RecruiterDashboardPage";
import RecruiterJobAnalyticsPage from "./pages/RecruiterJobAnalyticsPage";
import JobFormPage from "./pages/JobFormPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import SearchEvaluationPage from "./pages/SearchEvaluationPage";
import SearchIntelligencePage from "./pages/SearchIntelligencePage";
import AbTestPage from "./pages/AbTestPage";
import HomePage from "./pages/HomePage";

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: JSX.Element }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <main className="main">
            <div className="card form-error">
              <h2>This page could not be displayed</h2>
              <p>{this.state.error.message}</p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireRole({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <LoginPage />;
  if (!roles.includes(user.role)) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h2>Access denied</h2>
        <p className="muted">This page requires role: {roles.join(" or ")}.</p>
      </div>
    );
  }
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="brand">
          JobScope <span className="brand-sub">Analytics</span>
        </NavLink>
        <div className="nav-links">
          <NavLink to="/jobs" className="nav-link">
            Jobs
          </NavLink>
          {user?.role === "JOB_SEEKER" && (
            <>
              <NavLink to="/recommendations" className="nav-link">
                Recommendations
              </NavLink>
              <NavLink to="/applications" className="nav-link">
                Applications
              </NavLink>
              <NavLink to="/saved" className="nav-link">
                Saved
              </NavLink>
              <NavLink to="/profile" className="nav-link">
                Profile
              </NavLink>
            </>
          )}
          {user?.role === "RECRUITER" && (
            <NavLink to="/recruiter" className="nav-link">
              Recruiter
            </NavLink>
          )}
          {user?.role === "ADMIN" && (
            <>
              <NavLink to="/admin" className="nav-link">
                Dashboard
              </NavLink>
              <NavLink to="/admin/search-evaluation" className="nav-link">
                Search Evaluation
              </NavLink>
              <NavLink to="/admin/abtest" className="nav-link">
                A/B Test
              </NavLink>
              <NavLink to="/intelligence" className="nav-link">
                Search Intelligence
              </NavLink>
            </>
          )}
          {!user && (
            <NavLink to="/intelligence" className="nav-link">
              Search Intelligence
            </NavLink>
          )}
        </div>
        <div className="nav-user">
          {user ? (
            <>
              <span className="muted">
                {user.name} · {user.role.replace("_", " ")}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => {
                  endSession();
                  logout();
                  navigate("/");
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="btn btn-outline">
                Login
              </NavLink>
              <NavLink to="/register" className="btn btn-primary">
                Register
              </NavLink>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    getSessionId();
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

function Shell() {
  return (
    <div className="app">
      <PageTracker />
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route
            path="/profile"
            element={
              <RequireRole roles={["JOB_SEEKER"]}>
                <ProfilePage />
              </RequireRole>
            }
          />
          <Route
            path="/recommendations"
            element={
              <RequireRole roles={["JOB_SEEKER"]}>
                <RecommendationsPage />
              </RequireRole>
            }
          />
          <Route
            path="/applications"
            element={
              <RequireRole roles={["JOB_SEEKER"]}>
                <ApplicationsPage />
              </RequireRole>
            }
          />
          <Route
            path="/saved"
            element={
              <RequireRole roles={["JOB_SEEKER"]}>
                <SavedJobsPage />
              </RequireRole>
            }
          />
          <Route
            path="/recruiter"
            element={
              <RequireRole roles={["RECRUITER"]}>
                <RecruiterDashboardPage />
              </RequireRole>
            }
          />
          <Route
            path="/recruiter/jobs/:id/analytics"
            element={
              <RequireRole roles={["RECRUITER"]}>
                <RecruiterJobAnalyticsPage />
              </RequireRole>
            }
          />
          <Route
            path="/recruiter/jobs/new"
            element={
              <RequireRole roles={["RECRUITER"]}>
                <JobFormPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole roles={["ADMIN"]}>
                <AdminDashboardPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/search-evaluation"
            element={
              <RequireRole roles={["ADMIN"]}>
                <SearchEvaluationPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/abtest"
            element={
              <RequireRole roles={["ADMIN"]}>
                <AbTestPage />
              </RequireRole>
            }
          />
          <Route path="/intelligence" element={<SearchIntelligencePage />} />
          <Route path="*" element={<div className="card">Page not found</div>} />
        </Routes>
      </main>
      <footer className="footer">
        Job Market Analytics Platform — TF-IDF vs BM25 · Content-based recommendations · Clickstream
        analytics
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
