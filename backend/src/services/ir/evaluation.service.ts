/**
 * IR evaluation service.
 *
 * The evaluation dataset is a small TREC-style qrels set: for each query, a
 * selector resolves a SMALL set of jobs in the live DB and those jobs carry a
 * manual relevance grade 0–3.
 *
 * How selectors work (important for academic honesty):
 *   - Seed jobs have deterministic titles ("Java Developer", "Senior Java
 *     Developer", "Backend Developer", "Frontend Developer", …) built from
 *     ROLE templates + title prefixes, in one of 7 known locations.
 *   - A selector is { titleIncludes, location? , notTitle? }: the FIRST job
 *     in the DB matching it gets the grade. This makes judgments stable
 *     across re-seeds without hard-coding database IDs.
 *   - The judgments themselves (which titles/locations are relevant for which
 *     query, and how strongly) are the MANUAL part — decided by us, exactly
 *     like a TREC qrels file, and documented in evalDataset.ts.
 *
 * For every query we then run the ACTUAL TF-IDF and BM25 indexes over the
 * ACTUAL corpus, take the top-10, grade each returned job (2 = relevant,
 * 0 = not judged / not relevant), and compute P@10, R@10, F1, MRR, NDCG@5,
 * NDCG@10 with the metrics in ir/metrics.ts. Every number shown in the UI is
 * computed from these live rankings — nothing is hard-coded.
 */

import { prisma } from "../../lib/prisma.js";
import { getIndex, type Algorithm } from "../search.service.js";
import { evaluateRanking, mean, type QueryMetrics } from "./metrics.js";

export interface RelevanceSelector {
  titleIncludes: string;
  location?: string;
  notTitle?: string;
}

export interface JudgedItem {
  selector: RelevanceSelector;
  grade: 0 | 1 | 2 | 3; // 3 highly relevant … 0 not relevant
}

export interface EvalQuery {
  id: string;
  query: string;
  /** Jobs judged relevant (grade ≥ 1), expressed as selectors. */
  judgments: JudgedItem[];
}

// ---------------------------------------------------------------- dataset
// Manual relevance judgments. Selector → the first DB job whose title
// contains titleIncludes (case-insensitive) and, if given, whose location
// equals location, and whose title does NOT contain notTitle.
export const EVAL_DATASET: EvalQuery[] = [
  {
    id: "q1",
    query: "Java Spring Boot developer Pune",
    judgments: [
      { selector: { titleIncludes: "Java Developer", location: "Pune" }, grade: 3 },
      { selector: { titleIncludes: "Backend Developer", location: "Pune" }, grade: 3 },
      { selector: { titleIncludes: "Java Developer", location: "Mumbai" }, grade: 2 },
      { selector: { titleIncludes: "Software Engineer", location: "Pune" }, grade: 1 },
    ],
  },
  {
    id: "q2",
    query: "Python developer Bangalore",
    judgments: [
      { selector: { titleIncludes: "Python Developer", location: "Bangalore" }, grade: 3 },
      { selector: { titleIncludes: "Data Analyst", location: "Bangalore" }, grade: 2 },
      { selector: { titleIncludes: "Data Scientist", location: "Bangalore" }, grade: 2 },
      { selector: { titleIncludes: "Full Stack Developer", location: "Bangalore" }, grade: 1 },
    ],
  },
  {
    id: "q3",
    query: "React frontend developer remote",
    judgments: [
      { selector: { titleIncludes: "Frontend Developer", location: "Remote" }, grade: 3 },
      { selector: { titleIncludes: "Full Stack Developer", location: "Remote" }, grade: 2 },
      { selector: { titleIncludes: "Frontend Developer", location: "Bangalore" }, grade: 1 },
    ],
  },
  {
    id: "q4",
    query: "DevOps engineer AWS",
    judgments: [
      { selector: { titleIncludes: "DevOps Engineer", location: "Bangalore" }, grade: 3 },
      { selector: { titleIncludes: "Cloud Engineer", location: "Hyderabad" }, grade: 2 },
      { selector: { titleIncludes: "DevOps Engineer", location: "Pune" }, grade: 3 },
    ],
  },
  {
    id: "q5",
    query: "machine learning engineer",
    judgments: [
      { selector: { titleIncludes: "Machine Learning Engineer", location: "Pune" }, grade: 3 },
      { selector: { titleIncludes: "Data Scientist", location: "Hyderabad" }, grade: 2 },
      { selector: { titleIncludes: "Machine Learning Engineer", location: "Mumbai" }, grade: 3 },
    ],
  },
  {
    id: "q6",
    query: "data analyst SQL",
    judgments: [
      { selector: { titleIncludes: "Data Analyst", location: "Pune" }, grade: 3 },
      { selector: { titleIncludes: "Data Analyst", location: "Mumbai" }, grade: 3 },
      { selector: { titleIncludes: "Software Engineer", location: "Chennai" }, grade: 1 },
    ],
  },
  {
    id: "q7",
    query: "QA engineer selenium",
    judgments: [
      { selector: { titleIncludes: "QA Engineer", location: "Delhi" }, grade: 3 },
      { selector: { titleIncludes: "QA Engineer", location: "Pune" }, grade: 3 },
    ],
  },
  {
    id: "q8",
    query: "full stack developer node.js",
    judgments: [
      { selector: { titleIncludes: "Full Stack Developer", location: "Pune" }, grade: 3 },
      { selector: { titleIncludes: "Full Stack Developer", location: "Bangalore" }, grade: 3 },
      { selector: { titleIncludes: "Frontend Developer", location: "Remote" }, grade: 1 },
    ],
  },
];

