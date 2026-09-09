// API client — single fetch wrapper with Bearer auth and JSON error handling.

import type {
  ABTestResult,
  ExplainResponse,
  EvaluationResult,
  Job,
  Recommendation,
  SearchResponse,
  Skill,
  User,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string[]>;
  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function token(): string | null {
  return localStorage.getItem("token");
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const err = body as { error?: string; details?: Record<string, string[]> } | null;
    throw new ApiError(res.status, err?.error ?? `Request failed (${res.status})`, err?.details);
  }
  return body as T;
}

// ---------------------------------------------------------------- auth

export interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    companyName?: string;
  }) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  me: () => request<{ user: User }>("/auth/me"),
  listCompanies: () => request<{ companies: { id: string; name: string; location: string | null }[] }>("/companies"),

  // ---------------------------------------------------------------- profile

  getProfile: () => request<{ profile: User["profile"] }>("/profile"),
  updateProfile: (data: Record<string, unknown>) =>
    request<{ profile: User["profile"] }>("/profile", { method: "PUT", body: JSON.stringify(data) }),
  getSkills: () => request<{ skills: Skill[] }>("/skills"),

  // ---------------------------------------------------------------- jobs

  listJobs: (params: string) => request<{ jobs: Job[]; total: number }>(`/jobs?${params}`),
  getJob: (id: string) => request<{ job: Job }>(`/jobs/${id}`),
  createJob: (data: Record<string, unknown>) =>
    request<{ job: Job }>("/jobs", { method: "POST", body: JSON.stringify(data) }),
  updateJob: (id: string, data: Record<string, unknown>) =>
    request<{ job: Job }>(`/jobs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteJob: (id: string) => request<{ deleted: boolean }>(`/jobs/${id}`, { method: "DELETE" }),

  apply: (jobId: string, coverLetter?: string) =>
    request<{ application: unknown }>(`/jobs/${jobId}/apply`, {
      method: "POST",
      body: JSON.stringify({ coverLetter, sessionId: localStorage.getItem("sessionId") ?? undefined }),
    }),

  saveJob: (jobId: string) => request<{ saved: boolean }>(`/jobs/${jobId}/save`, { method: "POST" }),
  unsaveJob: (jobId: string) => request<{ saved: boolean }>(`/jobs/${jobId}/save`, { method: "DELETE" }),
  checkFlags: (jobIds: string[]) =>
    request<{ savedJobIds: string[]; appliedJobIds: string[] }>(
      `/saved-jobs/flags?jobIds=${jobIds.join(",")}`,
    ),
  listSavedJobs: () =>
    request<{ savedJobs: { savedAt: string; job: Job }[] }>("/saved-jobs"),

  listMyApplications: () => request<{ applications: ApplicationRow[] }>("/applications"),
  listRecruiterApplicants: (status?: string) =>
    request<{ applicants: ApplicantRow[] }>(`/recruiter/applicants${status ? `?status=${status}` : ""}`),
  updateApplicationStatus: (id: string, status: string) =>
    request<{ application: unknown }>(`/recruiter/applicants/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  // ---------------------------------------------------------------- search

  search: (q: string, algorithm: "tfidf" | "bm25", sessionId?: string, expand = false) =>
    request<SearchResponse>(
      `/search/jobs?q=${encodeURIComponent(q)}&algorithm=${algorithm}${
        sessionId ? `&sessionId=${sessionId}` : ""
      }${expand ? "&expand=1" : ""}`,
    ),

  explain: (q: string, algorithm: "tfidf" | "bm25", expand = false) =>
    request<ExplainResponse>(
      `/search/explain?q=${encodeURIComponent(q)}&algorithm=${algorithm}${expand ? "&expand=1" : ""}`,
    ),

  /** Phase 1: run/recalculate the IR evaluation (admin). */
  searchEvaluation: () => request<EvaluationResult>("/search/evaluation"),

  /** Phase 4: A/B experiment summary (admin). */
  abTestSummary: () => request<ABTestResult>("/abtest/summary"),
  /** Phase 4: assign variants to users who lack one (admin, idempotent). */
  abTestAssignMissing: () =>
    request<{ assigned: number }>("/abtest/assign-missing", { method: "POST" }),

  // ---------------------------------------------------------------- recommendations

  recommendations: (sessionId?: string) =>
    request<{ recommendations: Recommendation[]; weights: Record<string, number> }>(
      `/recommendations/jobs${sessionId ? `?sessionId=${sessionId}` : ""}`,
    ),

  // ---------------------------------------------------------------- tracking

  track: (eventType: string, extra: Record<string, unknown> = {}) =>
    request<{ event: { id: string } }>("/analytics/events", {
      method: "POST",
      body: JSON.stringify({ eventType, sessionId: localStorage.getItem("sessionId"), ...extra }),
    }),

  // ---------------------------------------------------------------- analytics (admin)

  analyticsOverview: (days = 30) => request<AnalyticsOverview>(`/analytics/overview?days=${days}`),
  analyticsSearch: (days = 30) => request<SearchAnalytics>(`/analytics/search?days=${days}`),
  analyticsFunnel: (days = 30) => request<FunnelAnalytics>(`/analytics/funnel?days=${days}`),
  analyticsJobs: (days = 30) =>
    request<{ jobs: JobAnalyticsRow[]; statusDistribution: StatusCount[] }>(`/analytics/jobs?days=${days}`),

  // ---------------------------------------------------------------- analytics (recruiter)

  recruiterOverview: (days = 30) => request<RecruiterOverview>(`/recruiter/overview?days=${days}`),
  recruiterJobAnalytics: (jobId: string, days = 30) =>
    request<RecruiterJobAnalytics>(`/recruiter/jobs/${jobId}/analytics?days=${days}`),
};

