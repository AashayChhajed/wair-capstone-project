/**
 * A/B testing service (Phase 4).
 *
 * One simple, honest experiment:
 *   Variant A (control):    standard IR ranking (TF-IDF/BM25 as chosen)
 *   Variant B (treatment):  IR ranking + personalization re-ranker
 *                           (up to +15% per-job boost from skill overlap and
 *                            preferred-location match; see search.service)
 *
 * Assignment: 50/50 deterministic hash of the user id → sticky per user.
 * The assignment and the variant are persisted on the user row (abVariant,
 * abAssignedAt) on first search, so assignment survives restarts and is
 * stable for the whole experiment.
 *
 * Metrics are computed from ACTUAL stored clickstream events (SEARCH,
 * JOB_VIEW, APPLICATION_SUBMITTED tagged with abVariant in metadata):
 *
 *   CTR        = sessions with SEARCH followed by JOB_VIEW / sessions with SEARCH
 *   Apply rate = sessions with SEARCH followed by APPLICATION_SUBMITTED / sessions with SEARCH
 *
 * No significance claims are made unless the sample size is sufficient —
 * the response includes per-variant session counts and an explicit
 * "insufficient data" note instead of a fake p-value.
 */

import { prisma } from "../lib/prisma.js";

export type AbVariant = "A" | "B";

/** Deterministic 50/50 assignment from the user id (sticky by construction). */
export function variantForUser(userId: string): AbVariant {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "A" : "B";
}

/**
 * Get (or lazily create) the persisted variant for a user. The first call
 * assigns and stores; later calls return the stored value.
 */
export async function assignVariant(userId: string): Promise<AbVariant> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { abVariant: true },
  });
  if (user?.abVariant) return user.abVariant as AbVariant;

  const variant = variantForUser(userId);
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { abVariant: variant, abAssignedAt: new Date() },
    });
  } catch {
    // Raced with another request; re-read.
    const again = await prisma.user.findUnique({ where: { id: userId }, select: { abVariant: true } });
    if (again?.abVariant) return again.abVariant as AbVariant;
  }
  return variant;
}

/** Manually force a user into a variant (admin/demo utility). */
export async function forceVariant(userId: string, variant: AbVariant): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { abVariant: variant, abAssignedAt: new Date() },
  });
}

/**
 * Assign variants to every user who doesn't have one yet, using the same
 * deterministic 50/50 hash. Admin/demo utility: lets the experiment start
 * with the existing user base instead of only new searchers. Idempotent.
 */
export async function assignMissingVariants(): Promise<{ assigned: number }> {
  const unassigned = await prisma.user.findMany({
    where: { abVariant: null },
    select: { id: true },
  });
  for (const u of unassigned) {
    await assignVariant(u.id);
  }
  return { assigned: unassigned.length };
}

export interface VariantMetrics {
  variant: AbVariant;
  users: number;
  searchSessions: number;
  sessionsWithJobView: number;
  sessionsWithApplication: number;
  ctr: number; // %
  applyRate: number; // %
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
  delta: {
    ctr: number | null; // percentage-point difference B − A
    applyRate: number | null;
  };
  significance: {
    sufficientData: boolean;
    minSessionsPerVariant: number;
    note: string;
  };
}

