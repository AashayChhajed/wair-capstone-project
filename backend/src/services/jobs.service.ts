import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { invalidateSearchIndex } from "./search.service.js";

export interface JobWithRelations {
  id: string;
  title: string;
  description: string;
  location: string;
  experienceRequired: number;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string;
  status: string;
  postedAt: Date;
  applicationDeadline: Date | null;
  companyId: string;
  company: { id: string; name: string; location: string | null };
  skills: { id: string; name: string }[];
}

export function jobInclude() {
  return {
    company: { select: { id: true, name: true, location: true } },
    skills: { include: { skill: { select: { id: true, name: true } } } },
    _count: { select: { applications: true, savedBy: true } },
  };
}

/** Shape a Prisma job row (with includes) into the API contract. */
export function shapeJob(job: any): JobWithRelations {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    location: job.location,
    experienceRequired: job.experienceRequired,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    employmentType: job.employmentType,
    status: job.status,
    postedAt: job.postedAt,
    applicationDeadline: job.applicationDeadline,
    companyId: job.companyId,
    company: job.company,
    skills: job.skills?.map((s: any) => s.skill) ?? [],
  };
}

export interface JobFilters {
  location?: string;
  employmentType?: string;
  experience?: number;
  salaryMin?: number;
  status?: string;
}

export interface JobListResult {
  jobs: JobWithRelations[];
  total: number;
}

/** Browse/filter jobs (SQL-level filtering, NOT the IR search). */
export async function listJobs(filters: JobFilters, page = 1, pageSize = 20): Promise<JobListResult> {
  const where: any = { status: filters.status ?? "ACTIVE" };
  if (filters.location) where.location = { contains: filters.location, mode: "insensitive" as const };
  if (filters.employmentType) where.employmentType = filters.employmentType;
  if (filters.experience !== undefined) where.experienceRequired = { lte: filters.experience + 2 };
  if (filters.salaryMin) where.salaryMax = { gte: filters.salaryMin };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: jobInclude(),
      orderBy: { postedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.job.count({ where }),
  ]);

  return { jobs: jobs.map(shapeJob), total };
}

export async function getJobById(id: string) {
  const job = await prisma.job.findUnique({
    where: { id },
    include: jobInclude(),
  });
  if (!job) throw notFound("Job not found");
  return shapeJob(job);
}

export interface CreateJobInput {
  title: string;
  description: string;
  location: string;
  experienceRequired: number;
  salaryMin?: number | null;
  salaryMax?: number | null;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP";
  applicationDeadline?: string | null;
  skills: string[];
  status?: "ACTIVE" | "CLOSED" | "DRAFT";
}

async function linkJobSkills(jobId: string, skillNames: string[]) {
  const cleaned = [...new Set(skillNames.map((s) => s.trim()).filter(Boolean))].map(
    (s) => s[0].toUpperCase() + s.slice(1),
  );
  await prisma.jobSkill.deleteMany({ where: { jobId } });
  for (const name of cleaned) {
    const skill = await prisma.skill.upsert({ where: { name }, create: { name }, update: {} });
    await prisma.jobSkill.create({ data: { jobId, skillId: skill.id } });
  }
}

export async function createJob(recruiterId: string, input: CreateJobInput) {
  const company = await prisma.company.findFirst({
    where: { recruiterId },
    orderBy: { createdAt: "asc" },
  });
  if (!company) throw notFound("Create your company profile first");

  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      title: input.title,
      description: input.description,
      location: input.location,
      experienceRequired: input.experienceRequired,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      employmentType: input.employmentType,
      applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null,
      status: input.status ?? "ACTIVE",
    },
  });
  await linkJobSkills(job.id, input.skills);
  invalidateSearchIndex();
  return getJobById(job.id);
}

export async function updateJob(jobId: string, recruiterId: string, input: Partial<CreateJobInput>) {
  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true },
  });
  if (!existing) throw notFound("Job not found");
  if (existing.company.recruiterId !== recruiterId) throw notFound("Job not found");

  const { skills, applicationDeadline, ...rest } = input;
  await prisma.job.update({
    where: { id: jobId },
    data: {
      ...rest,
      applicationDeadline: applicationDeadline !== undefined
        ? applicationDeadline ? new Date(applicationDeadline) : null
        : undefined,
    },
  });
  if (skills) await linkJobSkills(jobId, skills);
  invalidateSearchIndex();
  return getJobById(jobId);
}

export async function deleteJob(jobId: string, recruiterId: string) {
  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true },
  });
  if (!existing) throw notFound("Job not found");
  if (existing.company.recruiterId !== recruiterId) throw notFound("Job not found");
  await prisma.job.delete({ where: { id: jobId } });
  invalidateSearchIndex();
  return { deleted: true };
}

/** Jobs belonging to the recruiter's company. */
export async function listRecruiterJobs(recruiterId: string) {
  const jobs = await prisma.job.findMany({
    where: { company: { recruiterId } },
    include: jobInclude(),
    orderBy: { postedAt: "desc" },
  });
  return jobs.map(shapeJob);
}

/** Companies for filter dropdowns. */
export async function listCompanies() {
  return prisma.company.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });
}
