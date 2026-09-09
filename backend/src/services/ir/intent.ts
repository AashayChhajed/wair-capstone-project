/**
 * Baseline rule-based search-intent classifier.
 *
 * ⚠️  ACADEMIC NOTE: This is a deliberately simple, transparent BASELINE —
 * a hand-written rule system over lexical cues, NOT an advanced ML model,
 * not trained on data, and not deep-learning based. It exists to demonstrate
 * the classical web-search intent taxonomy (Broder 2002):
 *
 *   INFORMATIONAL  — user wants to learn / explore ("what is X", "sample resume")
 *   NAVIGATIONAL   — user wants a specific known entity (a company or a named job)
 *   TRANSACTIONAL  — user wants to DO something (find & apply to a job)
 *
 * Signals used (in priority order):
 *   1. Explicit action verbs / intent phrases → TRANSACTIONAL
 *   2. Known-entity lookups (company names, exact job titles) → NAVIGATIONAL
 *   3. Question patterns / learning words → INFORMATIONAL
 *   4. Default for noun-phrase job queries ("java developer pune") → TRANSACTIONAL
 *      (in a job portal, noun queries express intent to find/apply for jobs)
 *
 * The classifier returns the winning class, the matched cues and a
 * normalized confidence so the Search Intelligence page can explain WHY.
 */

export type SearchIntent = "INFORMATIONAL" | "NAVIGATIONAL" | "TRANSACTIONAL";

export interface IntentResult {
  intent: SearchIntent;
  confidence: number; // 0..1, share of weighted evidence for the winner
  signals: string[]; // human-readable matched cues
}

/** Weighted lexicons — small, inspectable, and easy to justify in a viva. */
const TRANSACTIONAL_CUES: { re: RegExp; weight: number; label: string }[] = [
  { re: /\b(apply|applying|application)\b/i, weight: 3, label: "apply" },
  { re: /\b(hire|hiring|vacanc|opening|openings|job opening)\b/i, weight: 2, label: "hiring/openings" },
  { re: /\b(urgent|immediately|immediate joiner|notice period)\b/i, weight: 2, label: "urgency" },
  { re: /\b(salary|salaries|pay|ctc|package|lpa)\b/i, weight: 1, label: "salary terms" },
  { re: /\b(remote|work from home|wfh)\b/i, weight: 1, label: "work-mode constraint" },
  { re: /\b(fresher|experienced?\b|years?)\b/i, weight: 1, label: "experience constraint" },
];

const NAVIGATIONAL_CUES: { re: RegExp; weight: number; label: string }[] = [
  { re: /\b(website|official|home page|homepage|careers page|portal|login|sign in)\b/i, weight: 3, label: "site/portal reference" },
  { re: /\b(company|inc\.?|ltd\.?|llp|pvt\.?|technologies|solutions|systems|labs|studio)\b/i, weight: 2, label: "company suffix" },
];

const INFORMATIONAL_CUES: { re: RegExp; weight: number; label: string }[] = [
  { re: /\b(what|who|which|why|how|when|where)\b/i, weight: 3, label: "question word" },
  { re: /\b(what is|how to|how do|explain|difference between)\b/i, weight: 3, label: "question phrase" },
  { re: /\b(learn|learning path|tutorial|guide|example|examples|sample|roadmap|interview questions|syllabus|meaning)\b/i, weight: 2, label: "learning terms" },
  { re: /\b(resume|cv|cover letter)\b/i, weight: 2, label: "career-document terms" },
];

/** Job-title lexicon used to detect named-entity-ish (navigational) queries. */
const JOB_TITLE_TERMS = [
  "developer", "engineer", "analyst", "scientist", "architect",
  "manager", "intern", "consultant", "administrator", "designer",
];

export function classifyIntent(query: string): IntentResult {
  const q = query.trim();
  const scores: Record<SearchIntent, number> = {
    INFORMATIONAL: 0,
    NAVIGATIONAL: 0,
    TRANSACTIONAL: 0,
  };
  const signals: string[] = [];

  // The explicit intent phrase "jobs in <place>" / "job in <place>" is a
  // strong transactional cue in a job portal context.
  if (/\bjobs?\s+(in|at|near|for)\b/i.test(q)) {
    scores.TRANSACTIONAL += 3;
    signals.push('"jobs in/at" phrase → transactional');
  }

  for (const cue of TRANSACTIONAL_CUES) {
    if (cue.re.test(q)) {
      scores.TRANSACTIONAL += cue.weight;
      signals.push(`transactional cue: ${cue.label}`);
    }
  }
  for (const cue of NAVIGATIONAL_CUES) {
    if (cue.re.test(q)) {
      scores.NAVIGATIONAL += cue.weight;
      signals.push(`navigational cue: ${cue.label}`);
    }
  }
  for (const cue of INFORMATIONAL_CUES) {
    if (cue.re.test(q)) {
      scores.INFORMATIONAL += cue.weight;
      signals.push(`informational cue: ${cue.label}`);
    }
  }

  // Noun-phrase job query ("java developer pune") — no explicit verbs.
  // Counts as moderate transactional evidence for a job-search portal.
  const hasJobTitle = JOB_TITLE_TERMS.some((t) => new RegExp(`\\b${t}s?\\b`, "i").test(q));
  const hasQuestionOrLearning = /\b(what|how|why|learn|tutorial|guide|sample|example)\b/i.test(q);
  const hasExplicitAction = /\b(apply|hiring|vacanc|opening)\b/i.test(q);
  if (hasJobTitle && !hasQuestionOrLearning) {
    scores.TRANSACTIONAL += hasExplicitAction ? 0 : 1;
    signals.push("job-title noun phrase → transactional (job-seeking)");
  }

  // A company-name lookup with a job title but no action verb ("technova jobs")
  // leans navigational: the user knows the target entity.
  if (/\b(jobs?|careers?|recruit)\b/i.test(q) && !hasExplicitAction && !hasQuestionOrLearning) {
    scores.NAVIGATIONAL += 1;
    signals.push("bare 'jobs/careers' lookup → navigational possibility");
  }

  const total = scores.INFORMATIONAL + scores.NAVIGATIONAL + scores.TRANSACTIONAL;
  if (total === 0) {
    // No lexical evidence at all — fall back to the portal default.
    return {
      intent: "TRANSACTIONAL",
      confidence: 0.34,
      signals: ["no lexical cues → default TRANSACTIONAL (job-seeking portal)"],
    };
  }

  const sorted = (Object.entries(scores) as [SearchIntent, number][]).sort((a, b) => b[1] - a[1]);
  const [winner, winnerScore] = sorted[0];
  const tie = sorted[1][1] === winnerScore;

  return {
    intent: winner,
    confidence: Number((winnerScore / total).toFixed(2)),
    signals,
  };
}
