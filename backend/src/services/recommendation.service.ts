/**
 * Content-based job recommendation engine.
 *
 * Compares the seeker's profile (skills, preferred role, preferred location,
 * experience) against every active job and produces an explainable weighted
 * score:
 *
 *   score = w_skills·skillMatch + w_role·roleMatch + w_location·locationMatch
 *         + w_experience·experienceMatch
 *
 * Default weights: 40% skills, 25% role, 20% location, 15% experience.
 * These are baseline experimental weights, NOT scientifically optimized —
 * they are configurable via RECOMMENDATION_WEIGHTS / the service argument.
 */

import { prisma } from "../lib/prisma.js";
import { normalize, tokenize } from "./ir/tokenizer.js";

export interface RecommendationWeights {
  skills: number;
  role: number;
  location: number;
  experience: number;
}

export const DEFAULT_WEIGHTS: RecommendationWeights = {
  skills: 0.4,
  role: 0.25,
  location: 0.2,
  experience: 0.15,
};

export interface JobFeatures {
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

export interface MatchExplanation {
  matchedSkills: string[];
  missingSkills: string[];
  roleMatch: { jobRole: string | null; preferredRole: string | null; score: number };
  locationMatch: { jobLocation: string; preferredLocation: string | null; score: number };
  experienceMatch: {
    jobRequires: number;
    candidateYears: number;
    score: number;
    reason: string;
  };
  reasons: string[];
}

export interface Recommendation {
  job: JobFeatures;
  score: number; // 0..1, multiply by 100 for %
  skillScore: number;
  roleScore: number;
  locationScore: number;
  experienceScore: number;
  explanation: MatchExplanation;
}

/** Parse weights from "0.4,0.25,0.2,0.15" style env var, falling back to defaults. */
export function parseWeights(raw: string | undefined): RecommendationWeights {
  if (!raw) return { ...DEFAULT_WEIGHTS };
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    return { ...DEFAULT_WEIGHTS };
  }
  const [skills, role, location, experience] = parts;
  return { skills, role, location, experience };
}

/**
 * Fuzzy role match in [0,1]: overlap coefficient between the preferred role
 * tokens and the job title tokens (|A∩B| / min(|A|,|B|)). Containment-style
 * similarity suits role matching: "Backend Developer" fully overlaps
 * "Senior Backend Developer (Java)".
 */
