/**
 * Analytics aggregation service.
 *
 * Every number produced here is derived from stored AnalyticsEvent rows and
 * domain tables (users, jobs, applications) — no hard-coded figures.
 */

import { prisma } from "../lib/prisma.js";
import type { ApplicationStatus, EventType } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Daily counts of an event type over the last `days` days (zero-filled). */
export async function eventDailyCounts(eventType: EventType, days = 30) {
  const since = startOfDay(daysAgo(days - 1));
  const events = await prisma.analyticsEvent.findMany({
    where: { eventType, timestamp: { gte: since } },
    select: { timestamp: true },
  });
  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    byDay.set(startOfDay(daysAgo(days - 1 - i)).toISOString().slice(0, 10), 0);
  }
  for (const e of events) {
    const key = startOfDay(e.timestamp).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}

/** Admin overview: platform-wide KPIs. */
export async function getAdminOverview(days = 30) {
  const since = daysAgo(days);

  const [
    totalUsers,
    totalSeekers,
    totalRecruiters,
    totalJobs,
    activeJobs,
    totalApplications,
    totalSessions,
    searchEvents,
    jobViewEvents,
    pageViewEvents,
    recommendationImpressions,
    recommendationClicks,
    jobSaves,
    newUsersWindow,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "JOB_SEEKER" } }),
    prisma.user.count({ where: { role: "RECRUITER" } }),
    prisma.job.count(),
    prisma.job.count({ where: { status: "ACTIVE" } }),
    prisma.application.count(),
    prisma.session.count(),
    prisma.analyticsEvent.count({ where: { eventType: "SEARCH" } }),
    prisma.analyticsEvent.count({ where: { eventType: "JOB_VIEW" } }),
    prisma.analyticsEvent.count({ where: { eventType: "PAGE_VIEW" } }),
    prisma.analyticsEvent.count({ where: { eventType: "RECOMMENDATION_IMPRESSION" } }),
    prisma.analyticsEvent.count({ where: { eventType: "RECOMMENDATION_CLICK" } }),
    prisma.analyticsEvent.count({ where: { eventType: "JOB_SAVE" } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
  ]);

  // SEARCH with a subsequent JOB_VIEW within the session → clicked result.
  const searchSessions = await prisma.analyticsEvent.findMany({
    where: { eventType: { in: ["SEARCH", "JOB_VIEW"] } },
    select: { eventType: true, sessionId: true, timestamp: true },
  });
  const searchSessionIds = new Set<string>();
  const viewSessionIds = new Set<string>();
  for (const e of searchSessions) {
    if (e.eventType === "SEARCH" && e.sessionId) searchSessionIds.add(e.sessionId);
    if (e.eventType === "JOB_VIEW" && e.sessionId) viewSessionIds.add(e.sessionId);
  }
  let searchClickSessions = 0;
  for (const s of searchSessionIds) if (viewSessionIds.has(s)) searchClickSessions++;

  return {
    windowDays: days,
    totals: {
      users: totalUsers,
      jobSeekers: totalSeekers,
      recruiters: totalRecruiters,
      jobs: totalJobs,
      activeJobs,
      applications: totalApplications,
      sessions: totalSessions,
      searches: searchEvents,
      jobViews: jobViewEvents,
      pageViews: pageViewEvents,
      recommendationImpressions,
      recommendationClicks,
      jobSaves,
      newUsersInWindow: newUsersWindow,
    },
    searchCtr:
      searchEvents === 0
        ? 0
        : Number(((searchClickSessions / searchEvents) * 100).toFixed(1)),
    recommendationCtr:
      recommendationImpressions === 0
        ? 0
        : Number(((recommendationClicks / recommendationImpressions) * 100).toFixed(1)),
  };
}

