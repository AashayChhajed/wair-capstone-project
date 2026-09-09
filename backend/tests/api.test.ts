/**
 * API integration tests: auth, jobs CRUD, search endpoint, applications,
 * saved jobs and analytics event ingestion. Requires the dev database and
 * starts the Express app in-process via supertest-style fetch (node 22
 * has global fetch; we boot the app on an ephemeral port).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;

const seeker = {
  name: "Test Seeker",
  email: `seeker-${Date.now()}@example.com`,
  password: "Password123!",
  role: "JOB_SEEKER" as const,
};

const recruiter = {
  name: "Test Recruiter",
  email: `recruiter-${Date.now()}@example.com`,
  password: "Password123!",
  role: "RECRUITER" as const,
  companyName: "Test Recruiter Co",
};

async function api(path: string, init?: RequestInit & { token?: string }) {
  const { token, ...rest } = init ?? {};
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  return { status: res.status, body };
}

let seekerToken: string;
let recruiterToken: string;
let createdJobId: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}/api`;
      resolve();
    });
  });
});

afterAll(async () => {
  // Cleanup created entities.
  const emails = [seeker.email, recruiter.email];
  const users = await prisma.user.findMany({ where: { email: { in: emails } } });
  for (const u of users) {
    await prisma.analyticsEvent.deleteMany({ where: { userId: u.id } });
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await prisma.application.deleteMany({ where: { userId: u.id } });
    await prisma.savedJob.deleteMany({ where: { userId: u.id } });
    await prisma.userSkill.deleteMany({ where: { userId: u.id } });
    await prisma.userProfile.deleteMany({ where: { userId: u.id } });
  }
  if (createdJobId) {
    await prisma.jobSkill.deleteMany({ where: { jobId: createdJobId } });
    await prisma.job.deleteMany({ where: { id: createdJobId } });
  }
  await prisma.company.deleteMany({ where: { recruiterId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.skill.deleteMany({ where: { name: { in: ["TestSkillAlpha", "TestSkillBeta"] } } });
  server.close();
  await prisma.$disconnect();
});

describe("authentication", () => {
  it("registers a job seeker and a recruiter", async () => {
    const s = await api("/auth/register", { method: "POST", body: JSON.stringify(seeker) });
    expect(s.status).toBe(201);
    expect(s.body.token).toBeTruthy();
    expect(s.body.user.role).toBe("JOB_SEEKER");
    seekerToken = s.body.token;

    const r = await api("/auth/register", { method: "POST", body: JSON.stringify(recruiter) });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("RECRUITER");
    recruiterToken = r.body.token;
  });

  it("rejects duplicate email", async () => {
    const res = await api("/auth/register", { method: "POST", body: JSON.stringify(seeker) });
    expect(res.status).toBe(409);
  });

  it("rejects weak password", async () => {
    const res = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...seeker, email: `weak-${Date.now()}@example.com`, password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("logs in with valid credentials and rejects invalid ones", async () => {
    const ok = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: seeker.email, password: seeker.password }),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: seeker.email, password: "wrong-password" }),
    });
    expect(bad.status).toBe(401);
  });

  it("returns current user for /auth/me", async () => {
    const res = await api("/auth/me", { token: seekerToken });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(seeker.email);
  });

  it("rejects /auth/me without token", async () => {
    const res = await api("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("profile", () => {
  it("updates profile with skills", async () => {
    const res = await api("/profile", {
      method: "PUT",
      token: seekerToken,
      body: JSON.stringify({
        location: "Pune",
        experience: 2,
        preferredRole: "Backend Developer",
        preferredLocation: "Pune",
        skills: ["TestSkillAlpha", "TestSkillBeta"],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.skills.sort()).toEqual(["TestSkillAlpha", "TestSkillBeta"]);
    expect(res.body.profile.preferredLocation).toBe("Pune");
  });

  it("requires auth", async () => {
    const res = await api("/profile");
    expect(res.status).toBe(401);
  });
});

describe("jobs", () => {
  it("allows a recruiter to create a job", async () => {
    const res = await api("/jobs", {
      method: "POST",
      token: recruiterToken,
      body: JSON.stringify({
        title: "Backend Developer",
        description: "A test job posting for the integration test suite with enough words.",
        location: "Pune",
        experienceRequired: 2,
        employmentType: "FULL_TIME",
        skills: ["TestSkillAlpha", "Java"],
      }),
    });
    expect(res.status).toBe(201);
    expect(res.body.job.skills.length).toBe(2);
    createdJobId = res.body.job.id;
  });

  it("rejects job creation by a seeker (role-based authz)", async () => {
    const res = await api("/jobs", {
      method: "POST",
      token: seekerToken,
      body: JSON.stringify({
        title: "Hacker Job",
        description: "This should not be allowed to be created by a job seeker account.",
        location: "Pune",
        experienceRequired: 0,
        employmentType: "FULL_TIME",
        skills: ["Java"],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("lists jobs and filters by location", async () => {
    const res = await api("/jobs?location=Pune&pageSize=5");
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.jobs.length);
  });

  it("gets job details", async () => {
    const res = await api(`/jobs/${createdJobId}`);
    expect(res.status).toBe(200);
    expect(res.body.job.title).toBe("Backend Developer");
  });

  it("updates and deletes its own job", async () => {
    const upd = await api(`/jobs/${createdJobId}`, {
      method: "PUT",
      token: recruiterToken,
      body: JSON.stringify({ title: "Senior Backend Developer" }),
    });
    expect(upd.status).toBe(200);
    expect(upd.body.job.title).toBe("Senior Backend Developer");

    // Recreate for apply tests below.
    const again = await api(`/jobs/${createdJobId}`, {
      method: "PUT",
      token: recruiterToken,
      body: JSON.stringify({ title: "Backend Developer" }),
    });
    expect(again.status).toBe(200);
  });
});

describe("search (IR engine over HTTP)", () => {
  it("returns ranked results with scores for tfidf and bm25", async () => {
    for (const algorithm of ["tfidf", "bm25"]) {
      const res = await api(`/search/jobs?q=backend%20developer%20pune&algorithm=${algorithm}`);
      expect(res.status).toBe(200);
      expect(res.body.algorithm).toBe(algorithm);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].rank).toBe(1);
      expect(res.body.results[0].score).toBeGreaterThan(0);
      expect(res.body.processedQuery).toContain("backend");
      // ranks are sequential
      res.body.results.forEach((r: { rank: number }, i: number) => expect(r.rank).toBe(i + 1));
    }
  });

  it("rejects an invalid algorithm", async () => {
    const res = await api("/search/jobs?q=java&algorithm=vector-magic");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/algorithm/i);
  });

  it("records a SEARCH event", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: seeker.email } });
    const before = await prisma.analyticsEvent.count({ where: { userId: user.id, eventType: "SEARCH" } });
    const res = await api("/search/jobs?q=integration%20test%20search&sessionId=test-session-1", { token: seekerToken });
    expect(res.status).toBe(200);
    const after = await prisma.analyticsEvent.count({ where: { userId: user.id, eventType: "SEARCH" } });
    expect(after).toBe(before + 1);
  });
});

describe("applications and saved jobs", () => {
  it("saves and unsaves a job", async () => {
    const save = await api(`/jobs/${createdJobId}/save`, { method: "POST", token: seekerToken });
    expect(save.status).toBe(200);
    const list = await api("/saved-jobs", { token: seekerToken });
    expect(list.body.savedJobs.some((s: { job: { id: string } }) => s.job.id === createdJobId)).toBe(true);
    const unsave = await api(`/jobs/${createdJobId}/save`, { method: "DELETE", token: seekerToken });
    expect(unsave.status).toBe(200);
  });

  it("applies to a job once", async () => {
    const res = await api(`/jobs/${createdJobId}/apply`, {
      method: "POST",
      token: seekerToken,
      body: JSON.stringify({ coverLetter: "I am a great fit." }),
    });
    expect(res.status).toBe(201);
    const dup = await api(`/jobs/${createdJobId}/apply`, { method: "POST", token: seekerToken, body: "{}" });
    expect(dup.status).toBe(409);
  });

  it("lists my applications", async () => {
    const res = await api("/applications", { token: seekerToken });
    expect(res.status).toBe(200);
    expect(res.body.applications.some((a: { jobId: string }) => a.jobId === createdJobId)).toBe(true);
  });

  it("lets the recruiter view applicants and change status", async () => {
    const list = await api("/recruiter/applicants", { token: recruiterToken });
    expect(list.status).toBe(200);
    const appId = list.body.applicants.find((a: { jobId: string }) => a.jobId === createdJobId)?.id;
    expect(appId).toBeTruthy();
    const upd = await api(`/recruiter/applicants/${appId}/status`, {
      method: "PUT",
      token: recruiterToken,
      body: JSON.stringify({ status: "SHORTLISTED" }),
    });
    expect(upd.status).toBe(200);
    expect(upd.body.application.status).toBe("SHORTLISTED");
  });
});

describe("analytics event ingestion", () => {
  it("accepts a JOB_VIEW event", async () => {
    const res = await api("/analytics/events", {
      method: "POST",
      token: seekerToken,
      body: JSON.stringify({
        eventType: "JOB_VIEW",
        jobId: createdJobId,
        sessionId: "test-session-2",
        metadata: { source: "test" },
      }),
    });
    expect(res.status).toBe(201);
    expect(res.body.event.id).toBeTruthy();
  });

  it("rejects unknown event types", async () => {
    const res = await api("/analytics/events", {
      method: "POST",
      token: seekerToken,
      body: JSON.stringify({ eventType: "NOT_A_REAL_EVENT" }),
    });
    expect(res.status).toBe(400);
  });
});
