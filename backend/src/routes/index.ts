import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/auth.controller.js";
import * as profileController from "../controllers/profile.controller.js";
import * as jobsController from "../controllers/jobs.controller.js";
import * as searchController from "../controllers/search.controller.js";
import * as miscController from "../controllers/misc.controller.js";
import { validateBody, requireAuth, requireRole } from "../middleware/auth.js";
import { trackEventSchema } from "../schemas/analytics.js";
import { z } from "zod";

const router = Router();

// Rate limiter for auth endpoints (brute-force mitigation).
const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

// ---------- Schemas ----------

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["JOB_SEEKER", "RECRUITER", "ADMIN"]),
  companyName: z.string().min(2).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  location: z.string().max(100).optional(),
  experience: z.number().int().min(0).max(50).optional(),
  preferredRole: z.string().max(100).optional(),
  preferredLocation: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
  skills: z.array(z.string().min(1).max(50)).max(30).optional(),
});

const jobSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(30).max(10000),
  location: z.string().min(2).max(100),
  experienceRequired: z.number().int().min(0).max(30),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]),
  applicationDeadline: z.string().nullable().optional(),
  skills: z.array(z.string().min(1).max(50)).min(1).max(20),
  status: z.enum(["ACTIVE", "CLOSED", "DRAFT"]).optional(),
});

const jobUpdateSchema = jobSchema.partial();

const applySchema = z.object({
  coverLetter: z.string().max(5000).optional(),
  sessionId: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(["APPLIED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "REJECTED", "HIRED"]),
});

// ---------- Auth ----------

router.post("/auth/register", authLimiter, validateBody(registerSchema), authController.register);
router.post("/auth/login", authLimiter, validateBody(loginSchema), authController.login);
router.get("/auth/me", requireAuth, authController.me);
router.post("/auth/logout", authController.logout);

// ---------- Profile ----------

router.get("/profile", requireAuth, profileController.getProfile);
router.put("/profile", requireAuth, validateBody(profileSchema), profileController.updateProfile);
router.get("/skills", profileController.getSkills);

// ---------- Jobs ----------

router.get("/jobs", jobsController.list);
router.get("/jobs/:id", jobsController.getById);
router.post("/jobs", requireAuth, requireRole("RECRUITER"), validateBody(jobSchema), jobsController.create);
router.put("/jobs/:id", requireAuth, requireRole("RECRUITER"), validateBody(jobUpdateSchema), jobsController.update);
router.delete("/jobs/:id", requireAuth, requireRole("RECRUITER"), jobsController.remove);

// ---------- Search (IR engine) ----------

router.get("/search/jobs", searchController.search);
router.get("/search/explain", searchController.explain);
router.get(
  "/search/evaluation",
  requireAuth,
  requireRole("ADMIN"),
  searchController.evaluate,
);

// ---------- Applications ----------

router.post("/jobs/:id/apply", requireAuth, requireRole("JOB_SEEKER"), validateBody(applySchema), jobsController.apply);
router.get("/applications", requireAuth, miscController.listMyApplications);
router.get("/recruiter/applicants", requireAuth, requireRole("RECRUITER"), miscController.listRecruiterApplicants);
router.put("/recruiter/applicants/:id/status", requireAuth, requireRole("RECRUITER"), validateBody(statusSchema), miscController.updateApplicationStatus);

// ---------- Saved jobs ----------

router.post("/jobs/:id/save", requireAuth, requireRole("JOB_SEEKER"), jobsController.save);
router.delete("/jobs/:id/save", requireAuth, requireRole("JOB_SEEKER"), jobsController.unsave);
router.get("/saved-jobs", requireAuth, miscController.listSavedJobs);
router.get("/saved-jobs/flags", requireAuth, jobsController.checkFlags);

// ---------- Recommendations ----------

router.get("/recommendations/jobs", requireAuth, requireRole("JOB_SEEKER"), miscController.getRecommendations);

// ---------- Analytics ----------

router.post("/analytics/events", validateBody(trackEventSchema), miscController.trackEventRoute);
router.get("/analytics/overview", requireAuth, requireRole("ADMIN"), miscController.analyticsOverview);
router.get("/analytics/search", requireAuth, requireRole("ADMIN"), miscController.analyticsSearch);
router.get("/analytics/funnel", requireAuth, requireRole("ADMIN"), miscController.analyticsFunnel);
router.get("/analytics/jobs", requireAuth, requireRole("ADMIN"), miscController.analyticsJobs);

// ---------- A/B experiment (Phase 4, admin) ----------

router.get("/abtest/summary", requireAuth, requireRole("ADMIN"), searchController.abTestSummary);
router.post("/abtest/assign-missing", requireAuth, requireRole("ADMIN"), searchController.abTestAssignMissing);

// ---------- Recruiter ----------

router.get("/recruiter/jobs", requireAuth, requireRole("RECRUITER"), miscController.recruiterJobs);
router.get("/recruiter/jobs/:id/analytics", requireAuth, requireRole("RECRUITER"), miscController.recruiterJobAnalytics);
router.get("/recruiter/overview", requireAuth, requireRole("RECRUITER"), miscController.recruiterOverview);

export default router;
