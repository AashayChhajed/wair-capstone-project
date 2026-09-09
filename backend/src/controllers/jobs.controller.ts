import type { Request, Response, NextFunction } from "express";
import * as jobsService from "../services/jobs.service.js";
import * as applicationsService from "../services/applications.service.js";
import { trackEvent } from "../services/tracking.service.js";
import { badRequest } from "../lib/errors.js";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 20), 50);
    const result = await jobsService.listJobs(
      {
        location: req.query.location as string | undefined,
        employmentType: req.query.employmentType as string | undefined,
        experience: req.query.experience ? Number(req.query.experience) : undefined,
        salaryMin: req.query.salaryMin ? Number(req.query.salaryMin) : undefined,
      },
      page,
      pageSize,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobsService.getJobById(req.params.id);
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobsService.createJob(req.user!.id, req.body);
    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobsService.updateJob(req.params.id, req.user!.id, req.body);
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await jobsService.deleteJob(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
};

export const apply = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const application = await applicationsService.applyToJob(
      req.user!.id,
      req.params.id,
      req.body?.coverLetter,
    );
    await trackEvent({
      userId: req.user!.id,
      sessionId: (req.body?.sessionId as string) ?? null,
      eventType: "APPLICATION_SUBMITTED",
      jobId: req.params.id,
    });
    res.status(201).json({ application });
  } catch (err) {
    next(err);
  }
};

export const save = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await applicationsService.saveJob(req.user!.id, req.params.id);
    await trackEvent({
      userId: req.user!.id,
      sessionId: (req.body?.sessionId as string) ?? null,
      eventType: "JOB_SAVE",
      jobId: req.params.id,
    });
    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
};

export const unsave = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await applicationsService.unsaveJob(req.user!.id, req.params.id);
    await trackEvent({
      userId: req.user!.id,
      sessionId: (req.body?.sessionId as string) ?? null,
      eventType: "JOB_UNSAVE",
      jobId: req.params.id,
    });
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
};

export const checkFlags = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobIds = String(req.query.jobIds ?? "").split(",").filter(Boolean);
    if (jobIds.length === 0) return res.json({ savedJobIds: [], appliedJobIds: [] });
    if (jobIds.length > 200) throw badRequest("Too many jobIds");
    res.json(await applicationsService.getUserJobFlags(req.user!.id, jobIds));
  } catch (err) {
    next(err);
  }
};
