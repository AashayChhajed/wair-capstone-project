import type { Request, Response, NextFunction } from "express";
import * as applicationsService from "../services/applications.service.js";
import * as recommendationService from "../services/recommendation.service.js";
import * as analyticsService from "../services/analytics.service.js";
import * as jobsService from "../services/jobs.service.js";
import { trackEvent } from "../services/tracking.service.js";
import { notFound } from "../lib/errors.js";
import type { ApplicationStatus } from "@prisma/client";

// ---------- Applications ----------

export const listMyApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ applications: await applicationsService.listUserApplications(req.user!.id) });
  } catch (err) {
    next(err);
  }
};

export const listRecruiterApplicants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ApplicationStatus | undefined;
    res.json({
      applicants: await applicationsService.listRecruiterApplicants(req.user!.id, status),
    });
  } catch (err) {
    next(err);
  }
};

export const updateApplicationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status: ApplicationStatus };
    res.json({
      application: await applicationsService.updateApplicationStatus(
        req.params.id,
        req.user!.id,
        status,
      ),
    });
  } catch (err) {
    next(err);
  }
};

// ---------- Saved jobs ----------

export const listSavedJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ savedJobs: await applicationsService.listSavedJobs(req.user!.id) });
  } catch (err) {
    next(err);
  }
};

// ---------- Recommendations ----------

export const getRecommendations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recommendations, weights } = await recommendationService.recommendJobsForUser(
      req.user!.id,
      { limit: Number(req.query.limit ?? 20) },
    );

    // RECOMMENDATION_IMPRESSION for the cards actually shown.
    const sessionId = (req.query.sessionId as string) ?? null;
    if (recommendations.length > 0) {
      await trackEventsBatch(
        recommendations.map((r) => ({
          userId: req.user!.id,
          sessionId,
          eventType: "RECOMMENDATION_IMPRESSION" as const,
          jobId: r.job.id,
          metadata: { score: Number(r.score.toFixed(4)) },
        })),
      );
    }

    res.json({
      recommendations: recommendations.map((r) => ({
        job: r.job,
        matchPercent: Math.round(r.score * 100),
        skillPercent: Math.round(r.skillScore * 100),
        rolePercent: Math.round(r.roleScore * 100),
        locationPercent: Math.round(r.locationScore * 100),
        experiencePercent: Math.round(r.experienceScore * 100),
        explanation: r.explanation,
      })),
      weights,
    });
  } catch (err) {
    next(err);
  }
};

async function trackEventsBatch(events: Parameters<typeof trackEvent>[0][]) {
  for (const e of events) await trackEvent(e);
}

// ---------- Clickstream ----------

const ALLOWED_EVENT_TYPES = new Set([
  "PAGE_VIEW", "SEARCH", "JOB_VIEW", "JOB_SAVE", "JOB_UNSAVE",
  "APPLY_START", "APPLICATION_SUBMITTED", "RECOMMENDATION_IMPRESSION",
  "RECOMMENDATION_CLICK", "FILTER_USED", "SESSION_START", "SESSION_END",
]);

export const trackEventRoute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventType, jobId, searchQuery, sessionId, metadata } = req.body as {
      eventType: string;
      jobId?: string;
      searchQuery?: string;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    };
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: `Unknown eventType: ${eventType}` });
    }
    const event = await trackEvent({
      userId: req.user?.id ?? null,
      sessionId: sessionId ?? null,
      eventType: eventType as never,
      jobId: jobId ?? null,
      searchQuery: searchQuery ?? null,
      metadata,
    });
    res.status(201).json({ event: { id: event.id } });
  } catch (err) {
    next(err);
  }
};

// ---------- Analytics (admin) ----------

export const analyticsOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Number(req.query.days ?? 30);
    res.json(await analyticsService.getAdminOverview(days));
  } catch (err) {
    next(err);
  }
};

export const analyticsSearch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getSearchAnalytics(Number(req.query.days ?? 30)));
  } catch (err) {
    next(err);
  }
};

export const analyticsFunnel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getApplicationFunnel(Number(req.query.days ?? 30)));
  } catch (err) {
    next(err);
  }
};

export const analyticsJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      jobs: await analyticsService.getJobAnalytics(Number(req.query.days ?? 30)),
      statusDistribution: await analyticsService.getApplicationStatusDistribution(),
    });
  } catch (err) {
    next(err);
  }
};

// ---------- Recruiter analytics ----------

export const recruiterJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ jobs: await jobsService.listRecruiterJobs(req.user!.id) });
  } catch (err) {
    next(err);
  }
};

export const recruiterJobAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await analyticsService.getRecruiterJobAnalytics(req.params.id, Number(req.query.days ?? 30));
    if (!result) throw notFound("Job not found");
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const recruiterOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await analyticsService.getRecruiterJobsAnalytics(req.user!.id, Number(req.query.days ?? 30));
    const totals = jobs.reduce(
      (acc, j) => ({
        views: acc.views + j.views,
        saves: acc.saves + j.saves,
        applications: acc.applications + j.applications,
      }),
      { views: 0, saves: 0, applications: 0 },
    );
    res.json({
      jobs,
      totals: {
        ...totals,
        conversionRate:
          totals.views === 0 ? 0 : Number(((totals.applications / totals.views) * 100).toFixed(1)),
      },
    });
  } catch (err) {
    next(err);
  }
};