export function roleSimilarity(preferredRole: string | null, jobTitle: string): number {
  if (!preferredRole) return 0;
  const STOP = new Set(["developer", "engineer", "role", "jobs", "job", "a", "the", "and"]);
  const a = [...new Set(tokenize(preferredRole).filter((t) => !STOP.has(t) && t.length > 2))];
  const b = new Set(tokenize(jobTitle).filter((t) => !STOP.has(t) && t.length > 2));
  if (a.length === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter === 0 ? 0 : inter / Math.min(a.length, b.size);
}

/**
 * Location match: exact (normalized) match → 1; "remote" jobs match any
 * preference at 0.8 (remote is nearly always acceptable); otherwise 0.
 */
export function locationMatchScore(jobLocation: string, preferred: string | null): number {
  if (!preferred) return 0;
  if (normalize(jobLocation) === "remote" || normalize(preferred) === "remote") {
    return normalize(jobLocation) === normalize(preferred) ? 1 : 0.8;
  }
  return normalize(jobLocation) === normalize(preferred) ? 1 : 0;
}

/**
 * Experience match in [0,1]:
 *  - candidate meets/exceeds requirement → 1 (with small bonus slope for near-requirement)
 *  - candidate slightly under (within 1 year) → 0.6
 *  - candidate far under → decays toward 0.2
 */
export function experienceMatchScore(candidateYears: number, requiredYears: number) {
  if (candidateYears >= requiredYears) {
    const overshoot = candidateYears - requiredYears;
    const score = Math.max(0.7, 1 - 0.05 * overshoot); // mild penalty for being way overqualified
    return {
      score,
      reason:
        overshoot === 0
          ? `Experience matches the ${requiredYears}-year requirement`
          : `Your ${candidateYears} years exceed the ${requiredYears}-year requirement`,
    };
  }
  const gap = requiredYears - candidateYears;
  const score = gap <= 1 ? 0.6 : Math.max(0.2, 0.6 - 0.15 * (gap - 1));
  return { score, reason: `Requires ${requiredYears} years; you have ${candidateYears}` };
}

/** Compute the full recommendation set for a seeker. */
export async function recommendJobsForUser(
  userId: string,
  options: { limit?: number; weights?: RecommendationWeights } = {},
): Promise<{ recommendations: Recommendation[]; weights: RecommendationWeights }> {
  const weights = options.weights ?? parseWeights(process.env.RECOMMENDATION_WEIGHTS);

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    include: {
      user: {
        include: {
          skills: { include: { skill: { select: { name: true } } } },
        },
      },
    },
  });

  const userSkills = (profile?.user.skills ?? []).map((s) => s.skill.name);
  const preferredRole = profile?.preferredRole ?? null;
  const preferredLocation = profile?.preferredLocation ?? null;
  const experience = profile?.experience ?? 0;

  const jobs = await prisma.job.findMany({
    where: { status: "ACTIVE" },
    include: {
      company: { select: { name: true } },
      skills: { include: { skill: { select: { name: true } } } },
    },
    orderBy: { postedAt: "desc" },
    take: 300,
  });

  const jobFeatures: JobFeatures[] = jobs.map((job) => ({
    id: job.id,
    title: job.title,
    description: job.description,
    location: job.location,
    experienceRequired: job.experienceRequired,
    companyName: job.company.name,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    employmentType: job.employmentType,
    skills: job.skills.map((s) => s.skill.name),
  }));

  // Jobs the user already applied to are excluded from recommendations.
  const appliedJobIds = new Set(
    (
      await prisma.application.findMany({
        where: { userId },
        select: { jobId: true },
      })
    ).map((a) => a.jobId),
  );

  const recommendations: Recommendation[] = [];
  for (const job of jobFeatures) {
    if (appliedJobIds.has(job.id)) continue;

    const jobSkillSet = new Set(job.skills.map((s) => normalize(s)));
    const userSkillSet = new Set(userSkills.map((s) => normalize(s)));
    const matchedSkills = job.skills.filter((s) => userSkillSet.has(normalize(s)));
    const missingSkills = job.skills.filter((s) => !userSkillSet.has(normalize(s)));

    const skillScore = job.skills.length === 0 ? 0 : matchedSkills.length / job.skills.length;
    const roleScore = roleSimilarity(preferredRole, job.title);
    const locationScore = locationMatchScore(job.location, preferredLocation);
    const exp = experienceMatchScore(experience, job.experienceRequired);

    const score =
      weights.skills * skillScore +
      weights.role * roleScore +
      weights.location * locationScore +
      weights.experience * exp.score;

    // Only recommend jobs with a meaningful signal.
    if (score < 0.25) continue;

    const reasons: string[] = [];
    if (matchedSkills.length > 0) {
      reasons.push(`Matches your ${matchedSkills.slice(0, 3).join(", ")} skill${matchedSkills.length > 1 ? "s" : ""}`);
    }
    if (locationScore >= 0.8) {
      reasons.push(
        job.location.toLowerCase() === "remote"
          ? "Remote-friendly — works with any location preference"
          : `In your preferred location (${preferredLocation})`,
      );
    }
    if (roleScore >= 0.5) {
      reasons.push(`Title aligns with your preferred role (${preferredRole})`);
    }
    if (exp.score >= 0.7) reasons.push(exp.reason);

    recommendations.push({
      job,
      score,
      skillScore,
      roleScore,
      locationScore,
      experienceScore: exp.score,
      explanation: {
        matchedSkills,
        missingSkills,
        roleMatch: { jobRole: job.title, preferredRole, score: roleScore },
        locationMatch: { jobLocation: job.location, preferredLocation, score: locationScore },
        experienceMatch: {
          jobRequires: job.experienceRequired,
          candidateYears: experience,
          score: exp.score,
          reason: exp.reason,
        },
        reasons,
      },
    });
  }

  recommendations.sort((a, b) => b.score - a.score);
  return { recommendations: recommendations.slice(0, options.limit ?? 20), weights };
}
