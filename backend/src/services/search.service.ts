/**
 * Search service — orchestrates the IR pipeline for job search.
 *
 * The corpus is rebuilt when job data changes (debounced) and cached in
 * memory. Both TF-IDF and BM25 share the same tokenization pipeline, so the
 * two algorithms can be compared apples-to-apples on the same corpus.
 *
 * Document text per job = title + description + skill names + location +
 * company name (weighted naturally by repetition in title/skills).
 */

import { prisma } from "../lib/prisma.js";
import { TfidfIndex, type ScoredResult } from "./ir/tfidf.js";
import { Bm25Index, type Bm25Result } from "./ir/bm25.js";
import { processQuery } from "./ir/tokenizer.js";
import { expandQuery, expansionForTerm, type ExpansionApplied } from "./ir/queryExpansion.js";
import { classifyIntent, type IntentResult } from "./ir/intent.js";

export type Algorithm = "tfidf" | "bm25";

interface SearchIndexBundle {
  tfidf: TfidfIndex;
  bm25: Bm25Index;
  jobDetails: Map<string, SearchableJob>;
  builtAt: Date;
}

export interface SearchableJob {
  id: string;
  title: string;
  description: string;
  location: string;
  companyName: string;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string;
  experienceRequired: number;
  postedAt: Date;
  skills: string[];
}

let cachedIndex: SearchIndexBundle | null = null;
let rebuildTimer: NodeJS.Timeout | null = null;
let rebuilding: Promise<void> | null = null;

/** Schedule an index rebuild (debounced, non-blocking). */
export function invalidateSearchIndex(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    rebuilding = buildIndex()
      .then((idx) => {
        cachedIndex = idx;
      })
      .catch((err) => {
        console.error("Failed to rebuild search index", err);
      });
  }, 250);
}

/** Build (or rebuild) the in-memory IR index from the jobs table. */
export async function buildIndex(): Promise<SearchIndexBundle> {
  const jobs = await prisma.job.findMany({
    where: { status: "ACTIVE" },
    include: {
      company: { select: { name: true } },
      skills: { include: { skill: { select: { name: true } } } },
    },
  });

  const jobDetails = new Map<string, SearchableJob>();
  const corpus = jobs.map((job) => {
    const skills = job.skills.map((s) => s.skill.name);
    const detail: SearchableJob = {
      id: job.id,
      title: job.title,
      description: job.description,
      location: job.location,
      companyName: job.company.name,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      employmentType: job.employmentType,
      experienceRequired: job.experienceRequired,
      postedAt: job.postedAt,
      skills,
    };
    jobDetails.set(job.id, detail);

    const text = [
      job.title,
      job.title, // title appears twice: gives it natural extra weight
      job.description,
      skills.join(" "),
      skills.join(" "), // skills weighted twice as well
      job.location,
      job.company.name,
    ].join(" ");

    return { id: job.id, text };
  });

  return {
    tfidf: new TfidfIndex(corpus),
    bm25: new Bm25Index(corpus),
    jobDetails,
    builtAt: new Date(),
  };
}

/** Get the cached index, building it on first use. */
export async function getIndex(): Promise<SearchIndexBundle> {
  if (cachedIndex) return cachedIndex;
  if (!rebuilding) {
    rebuilding = buildIndex().then((idx) => {
      cachedIndex = idx;
      rebuilding = null;
    });
  }
  await rebuilding;
  return cachedIndex!;
}

export interface SearchHit {
  rank: number;
  job: SearchableJob;
  score: number;
  algorithm: Algorithm;
  matchedTerms: string[];
}

export interface SearchResponse {
  results: SearchHit[];
  total: number;
  query: string;
  processedQuery: string[];
  algorithm: Algorithm;
  tookMs: number;
  /** Query expansion (Phase 2) — present when expansion was applied. */
  expansion?: {
    enabled: boolean;
    originalQuery: string;
    expandedQuery: string;
    applied: ExpansionApplied[];
  };
  /** Personalization (A/B variant B) — present for logged-in seekers. */
  personalized?: boolean;
}

export interface SearchOptions {
  /** Apply controlled synonym expansion (Phase 2). Default false. */
  expand?: boolean;
  /** Apply personalization boost (A/B variant B). Default false. */
  personalizeForUserId?: string | null;
}

