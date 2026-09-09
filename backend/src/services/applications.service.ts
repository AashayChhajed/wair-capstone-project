import { prisma } from "../lib/prisma.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import type { ApplicationStatus } from "@prisma/client";

export async function applyToJob(userId: string, jobId: string, coverLetter?: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw notFound("Job not found");
  if (job.status !== "ACTIVE") throw badRequest("This job is no longer accepting applications");

  const existing = await prisma.application.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });
  if (existing) throw conflict("You have already applied to this job");

  const application = await prisma.application.create({
    data: { userId, jobId, coverLetter },
    include: { job: { include: { company: { select: { name: true } } } } },
  });
  return application;
}

export async function listUserApplications(userId: string) {
  return prisma.application.findMany({
    where: { userId },
    include: {
      job: {
        include: { company: { select: { id: true, name: true } }, skills: { include: { skill: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** All applications for a recruiter's jobs (applicant tracking). */
export async function listRecruiterApplicants(recruiterId: string, status?: ApplicationStatus) {
  return prisma.application.findMany({
    where: {
      job: { company: { recruiterId } },
      ...(status ? { status } : {}),
    },
    include: {
      user: {
        select: {
          id: true, name: true, email: true,
          profile: { select: { location: true, experience: true, preferredRole: true } },
          skills: { include: { skill: { select: { name: true } } } },
        },
      },
      job: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Recruiter updates application status (ownership enforced). */
export async function updateApplicationStatus(
  applicationId: string,
  recruiterId: string,
  status: ApplicationStatus,
) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: { include: { company: true } } },
  });
  if (!application) throw notFound("Application not found");
  if (application.job.company.recruiterId !== recruiterId) throw notFound("Application not found");

  return prisma.application.update({
    where: { id: applicationId },
    data: { status },
    include: { user: { select: { id: true, name: true, email: true } }, job: { select: { title: true } } },
  });
}

// ---------- Saved jobs ----------

export async function saveJob(userId: string, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw notFound("Job not found");
  await prisma.savedJob.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId },
    update: {},
  });
  return { saved: true };
}

export async function unsaveJob(userId: string, jobId: string) {
  await prisma.savedJob.deleteMany({ where: { userId, jobId } });
  return { saved: false };
}

export async function listSavedJobs(userId: string) {
  const saved = await prisma.savedJob.findMany({
    where: { userId },
    include: {
      job: {
        include: {
          company: { select: { id: true, name: true } },
          skills: { include: { skill: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return saved.map((s) => ({
    savedAt: s.createdAt,
    job: {
      id: s.job.id,
      title: s.job.title,
      description: s.job.description,
      location: s.job.location,
      experienceRequired: s.job.experienceRequired,
      salaryMin: s.job.salaryMin,
      salaryMax: s.job.salaryMax,
      employmentType: s.job.employmentType,
      status: s.job.status,
      postedAt: s.job.postedAt,
      companyId: s.job.companyId,
      company: s.job.company,
      skills: s.job.skills.map((js) => js.skill),
    },
  }));
}

/** Check which of the given jobs the user has saved / applied to. */
export async function getUserJobFlags(userId: string, jobIds: string[]) {
  const [saved, applied] = await Promise.all([
    prisma.savedJob.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true } }),
    prisma.application.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true } }),
  ]);
  return {
    savedJobIds: saved.map((s) => s.jobId),
    appliedJobIds: applied.map((a) => a.jobId),
  };
}