/** Search analytics: volume, top queries, CTR, zero-result searches. */
export async function getSearchAnalytics(days = 30) {
  const since = daysAgo(days);
  const searches = await prisma.analyticsEvent.findMany({
    where: { eventType: "SEARCH", timestamp: { gte: since } },
    select: { searchQuery: true, metadata: true, sessionId: true },
  });

  const queryCounts = new Map<string, { count: number; zeroResults: number }>();
  let zeroResults = 0;
  for (const s of searches) {
    const q = (s.searchQuery ?? "").trim() || "(empty)";
    const meta = s.metadata as { resultCount?: number } | null;
    const isZero = meta?.resultCount === 0;
    if (isZero) zeroResults++;
    const entry = queryCounts.get(q.toLowerCase()) ?? { count: 0, zeroResults: 0 };
    entry.count++;
    if (isZero) entry.zeroResults++;
    queryCounts.set(q.toLowerCase(), entry);
  }

  const topQueries = [...queryCounts.entries()]
    .map(([query, v]) => ({ query, count: v.count, zeroResults: v.zeroResults }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // CTR: fraction of searches followed by a JOB_VIEW in the same session.
  const pairs = await prisma.analyticsEvent.findMany({
    where: { eventType: { in: ["SEARCH", "JOB_VIEW"] }, timestamp: { gte: since } },
    select: { eventType: true, sessionId: true },
  });
  const searchSessions = new Set<string>();
  const viewSessions = new Set<string>();
  for (const e of pairs) {
    if (!e.sessionId) continue;
    if (e.eventType === "SEARCH") searchSessions.add(e.sessionId);
    else viewSessions.add(e.sessionId);
  }
  let searchSessionsWithClick = 0;
  for (const s of searchSessions) if (viewSessions.has(s)) searchSessionsWithClick++;

  return {
    windowDays: days,
    totalSearches: searches.length,
    uniqueQueries: queryCounts.size,
    zeroResultSearches: zeroResults,
    zeroResultRate:
      searches.length === 0 ? 0 : Number(((zeroResults / searches.length) * 100).toFixed(1)),
    searchCtr:
      searchSessions.size === 0
        ? 0
        : Number(((searchSessionsWithClick / searchSessions.size) * 100).toFixed(1)),
    topQueries,
    searchesOverTime: await eventDailyCounts("SEARCH", days),
  };
}

/**
 * Application funnel: SEARCH → JOB_VIEW → APPLY_START → APPLICATION_SUBMITTED.
 *
 * Measured as an ORDERED funnel per session: a session reaches stage N only
 * if the stage-N event occurs (by timestamp) after it reached stage N-1.
 * This keeps stage counts monotonically non-increasing, which raw event
 * counts violate (users view jobs without searching, view several jobs per
 * search, etc.). Also returns raw event counts for reference.
 */
export async function getApplicationFunnel(days = 30) {
  const since = daysAgo(days);
  const stages: EventType[] = ["SEARCH", "JOB_VIEW", "APPLY_START", "APPLICATION_SUBMITTED"];

  const events = await prisma.analyticsEvent.findMany({
    where: { eventType: { in: stages }, timestamp: { gte: since } },
    select: { eventType: true, sessionId: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Raw event totals (for reference in the UI).
  const eventCounts = new Map<EventType, number>();
  for (const e of events) eventCounts.set(e.eventType, (eventCounts.get(e.eventType) ?? 0) + 1);

  // Ordered session funnel: track the furthest stage each session reached.
  const sessionStage = new Map<string, number>();
  for (const e of events) {
    if (!e.sessionId) continue;
    const stageIndex = stages.indexOf(e.eventType);
    const current = sessionStage.get(e.sessionId) ?? -1;
    // Advance only one stage at a time and only in order.
    if (stageIndex === current + 1) {
      sessionStage.set(e.sessionId, stageIndex);
    }
  }

  const stageCounts = new Array(stages.length).fill(0);
  for (const reached of sessionStage.values()) {
    for (let i = 0; i <= reached; i++) stageCounts[i]++;
  }

  const [searches, jobViews, applyStarts, applications] = stageCounts;
  const pct = (a: number, b: number) => (b === 0 ? 0 : Number(((a / b) * 100).toFixed(1)));

  return {
    windowDays: days,
    unit: "sessions (ordered funnel)",
    stages: [
      { stage: "Search", eventType: "SEARCH", count: searches },
      { stage: "Job View", eventType: "JOB_VIEW", count: jobViews },
      { stage: "Apply Start", eventType: "APPLY_START", count: applyStarts },
      { stage: "Application Submitted", eventType: "APPLICATION_SUBMITTED", count: applications },
    ],
    eventCounts: {
      searches: eventCounts.get("SEARCH") ?? 0,
      jobViews: eventCounts.get("JOB_VIEW") ?? 0,
      applyStarts: eventCounts.get("APPLY_START") ?? 0,
      applications: eventCounts.get("APPLICATION_SUBMITTED") ?? 0,
    },
    conversions: {
      searchToView: pct(jobViews, searches),
      viewToApplyStart: pct(applyStarts, jobViews),
      applyStartToSubmit: pct(applications, applyStarts),
      viewToApplication: pct(applications, jobViews),
      overall: pct(applications, searches),
    },
    dropOffs: [
      { from: "Search", to: "Job View", dropOff: Number((100 - pct(jobViews, searches)).toFixed(1)) },
      { from: "Job View", to: "Apply Start", dropOff: Number((100 - pct(applyStarts, jobViews)).toFixed(1)) },
      { from: "Apply Start", to: "Application Submitted", dropOff: Number((100 - pct(applications, applyStarts)).toFixed(1)) },
    ],
  };
}

/** Job performance analytics: views/saves/applications per job. */
export async function getJobAnalytics(days = 30) {
  const since = daysAgo(days);
  const jobs = await prisma.job.findMany({
    include: {
      company: { select: { name: true } },
      _count: { select: { applications: true, savedBy: true } },
    },
  });
  const jobEvents = await prisma.analyticsEvent.findMany({
    where: {
      eventType: { in: ["JOB_VIEW", "JOB_SAVE", "JOB_UNSAVE"] },
      jobId: { not: null },
      timestamp: { gte: since },
    },
    select: { jobId: true, eventType: true },
  });

  const stats = new Map<string, { views: number; saves: number; unsaves: number }>();
  for (const e of jobEvents) {
    if (!e.jobId) continue;
    const entry = stats.get(e.jobId) ?? { views: 0, saves: 0, unsaves: 0 };
    if (e.eventType === "JOB_VIEW") entry.views++;
    else if (e.eventType === "JOB_SAVE") entry.saves++;
    else entry.unsaves++;
    stats.set(e.jobId, entry);
  }

  return jobs
    .map((job) => {
      const s = stats.get(job.id) ?? { views: 0, saves: 0, unsaves: 0 };
      const views = s.views;
      const applications = job._count.applications;
      return {
        jobId: job.id,
        title: job.title,
        company: job.company.name,
        location: job.location,
        status: job.status,
        views,
        saves: s.saves,
        applications,
        conversionRate:
          views === 0 ? 0 : Number(((applications / views) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => b.views - a.views);
}

/** Application status distribution across the platform. */
export async function getApplicationStatusDistribution() {
  const grouped = await prisma.application.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return grouped.map((g) => ({
    status: g.status as ApplicationStatus,
    count: g._count._all,
  }));
}

/** Recruiter-scoped analytics for all jobs of one recruiter. */
export async function getRecruiterJobsAnalytics(recruiterId: string, days = 30) {
  const all = await getJobAnalytics(days);
  const recruiterJobs = await prisma.job.findMany({
    where: { company: { recruiterId } },
    select: { id: true },
  });
  const ids = new Set(recruiterJobs.map((j) => j.id));
  return all.filter((j) => ids.has(j.jobId));
}

/** Detailed analytics for a single job (recruiter view). */
export async function getRecruiterJobAnalytics(jobId: string, days = 30) {
  const since = daysAgo(days);
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      company: { select: { name: true } },
      applications: { select: { status: true } },
    },
  });
  if (!job) return null;

  const events = await prisma.analyticsEvent.findMany({
    where: { jobId, timestamp: { gte: since } },
    select: { eventType: true },
  });
  const counts = new Map<EventType, number>();
  for (const e of events) counts.set(e.eventType, (counts.get(e.eventType) ?? 0) + 1);

  const views = counts.get("JOB_VIEW") ?? 0;
  const saves = counts.get("JOB_SAVE") ?? 0;
  const applications = job.applications.length;

  const statusDistribution = await prisma.application.groupBy({
    by: ["status"],
    where: { jobId },
    _count: { _all: true },
  });

  // Views over time for charting.
  const viewEvents = await prisma.analyticsEvent.findMany({
    where: { jobId, eventType: "JOB_VIEW", timestamp: { gte: since } },
    select: { timestamp: true },
  });
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(startOfDay(daysAgo(i)).toISOString().slice(0, 10), 0);
  }
  for (const e of viewEvents) {
    const key = startOfDay(e.timestamp).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return {
    job: {
      id: job.id,
      title: job.title,
      company: job.company.name,
      location: job.location,
      status: job.status,
      postedAt: job.postedAt,
    },
    kpis: {
      views,
      saves,
      applications,
      conversionRate: views === 0 ? 0 : Number(((applications / views) * 100).toFixed(1)),
    },
    statusDistribution: statusDistribution.map((s) => ({
      status: s.status as ApplicationStatus,
      count: s._count._all,
    })),
    viewsOverTime: [...byDay.entries()].map(([date, count]) => ({ date, count })),
  };
}