/** Run a search with the requested algorithm and return ranked results. */
export async function searchJobs(
  query: string,
  algorithm: Algorithm = "tfidf",
  limit = 20,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const started = Date.now();
  const index = await getIndex();
  const processedQuery = processQuery(query);

  // ---- Controlled query expansion (Phase 2) ----------------------------
  const expand = options.expand ?? false;
  const expansion = expandQuery(query);
  const effectiveQuery = expand ? expansion.expandedQuery : query;
  const effectiveProcessed = processQuery(effectiveQuery);

  let scored: ScoredResult[] | Bm25Result[] = [];
  if (effectiveProcessed.length > 0) {
    scored =
      algorithm === "bm25"
        ? index.bm25.search(effectiveQuery, limit)
        : index.tfidf.search(effectiveQuery, limit);
  }

  let results: SearchHit[] = scored.map((r, i) => ({
    rank: i + 1,
    job: index.jobDetails.get(r.id) as SearchableJob,
    score: Number(r.score.toFixed(4)),
    algorithm,
    matchedTerms: r.matchedTerms,
  }));

  // ---- Personalization boost (A/B variant B) ---------------------------
  // Light per-job re-ranking ON TOP of the IR score: up to +15% multiplier
  // from profile signals (60% skill overlap, 40% location match). The IR
  // score remains the primary signal — a documented, bounded adjustment.
  let personalized = false;
  if (options.personalizeForUserId && results.length > 0) {
    const before = results.map((r) => r.job.id).join(",");
    results = await applyPersonalization(options.personalizeForUserId, results);
    personalized = results.map((r) => r.job.id).join(",") !== before;
  }

  const response: SearchResponse = {
    results,
    total: results.length,
    query,
    processedQuery: effectiveProcessed,
    algorithm,
    tookMs: Date.now() - started,
  };

  if (expand) {
    response.expansion = {
      enabled: true,
      originalQuery: query,
      expandedQuery: expansion.expandedQuery,
      applied: expansion.applied,
    };
  }
  if (personalized) response.personalized = true;

  return response;
}

/**
 * Apply the per-job personalization multiplier for variant B. The factor is
 * bounded at 15% and modulated by skill/location overlap per job; users
 * without profile signals get the identical ranking (no-op).
 */
export async function applyPersonalization(
  userId: string,
  hits: SearchHit[],
): Promise<SearchHit[]> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    include: { user: { include: { skills: { include: { skill: { select: { name: true } } } } } } },
  });
  const userSkills = new Set((profile?.user.skills ?? []).map((s) => s.skill.name.toLowerCase()));
  const preferredLocation = profile?.preferredLocation?.toLowerCase() ?? null;
  if (userSkills.size === 0 && !preferredLocation) return hits; // nothing to personalize with

  return hits
    .map((hit) => {
      const jobSkills = hit.job.skills.map((s) => s.toLowerCase());
      const overlap = jobSkills.filter((s) => userSkills.has(s)).length;
      const skillRatio = jobSkills.length === 0 ? 0 : overlap / jobSkills.length;
      const locMatch =
        preferredLocation && hit.job.location.toLowerCase() === preferredLocation ? 1 : 0;
      // up to +0.15: 60% weight on skills, 40% on location
      const factor = 0.15 * (0.6 * skillRatio + 0.4 * locMatch);
      return { ...hit, score: Number((hit.score * (1 + factor)).toFixed(4)) };
    })
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Full explanation of a query for the Search Intelligence page: processed
 * query, per-term IDF statistics, ranked results and per-result term
 * contribution breakdown. Also reports query expansion (Phase 2) and the
 * detected search intent (Phase 3, rule-based baseline).
 */
export async function explainSearch(query: string, algorithm: Algorithm = "tfidf", expand = false) {
  const index = await getIndex();
  const processedQuery = processQuery(query);

  const expansion = expandQuery(query);
  const effectiveQuery = expand ? expansion.expandedQuery : query;

  const intent: IntentResult = classifyIntent(query);

  const scored =
    algorithm === "bm25"
      ? index.bm25.search(effectiveQuery, 20)
      : index.tfidf.search(effectiveQuery, 20);

  const termStats = processedQuery.map((term) => ({
    term,
    documentFrequency: index.tfidf.documentFrequencyFor(term),
    totalOccurrences: index.tfidf.totalOccurrences(term),
    idfTfidf: Number(index.tfidf.idf(term).toFixed(4)),
    idfBm25: Number(index.bm25.idf(term).toFixed(4)),
    expansion: expansionForTerm(term),
  }));

  const results = scored.map((r, i) => {
    const explanation =
      algorithm === "bm25"
        ? index.bm25.explain(query, r.id)
        : index.tfidf.explain(query, r.id);
    return {
      rank: i + 1,
      job: index.jobDetails.get(r.id) as SearchableJob,
      score: Number(r.score.toFixed(4)),
      algorithm,
      matchedTerms: r.matchedTerms,
      explanation,
    };
  });

  return {
    query,
    processedQuery,
    effectiveQuery: expand ? expansion.expandedQuery : query,
    algorithm,
    corpusSize: index.tfidf.size,
    indexBuiltAt: index.builtAt,
    expansion: {
      requested: expand,
      applied: expansion.applied,
      expandedQuery: expansion.expandedQuery,
    },
    intent,
    termStats,
    results,
  };
}