// ---------------------------------------------------------------- extra types

export interface ApplicationRow {
  id: string;
  status: string;
  createdAt: string;
  coverLetter?: string | null;
  job: Job;
}

export interface ApplicantRow {
  id: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    profile?: { location?: string | null; experience?: number | null; preferredRole?: string | null } | null;
    skills?: { skill: { name: string } }[];
  };
  job: { id: string; title: string };
}

export interface AnalyticsOverview {
  windowDays: number;
  totals: {
    users: number;
    jobSeekers: number;
    recruiters: number;
    jobs: number;
    activeJobs: number;
    applications: number;
    sessions: number;
    searches: number;
    jobViews: number;
    pageViews: number;
    recommendationImpressions: number;
    recommendationClicks: number;
    jobSaves: number;
    newUsersInWindow: number;
  };
  searchCtr: number;
  recommendationCtr: number;
}

export interface SearchAnalytics {
  windowDays: number;
  totalSearches: number;
  uniqueQueries: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  searchCtr: number;
  topQueries: { query: string; count: number; zeroResults: number }[];
  searchesOverTime: { date: string; count: number }[];
}

export interface FunnelAnalytics {
  windowDays: number;
  unit: string;
  stages: { stage: string; eventType: string; count: number }[];
  eventCounts: { searches: number; jobViews: number; applyStarts: number; applications: number };
  conversions: {
    searchToView: number;
    viewToApplyStart: number;
    applyStartToSubmit: number;
    viewToApplication: number;
    overall: number;
  };
  dropOffs: { from: string; to: string; dropOff: number }[];
}

export interface JobAnalyticsRow {
  jobId: string;
  title: string;
  company: string;
  location: string;
  status: string;
  views: number;
  saves: number;
  applications: number;
  conversionRate: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface RecruiterOverview {
  jobs: JobAnalyticsRow[];
  totals: { views: number; saves: number; applications: number; conversionRate: number };
}

export interface RecruiterJobAnalytics {
  job: { id: string; title: string; company: string; location: string; status: string; postedAt: string };
  kpis: { views: number; saves: number; applications: number; conversionRate: number };
  statusDistribution: StatusCount[];
  viewsOverTime: { date: string; count: number }[];
}
