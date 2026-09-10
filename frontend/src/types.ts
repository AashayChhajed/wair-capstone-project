// Shared types mirroring the backend API contract.

export type Role = "JOB_SEEKER" | "RECRUITER" | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  profile?: {
    location?: string | null;
    experience?: number | null;
    preferredRole?: string | null;
    preferredLocation?: string | null;
    bio?: string | null;
  } | null;
  skills?: { skill: { id: string; name: string } }[];
  companies?: { id: string; name: string }[];
}

export interface Skill {
  id: string;
  name: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  location: string;
  experienceRequired: number;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string;
  status?: string;
  postedAt: string;
  applicationDeadline?: string | null;
  companyId: string;
  company: { id: string; name: string; location?: string | null };
  skills: { id: string; name: string }[];
}

export interface SearchHit {
  rank: number;
  job: SearchJob;
  score: number;
  algorithm: "tfidf" | "bm25";
  matchedTerms: string[];
}

/** Lightweight job shape returned by the IR search index. */
export interface SearchJob {
  id: string;
  title: string;
  description: string;
  location: string;
  experienceRequired: number;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string;
  postedAt: string;
  companyName: string;
  skills: string[];
}

/** Phase 2: controlled query expansion result (dictionary-based). */
export interface ExpansionInfo {
  enabled: boolean;
  originalQuery: string;
  expandedQuery: string;
  applied: { from: string; to: string[] }[];
}

export interface SearchResponse {
  results: SearchHit[];
  total: number;
  query: string;
  processedQuery: string[];
  algorithm: "tfidf" | "bm25";
  tookMs: number;
  /** Phase 2: present when expansion was requested (?expand=1). */
  expansion?: ExpansionInfo;
  /** Phase 4: true when the A/B variant B personalization re-ranker changed the order. */
  personalized?: boolean;
  /** Phase 4: the A/B variant of the searching user (job seekers only). */
  abVariant?: "A" | "B" | null;
}

export interface TermStat {
  term: string;
  documentFrequency: number;
  corpusSize?: number;
  totalOccurrences: number;
  idfTfidf: number;
  idfBm25: number;
}

/** Phase 3: baseline rule-based intent classification (Broder taxonomy). */
export interface IntentResult {
  intent: "INFORMATIONAL" | "NAVIGATIONAL" | "TRANSACTIONAL";
  confidence: number;
  signals: string[];
}

export interface ExplainResponse {
  query: string;
  processedQuery: string[];
  /** Query actually sent to the ranker (after expansion when requested). */
  effectiveQuery: string;
  algorithm: "tfidf" | "bm25";
  corpusSize: number;
  indexBuiltAt: string;
  /** Phase 3: detected search intent (baseline rule-based classifier). */
  intent: IntentResult;
  /** Phase 2: expansion state for this analysis. */
  expansion: {
    requested: boolean;
    applied: { from: string; to: string[] }[];
    expandedQuery: string;
  };
  termStats: TermStat[];
  results: {
    rank: number;
    job: SearchJob;
    score: number;
    algorithm: string;
    matchedTerms: string[];
    explanation: {
      score: number;
      dotProduct?: number;
      queryNorm?: number;
      docNorm?: number;
      avgdl?: number;
      docLength?: number;
      k1?: number;
      b?: number;
      terms: {
        term: string;
        queryTf?: number;
        queryWeight?: number;
        docTf: number;
        docWeight?: number;
        idf: number;
        tfComponent?: number;
        contribution: number;
      }[];
    } | null;
  }[];
}

// ---------- Phase 1: IR evaluation ----------

export interface EvalRankedJob {
  rank: number;
  jobId: string;
  title: string;
  grade: number;
}

export interface EvalQueryMetrics {
  precision: number;
  recall: number;
  f1: number;
  mrr: number;
  ndcg5: number;
  ndcg10: number;
  relevantRetrieved: number;
  k: number;
}

export interface PerQueryEval {
  queryId: string;
  query: string;
  algorithm: "tfidf" | "bm25";
  judgedRelevant: number;
  retrieved: number;
  metrics: EvalQueryMetrics;
  rankedJobs: EvalRankedJob[];
}

export interface AlgorithmEval {
  algorithm: "tfidf" | "bm25";
  meanMetrics: {
    precision: number;
    recall: number;
    f1: number;
    mrr: number;
    ndcg5: number;
    ndcg10: number;
  };
  perQuery: PerQueryEval[];
}

export interface EvaluationResult {
  ranAt: string;
  corpusSize: number;
  k: number;
  queries: number;
  algorithms: AlgorithmEval[];
  note: string;
}

// ---------- Phase 4: A/B experiment ----------

export interface VariantMetrics {
  variant: "A" | "B";
  users: number;
  searchSessions: number;
  sessionsWithJobView: number;
  sessionsWithApplication: number;
  ctr: number;
  applyRate: number;
  totalSearches: number;
  totalJobViews: number;
  totalApplications: number;
}

export interface ABTestResult {
  experiment: string;
  description: string;
  startedAt: string | null;
  assignedUsers: number;
  variants: VariantMetrics[];
  delta: { ctr: number | null; applyRate: number | null };
  significance: {
    sufficientData: boolean;
    minSessionsPerVariant: number;
    note: string;
  };
}

export interface Recommendation {
  job: RecommendationJob;
  matchPercent: number;
  skillPercent: number;
  rolePercent: number;
  locationPercent: number;
  experiencePercent: number;
  explanation: {
    matchedSkills: string[];
    missingSkills: string[]; // <- included in backend but optional in UI
    roleMatch: { jobRole: string | null; preferredRole: string | null; score: number };
    locationMatch: { jobLocation: string; preferredLocation: string | null; score: number };
    experienceMatch: { jobRequires: number; candidateYears: number; score: number; reason: string };
    reasons: string[];
  };
}

/** Lightweight job shape returned by the recommendation service. */
export interface RecommendationJob {
  id: string;
  title: string;
  description: string;
  location: string;
  experienceRequired: number;
  companyName: string;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string;
  skills: string[];
}