// ---------------------------------------------------------------- helpers

/**
 * Resolve one selector to ALL live jobs matching it. Judgments apply at the
 * document level (TREC-style): every job whose title matches the judged
 * pattern carries the grade, not just the first one found — otherwise
 * obviously relevant documents (e.g. "Senior Java Developer", Pune) would be
 * graded 0 while the top-10 is full of them, corrupting Precision.
 */
async function resolveSelector(sel: RelevanceSelector): Promise<{ id: string; title: string }[]> {
  const jobs = await prisma.job.findMany({
    where: {
      status: "ACTIVE",
      title: { contains: sel.titleIncludes, mode: "insensitive" },
      ...(sel.location ? { location: sel.location } : {}),
    },
    select: { id: true, title: true },
    orderBy: { postedAt: "desc" },
  });
  if (!sel.notTitle) return jobs;
  const needle = sel.notTitle.toLowerCase();
  return jobs.filter((j) => !j.title.toLowerCase().includes(needle));
}

export interface ResolvedJudgment {
  jobId: string;
  grade: number;
}

/**
 * Resolve all selectors of a query → jobId → grade map. When a job matches
 * several selectors (e.g. judged from two angles) the highest grade wins.
 */
export async function resolveJudgments(eq: EvalQuery): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const j of eq.judgments) {
    for (const job of await resolveSelector(j.selector)) {
      const existing = map.get(job.id) ?? 0;
      map.set(job.id, Math.max(existing, j.grade));
    }
  }
  return map;
}

// ---------------------------------------------------------------- evaluation

export interface PerQueryEval {
  queryId: string;
  query: string;
  algorithm: Algorithm;
  judgedRelevant: number; // corpus-wide # judged relevant (grade ≥ 2)
  retrieved: number; // top-k size actually returned
  metrics: QueryMetrics;
  rankedJobs: { rank: number; jobId: string; title: string; grade: number }[];
}

export interface AlgorithmEval {
  algorithm: Algorithm;
  meanMetrics: Omit<QueryMetrics, "k" | "relevantRetrieved">;
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

/**
 * Grade a ranked job: the manual judgment when one exists, otherwise 0.
 * Unjudged documents are treated as not relevant — the standard TREC "P&R
 * over unjudged = non-relevant" assumption, stated openly rather than hidden.
 */
function gradeForJob(jobId: string, judgments: Map<string, number>): number {
  return judgments.get(jobId) ?? 0;
}

/**
 * Run the full evaluation for both algorithms against the live index and the
 * manual qrels dataset.
 */
export async function runEvaluation(k = 10): Promise<EvaluationResult> {
  const index = await getIndex();
  const algorithms: Algorithm[] = ["tfidf", "bm25"];
  const kEff = Math.min(k, 10);

  // Resolve the qrels selectors ONCE per query (shared by both algorithms).
  const judgmentsByQuery = new Map<string, Map<string, number>>();
  for (const eq of EVAL_DATASET) {
    judgmentsByQuery.set(eq.id, await resolveJudgments(eq));
  }

  const perAlgorithm: AlgorithmEval[] = [];

  for (const algorithm of algorithms) {
    const perQuery: PerQueryEval[] = [];

    for (const eq of EVAL_DATASET) {
      const judgments = judgmentsByQuery.get(eq.id)!;

      // Actual ranking from the actual index (no shortcuts).
      const ranked =
        algorithm === "bm25"
          ? index.bm25.search(eq.query, kEff)
          : index.tfidf.search(eq.query, kEff);

      const rankedJobs = ranked.map((r, i) => {
        const detail = index.jobDetails.get(r.id);
        return {
          rank: i + 1,
          jobId: r.id,
          title: detail?.title ?? "(unknown)",
          grade: gradeForJob(r.id, judgments),
        };
      });

      const rankedGrades = rankedJobs.map((j) => j.grade);
      const allCorpusGrades = [...judgments.values()]; // corpus-wide judged grades

      perQuery.push({
        queryId: eq.id,
        query: eq.query,
        algorithm,
        judgedRelevant: allCorpusGrades.filter((g) => g >= 2).length,
        retrieved: rankedJobs.length,
        metrics: evaluateRanking(rankedGrades, allCorpusGrades, kEff),
        rankedJobs,
      });
    }

    perAlgorithm.push({
      algorithm,
      meanMetrics: {
        precision: Number(mean(perQuery.map((p) => p.metrics.precision)).toFixed(4)),
        recall: Number(mean(perQuery.map((p) => p.metrics.recall)).toFixed(4)),
        f1: Number(mean(perQuery.map((p) => p.metrics.f1)).toFixed(4)),
        mrr: Number(mean(perQuery.map((p) => p.metrics.mrr)).toFixed(4)),
        ndcg5: Number(mean(perQuery.map((p) => p.metrics.ndcg5)).toFixed(4)),
        ndcg10: Number(mean(perQuery.map((p) => p.metrics.ndcg10)).toFixed(4)),
      },
      perQuery,
    });
  }

  return {
    ranAt: new Date().toISOString(),
    corpusSize: index.tfidf.size,
    k: kEff,
    queries: EVAL_DATASET.length,
    algorithms: perAlgorithm,
    note:
      "Metrics computed live from the actual TF-IDF/BM25 rankings over the manual qrels dataset " +
      "(grades 0–3; binary metrics use grade ≥ 2; NDCG uses exponential gain with corpus-wide ideal). " +
      "P/R/F1 are @10.",
  };
}