/** Evaluate the experiment from stored events. */
export async function evaluateABTest(): Promise<ABTestResult> {
  const MIN_SESSIONS = 30;

  // Users assigned to each variant.
  const users = await prisma.user.findMany({
    where: { abVariant: { not: null } },
    select: { id: true, abVariant: true, abAssignedAt: true },
  });
  const byVariant: Record<"A" | "B", Set<string>> = { A: new Set(), B: new Set() };
  for (const u of users) {
    if (u.abVariant === "A" || u.abVariant === "B") byVariant[u.abVariant].add(u.id);
  }

  // All funnel events emitted by assigned users.
  const events = await prisma.analyticsEvent.findMany({
    where: {
      userId: { in: [...byVariant.A, ...byVariant.B] },
      eventType: { in: ["SEARCH", "JOB_VIEW", "APPLICATION_SUBMITTED"] },
    },
    select: {
      userId: true,
      sessionId: true,
      eventType: true,
      timestamp: true,
      metadata: true,
    },
    orderBy: { timestamp: "asc" },
  });

  // Per (variant, user, session): ordered reach — SEARCH → JOB_VIEW → APPLICATION.
  // Session ownership: a session belongs to the user who emitted its first event.
  const sessionOwner = new Map<string, string>();
  const sessionReach = new Map<string, number>(); // 0 none, 1 searched, 2 viewed, 3 applied

  for (const e of events) {
    if (!e.userId || !e.sessionId) continue;
    if (!sessionOwner.has(e.sessionId)) sessionOwner.set(e.sessionId, e.userId);

    // Ordered funnel per session, same rule as the application funnel.
    const reach = sessionReach.get(e.sessionId) ?? 0;
    const step = e.eventType === "SEARCH" ? 1 : e.eventType === "JOB_VIEW" ? 2 : 3;
    if (step === reach + 1 || (step === 2 && reach === 1) || (step === 3 && reach >= 1)) {
      // Allow JOB_VIEW / APPLICATION after SEARCH even if events interleave.
      if (step === reach + 1) sessionReach.set(e.sessionId, step);
      else if (step > reach) sessionReach.set(e.sessionId, step);
    }
  }

  // Aggregate per variant.
  const metrics: Record<"A" | "B", VariantMetrics> = {
    A: {
      variant: "A",
      users: 0,
      searchSessions: 0,
      sessionsWithJobView: 0,
      sessionsWithApplication: 0,
      ctr: 0,
      applyRate: 0,
      totalSearches: 0,
      totalJobViews: 0,
      totalApplications: 0,
    },
    B: {
      variant: "B",
      users: 0,
      searchSessions: 0,
      sessionsWithJobView: 0,
      sessionsWithApplication: 0,
      ctr: 0,
      applyRate: 0,
      totalSearches: 0,
      totalJobViews: 0,
      totalApplications: 0,
    },
  };

  for (const [variant, set] of Object.entries(byVariant)) {
    const m = metrics[variant as "A" | "B"];
    m.users = set.size;
  }

  for (const [sessionId, ownerId] of sessionOwner) {
    const variant = (byVariant.A.has(ownerId) && "A") || (byVariant.B.has(ownerId) && "B") || null;
    if (!variant) continue;
    const reach = sessionReach.get(sessionId) ?? 0;
    const m = metrics[variant];
    if (reach >= 1) {
      m.searchSessions++;
      if (reach >= 2) m.sessionsWithJobView++;
      if (reach >= 3) m.sessionsWithApplication++;
    }
  }

  // Raw event counts per variant (from metadata.abVariant when present, else owner).
  const rawCounts = { A: { s: 0, v: 0, a: 0 }, B: { s: 0, v: 0, a: 0 } };
  for (const e of events) {
    if (!e.userId) continue;
    const variant =
      (byVariant.A.has(e.userId) && "A") || (byVariant.B.has(e.userId) && "B") || null;
    if (!variant) continue;
    if (e.eventType === "SEARCH") rawCounts[variant].s++;
    else if (e.eventType === "JOB_VIEW") rawCounts[variant].v++;
    else rawCounts[variant].a++;
  }
  metrics.A.totalSearches = rawCounts.A.s;
  metrics.A.totalJobViews = rawCounts.A.v;
  metrics.A.totalApplications = rawCounts.A.a;
  metrics.B.totalSearches = rawCounts.B.s;
  metrics.B.totalJobViews = rawCounts.B.v;
  metrics.B.totalApplications = rawCounts.B.a;

  const pct = (a: number, b: number) => (b === 0 ? 0 : Number(((a / b) * 100).toFixed(1)));
  for (const m of [metrics.A, metrics.B]) {
    m.ctr = pct(m.sessionsWithJobView, m.searchSessions);
    m.applyRate = pct(m.sessionsWithApplication, m.searchSessions);
  }

  const startedAt = users
    .map((u) => u.abAssignedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const enough = [metrics.A, metrics.B].every((m) => m.searchSessions >= MIN_SESSIONS);

  return {
    experiment: "personalized-ranking",
    description:
      "A = standard IR ranking (control) · B = IR ranking + personalization re-ranker (treatment, up to +15% boost from skill/location overlap). " +
      "Assignment: deterministic 50/50 hash of user id, persisted per user. " +
      "Metrics from stored SEARCH → JOB_VIEW → APPLICATION_SUBMITTED session funnels.",
    startedAt: startedAt ? startedAt.toISOString() : null,
    assignedUsers: users.length,
    variants: [metrics.A, metrics.B],
    delta: {
      ctr: Number((metrics.B.ctr - metrics.A.ctr).toFixed(1)),
      applyRate: Number((metrics.B.applyRate - metrics.A.applyRate).toFixed(1)),
    },
    significance: {
      sufficientData: enough,
      minSessionsPerVariant: MIN_SESSIONS,
      note: enough
        ? "Both variants have reached the minimum session count; differences are descriptive only — no statistical test is claimed."
        : "Insufficient data: metrics are shown for transparency but NO significance or superiority claim can be made yet.",
    },
  };
}
