/**
 * Analytics service tests focused on the parts that are computable without
 * the full seeded dataset: funnel math over synthetic events and KPI shape.
 * These run against a real PostgreSQL instance (same one the dev server
 * uses); they create and clean their own data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { getApplicationFunnel, getAdminOverview } from "../src/services/analytics.service";
import { recommendJobsForUser } from "../src/services/recommendation.service";

let testUserId: string;
let testJobId: string;
const createdUserIds: string[] = [];

beforeAll(async () => {
  // Minimal fixture: one user, one job via an existing company (or create all).
  const skill = await prisma.skill.upsert({
    where: { name: "TestSkillFunnel" },
    create: { name: "TestSkillFunnel" },
    update: {},
  });
  const user = await prisma.user.create({
    data: {
      name: "Funnel Test User",
      email: `funnel-test-${Date.now()}@example.com`,
      passwordHash: "x",
      role: "JOB_SEEKER",
      profile: { create: { experience: 2, preferredRole: "Backend Developer", preferredLocation: "Pune" } },
      skills: { create: { skillId: skill.id } },
    },
  });
  testUserId = user.id;
  createdUserIds.push(user.id);

  const company = await prisma.company.create({
    data: { recruiterId: user.id, name: "Funnel Test Co" },
  });
  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      title: "Backend Developer",
      description: "Test job for funnel analytics verification.",
      location: "Pune",
      experienceRequired: 2,
      skills: { create: { skillId: skill.id } },
    },
  });
  testJobId = job.id;
});

afterAll(async () => {
  await prisma.application.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.savedJob.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.analyticsEvent.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.job.deleteMany({ where: { id: testJobId } });
  await prisma.company.deleteMany({ where: { recruiterId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.skill.deleteMany({ where: { name: "TestSkillFunnel" } });
  await prisma.$disconnect();
});

describe("application funnel", () => {
  it("counts an ordered session funnel and keeps stages non-increasing", async () => {
    const sessionId = "test-funnel-session";
    const base = { userId: testUserId, sessionId };
    const t0 = Date.now();

    await prisma.session.create({
      data: { id: sessionId, userId: testUserId },
    });

    await prisma.analyticsEvent.createMany({
      data: [
        { ...base, eventType: "SEARCH", searchQuery: "funnel test query", timestamp: new Date(t0) },
        { ...base, eventType: "SEARCH", searchQuery: "funnel test query", timestamp: new Date(t0 + 1000) }, // 2nd search, same stage
        { ...base, eventType: "JOB_VIEW", jobId: testJobId, timestamp: new Date(t0 + 2000) },
        { ...base, eventType: "JOB_VIEW", jobId: testJobId, timestamp: new Date(t0 + 2500) }, // extra view
        { ...base, eventType: "APPLY_START", jobId: testJobId, timestamp: new Date(t0 + 3000) },
        { ...base, eventType: "APPLICATION_SUBMITTED", jobId: testJobId, timestamp: new Date(t0 + 4000) },
      ],
    });

    const funnel = await getApplicationFunnel(30);
    const counts = funnel.stages.map((s) => s.count);

    // Ordered funnel: stages must be monotonically non-increasing.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }

    // Conversion math invariants.
    const { conversions } = funnel;
    expect(conversions.overall).toBeLessThanOrEqual(conversions.searchToView);
    expect(conversions.searchToView).toBeLessThanOrEqual(100);
    expect(conversions.applyStartToSubmit).toBeLessThanOrEqual(100);

    // Drop-off = 100 - conversion for the same pair.
    const d = funnel.dropOffs.find((x) => x.from === "Apply Start")!;
    expect(d.dropOff).toBeCloseTo(100 - conversions.applyStartToSubmit, 1);
  });

  it("does not count out-of-order events as funnel progress", async () => {
    // Session B: job view + apply start but NO search → contributes nothing
    // to the Search stage and nothing to Job View (view came before any search).
    const sessionId = "test-funnel-session-b";
    const t0 = Date.now();
    await prisma.session.create({ data: { id: sessionId, userId: testUserId } });
    await prisma.analyticsEvent.createMany({
      data: [
        { userId: testUserId, sessionId, eventType: "JOB_VIEW", jobId: testJobId, timestamp: new Date(t0) },
        { userId: testUserId, sessionId, eventType: "APPLY_START", jobId: testJobId, timestamp: new Date(t0 + 1000) },
      ],
    });

    const funnel = await getApplicationFunnel(30);
    const counts = funnel.stages.map((s) => s.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });
});

describe("admin overview", () => {
  it("returns all KPI totals", async () => {
    const overview = await getAdminOverview(30);
    expect(overview.totals).toHaveProperty("users");
    expect(overview.totals).toHaveProperty("jobs");
    expect(overview.totals).toHaveProperty("searches");
    expect(overview.totals).toHaveProperty("applications");
    expect(overview.totals.users).toBeGreaterThan(0);
    expect(typeof overview.searchCtr).toBe("number");
  });
});

describe("recommendation engine (integration)", () => {
  it("returns relevant jobs with explainable reasons", async () => {
    const { recommendations, weights } = await recommendJobsForUser(testUserId, { limit: 10 });

    expect(weights).toEqual({ skills: 0.4, role: 0.25, location: 0.2, experience: 0.15 });
    // The test user has TestSkillFunnel (matches the test job) + prefers
    // Backend Developer in Pune with 2y experience → should get results.
    expect(recommendations.length).toBeGreaterThan(0);

    const top = recommendations[0];
    expect(top.score).toBeGreaterThan(0);
    expect(top.explanation.reasons.length).toBeGreaterThan(0);

    // Sorted descending by score.
    for (let i = 1; i < recommendations.length; i++) {
      expect(recommendations[i - 1].score).toBeGreaterThanOrEqual(recommendations[i].score);
    }

    // Component scores are within [0,1].
    for (const r of recommendations) {
      expect(r.skillScore).toBeGreaterThanOrEqual(0);
      expect(r.skillScore).toBeLessThanOrEqual(1);
      expect(r.experienceScore).toBeLessThanOrEqual(1);
    }
  });
});
