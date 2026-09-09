import type { Request, Response, NextFunction } from "express";
import {
  searchJobs,
  explainSearch,
  type Algorithm,
} from "../services/search.service.js";
import { trackEvent } from "../services/tracking.service.js";
import { badRequest } from "../lib/errors.js";
import { assignVariant, evaluateABTest, assignMissingVariants } from "../services/abtest.service.js";
import { runEvaluation } from "../services/ir/evaluation.service.js";

function parseAlgorithm(raw: unknown): Algorithm {
  if (raw === undefined || raw === "" || raw === "tfidf") return "tfidf";
  if (raw === "bm25") return "bm25";
  throw badRequest("Invalid algorithm: must be 'tfidf' or 'bm25'");
}

export const search = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? "");
    const algorithm: Algorithm = parseAlgorithm(req.query.algorithm);
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    // Phase 2: controlled query expansion — opt-in via ?expand=1
    const expand = req.query.expand === "1" || req.query.expand === "true";
    // Phase 4: A/B variant assignment (persisted per user; falls back to
    // deterministic hash assignment for anonymous sessions).
    let variant: "A" | "B" | null = null;
    if (req.user?.role === "JOB_SEEKER") {
      variant = await assignVariant(req.user.id);
    }

    const response = await searchJobs(q, algorithm, limit, {
      expand,
      personalizeForUserId: variant === "B" ? (req.user?.id ?? null) : null,
    });

    // Clickstream: record the SEARCH event with the result count so the
    // analytics module can compute zero-result searches and CTR. The A/B
    // variant travels in metadata for the experiment dashboard.
    await trackEvent({
      userId: req.user?.id ?? null,
      sessionId: (req.query.sessionId as string) ?? null,
      eventType: "SEARCH",
      searchQuery: q || null,
      metadata: {
        algorithm,
        resultCount: response.total,
        tookMs: response.tookMs,
        expanded: expand,
        abVariant: variant,
        filters: {
          location: req.query.location ?? null,
          employmentType: req.query.employmentType ?? null,
          experience: req.query.experience ?? null,
          salaryMin: req.query.salaryMin ?? null,
        },
      },
    });

    // FILTER_USED events when filters are actually applied.
    const filterKeys = ["location", "employmentType", "experience", "salaryMin"];
    for (const key of filterKeys) {
      if (req.query[key] !== undefined) {
        await trackEvent({
          userId: req.user?.id ?? null,
          sessionId: (req.query.sessionId as string) ?? null,
          eventType: "FILTER_USED",
          searchQuery: q || null,
          metadata: { filter: key, value: req.query[key] },
        });
      }
    }

    res.json({ ...response, abVariant: variant });
  } catch (err) {
    next(err);
  }
};

/** Explain endpoint powering the Search Intelligence page. */
export const explain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? "");
    const algorithm: Algorithm = parseAlgorithm(req.query.algorithm);
    const expand = req.query.expand === "1" || req.query.expand === "true";
    res.json(await explainSearch(q, algorithm, expand));
  } catch (err) {
    next(err);
  }
};

/** Phase 1: IR evaluation (admin) — run/recalculate metrics. */
export const evaluate = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await runEvaluation(10));
  } catch (err) {
    next(err);
  }
};

/** Phase 4: A/B experiment metrics (admin). */
export const abTestSummary = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await evaluateABTest());
  } catch (err) {
    next(err);
  }
};

/**
 * Phase 4 (admin): assign variants to users who don't have one yet so the
 * experiment covers the existing user base. Idempotent.
 */
export const abTestAssignMissing = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await assignMissingVariants());
  } catch (err) {
    next(err);
  }
};
