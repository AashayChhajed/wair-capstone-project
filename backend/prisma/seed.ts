/**
 * Database seed.
 *
 * Creates: demo accounts, 50+ seekers, 10 recruiters, 15 companies,
 * 100+ realistic jobs, 20 skills, ~120 applications, saved jobs and a
 * realistic 30-day clickstream (sessions → searches → job views → saves →
 * apply starts → applications) so every dashboard has meaningful data.
 *
 * Run: npm run seed  (inside backend/)
 */
import { PrismaClient, ApplicationStatus, EmploymentType, EventType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

// ---------------------------------------------------------------- skills

const SKILLS = [
  "Java", "Spring Boot", "SQL", "REST APIs", "Python", "React", "TypeScript",
  "JavaScript", "Node.js", "Docker", "Kubernetes", "AWS", "PostgreSQL",
  "MongoDB", "Microservices", "Machine Learning", "Pandas", "TensorFlow",
  "Selenium", "CI/CD",
];

// ---------------------------------------------------------------- roles

interface RoleTemplate {
  title: string;
  skills: string[];
  description: string;
  salary: [number, number];
  exp: [number, number];
}

const ROLES: RoleTemplate[] = [
  {
    title: "Java Developer",
    salary: [600000, 1400000],
    exp: [1, 6],
    skills: ["Java", "Spring Boot", "SQL", "REST APIs", "Microservices"],
    description:
      "We are looking for a Java Developer to design and build scalable server-side applications. You will develop RESTful APIs with Spring Boot, write efficient SQL queries, and participate in code reviews. Our team ships microservices on a weekly cadence and values clean, testable code.",
  },
  {
    title: "Backend Developer",
    salary: [700000, 1600000],
    exp: [2, 7],
    skills: ["Java", "Spring Boot", "PostgreSQL", "REST APIs", "Docker"],
    description:
      "Join our platform team as a Backend Developer. You will own services end to end: designing database schemas, implementing business logic in Spring Boot, exposing well-documented REST APIs and containerizing workloads with Docker. Strong SQL and API design skills are essential.",
  },
  {
    title: "Frontend Developer",
    salary: [500000, 1300000],
    exp: [1, 5],
    skills: ["React", "TypeScript", "JavaScript", "REST APIs"],
    description:
      "As a Frontend Developer you will craft responsive, accessible interfaces in React and TypeScript. You will translate design mockups into reusable components, integrate REST APIs, and optimize rendering performance. A good eye for detail and UX is expected.",
  },
  {
    title: "Full Stack Developer",
    salary: [600000, 1500000],
    exp: [1, 6],
    skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "REST APIs"],
    description:
      "We need a Full Stack Developer comfortable across the stack: building React frontends, Node.js services and PostgreSQL data models. You will ship features end to end, from schema design to polished UI, and collaborate closely with product and design.",
  },
  {
    title: "Python Developer",
    salary: [500000, 1200000],
    exp: [1, 5],
    skills: ["Python", "SQL", "REST APIs", "Pandas"],
    description:
      "Looking for a Python Developer to build data-driven backend services. Day to day you will write clean Python, model data with Pandas, expose REST APIs and tune SQL queries. Experience with automation and testing frameworks is a plus.",
  },
  {
    title: "Data Analyst",
    salary: [400000, 1000000],
    exp: [0, 4],
    skills: ["SQL", "Python", "Pandas"],
    description:
      "The analytics team is hiring a Data Analyst. You will write complex SQL, build dashboards, analyze user behavior funnels and present insights that drive product decisions. Strong communication and SQL skills matter more than tooling familiarity.",
  },
  {
    title: "Data Scientist",
    salary: [800000, 1800000],
    exp: [2, 8],
    skills: ["Python", "Machine Learning", "Pandas", "SQL"],
    description:
      "As a Data Scientist you will build predictive models on large datasets, run experiments, and productionize machine learning pipelines. You should be fluent in Python, Pandas and statistical evaluation, and able to explain models to non-technical stakeholders.",
  },
  {
    title: "Machine Learning Engineer",
    salary: [900000, 2000000],
    exp: [2, 8],
    skills: ["Python", "Machine Learning", "TensorFlow", "Docker"],
    description:
      "We are hiring a Machine Learning Engineer to take models from prototype to production. You will train and evaluate models with TensorFlow, package them in Docker containers, and build serving infrastructure with monitoring and retraining pipelines.",
  },
  {
    title: "DevOps Engineer",
    salary: [700000, 1700000],
    exp: [2, 7],
    skills: ["Docker", "Kubernetes", "CI/CD", "AWS"],
    description:
      "Join our infrastructure team as a DevOps Engineer. You will own CI/CD pipelines, manage Kubernetes clusters, automate deployments and improve observability. Deep knowledge of Docker, containers and cloud infrastructure is required.",
  },
  {
    title: "Cloud Engineer",
    salary: [700000, 1600000],
    exp: [2, 6],
    skills: ["AWS", "Docker", "CI/CD", "Kubernetes"],
    description:
      "As a Cloud Engineer you will design resilient cloud architecture on AWS, automate provisioning, optimize costs and harden security. You will partner with development teams to make deployments boring, repeatable and safe.",
  },
  {
    title: "QA Engineer",
    salary: [400000, 1000000],
    exp: [1, 5],
    skills: ["Selenium", "SQL", "REST APIs"],
    description:
      "We are looking for a QA Engineer to own quality across web products. You will design automated test suites with Selenium, validate REST APIs, write regression plans and work with developers to reproduce and fix defects early.",
  },
  {
    title: "Software Engineer",
    salary: [500000, 1400000],
    exp: [0, 6],
    skills: ["Java", "JavaScript", "SQL", "REST APIs"],
    description:
      "Software Engineer (generalist) to work across our product suite. Expect varied work: backend features in Java, frontend touches in JavaScript, database tuning and API integrations. Curiosity and ownership matter more than any single technology.",
  },
];

const TITLE_PREFIXES = ["", "Senior ", "Junior ", "Lead ", "Associate "];

const LOCATIONS = ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Delhi", "Chennai", "Remote"];

const COMPANIES = [
  { name: "TechNova Solutions", location: "Pune", description: "Product engineering studio building SaaS tools for logistics." },
  { name: "InfyWay Systems", location: "Bangalore", description: "IT services and digital transformation consultancy." },
  { name: "QuantumSoft Labs", location: "Hyderabad", description: "AI-first product company in healthcare analytics." },
  { name: "BlueOrbit Technologies", location: "Mumbai", description: "Fintech platform serving two million retail users." },
  { name: "DataPulse Analytics", location: "Pune", description: "Business intelligence and data engineering firm." },
  { name: "CloudSprint Inc.", location: "Remote", description: "Remote-first cloud infrastructure provider." },
  { name: "Zenith Apps", location: "Delhi", description: "Consumer apps company with 10M+ downloads." },
  { name: "NexaCore Systems", location: "Chennai", description: "Enterprise systems integrator for manufacturing." },
  { name: "BrightMinds Software", location: "Bangalore", description: "EdTech platform for K-12 learning." },
  { name: "Vertex Digital", location: "Mumbai", description: "E-commerce enablement and martech solutions." },
  { name: "StreamLine Tech", location: "Hyderabad", description: "Video streaming infrastructure company." },
  { name: "AgileForge", location: "Pune", description: "Developer tools and DevOps automation startup." },
  { name: "CoreStack Solutions", location: "Bangalore", description: "B2B SaaS for supply chain optimization." },
  { name: "PixelWorks Studio", location: "Remote", description: "Design-led digital agency with engineering teams." },
  { name: "FinEdge Technologies", location: "Delhi", description: "Banking and insurance technology provider." },
];

const SEEKER_NAMES = [
  "Rahul Sharma", "Priya Patel", "Amit Kumar", "Sneha Reddy", "Vikram Singh",
  "Ananya Iyer", "Rohan Mehta", "Kavya Nair", "Arjun Gupta", "Divya Joshi",
  "Karan Malhotra", "Pooja Desai", "Nikhil Rao", "Shreya Banerjee", "Aditya Verma",
  "Neha Kulkarni", "Siddharth Jain", "Riya Kapoor", "Manish Tiwari", "Ishita Saxena",
  "Varun Chauhan", "Tanvi Shah", "Rahul Verma", "Aishwarya Menon", "Sanjay Pillai",
  "Meera Krishnan", "Deepak Sharma", "Lakshmi Prasad", "Rohit Kadam", "Preeti Singh",
  "Aakash Agarwal", "Simran Kaur", "Harshad Patil", "Anjali Dubey", "Suresh Babu",
  "Nisha Agarwal", "Prateek Bansal", "Swathi Reddy", "Gaurav Pandey", "Aparna Das",
  "Yash Trivedi", "Komal Bhatt", "Naveen Kumar", "Ritu Jain", "Abhishek Roy",
  "Sakshi Sharma", "Tarun Bhatia", "Megha Shetty", "Alok Mishra", "Farhan Sheikh",
];

const SEARCH_QUERIES = [
  "Java Spring Boot developer Pune",
  "Python developer Bangalore",
  "React frontend developer Mumbai",
  "backend developer",
  "data analyst SQL",
  "DevOps engineer AWS",
  "machine learning engineer",
  "full stack developer remote",
  "QA engineer selenium",
  "frontend developer",
  "java developer",
  "python data scientist",
  "node.js developer",
  "cloud engineer kubernetes",
  "software engineer Chennai",
  "react typescript",
  "spring boot microservices",
  "sql analyst",
  "data scientist Python Delhi",
  "senior java developer Pune",
];

// Weighted random helpers --------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(arr: T[], weight: (item: T) => number): T {
  const total = arr.reduce((sum, item) => sum + weight(item), 0);
  let roll = Math.random() * total;
  for (const item of arr) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return arr[arr.length - 1];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number, jitterHours = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(9, 21), randInt(0, 59), randInt(0, 59), 0);
  if (jitterHours) d.setMinutes(d.getMinutes() + randInt(-jitterHours, jitterHours) * 60);
  return d;
}

/** Deterministic 50/50 A/B assignment — same hash as abtest.service.ts. */
function abVariantFor(userId: string): "A" | "B" {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "A" : "B";
}

async function main() {
  console.log("🌱 Seeding database...");

  // Clean in FK-safe order.
  await prisma.$transaction([
    prisma.analyticsEvent.deleteMany(),
    prisma.session.deleteMany(),
    prisma.savedJob.deleteMany(),
    prisma.application.deleteMany(),
    prisma.jobSkill.deleteMany(),
    prisma.userSkill.deleteMany(),
    prisma.job.deleteMany(),
    prisma.company.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.skill.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ------------------------------------------------------ skills
  const skillRecords = await Promise.all(
    SKILLS.map((name) => prisma.skill.create({ data: { name } })),
  );
  const skillByName = new Map(skillRecords.map((s) => [s.name, s]));

  // ------------------------------------------------------ admin + demo users
  const admin = await prisma.user.create({
    data: {
      name: "Platform Admin",
      email: "demo.admin@example.com",
      passwordHash,
      role: "ADMIN",
      profile: { create: { location: "Pune" } },
    },
  });

  const demoSeeker = await prisma.user.create({
    data: {
      name: "Rahul Sharma",
      email: "demo.seeker@example.com",
      passwordHash,
      role: "JOB_SEEKER",
      profile: {
        create: {
          location: "Pune",
          experience: 2,
          preferredRole: "Backend Developer",
          preferredLocation: "Pune",
          bio: "Backend developer with 2 years of experience in Java, Spring Boot and SQL. Passionate about clean APIs and performant databases.",
        },
      },
      skills: {
        create: ["Java", "Spring Boot", "SQL", "REST APIs"].map((name) => ({
          skillId: skillByName.get(name)!.id,
        })),
      },
    },
  });
  // Phase 4: assign the demo seeker an A/B variant so the experiment
  // dashboard has funnel data immediately after seeding.
  await prisma.user.update({
    where: { id: demoSeeker.id },
    data: { abVariant: abVariantFor(demoSeeker.id), abAssignedAt: new Date() },
  });

  const demoRecruiter = await prisma.user.create({
    data: {
      name: "Sara Recruiter",
      email: "demo.recruiter@example.com",
      passwordHash,
      role: "RECRUITER",
      profile: { create: { location: "Pune" } },
      companies: {
        create: {
          name: "TechNova Solutions",
          description: COMPANIES[0].description,
          location: "Pune",
          website: "https://technova.example.com",
        },
      },
    },
  });

  // ------------------------------------------------------ recruiters + companies
  const recruiterUsers: { id: string; companyId: string }[] = [
    { id: demoRecruiter.id, companyId: "" },
  ];
  // Fix demo recruiter companyId after creation.
  const demoCompany = await prisma.company.findFirst({ where: { recruiterId: demoRecruiter.id } });

  const remaining = COMPANIES.slice(1, 10); // 9 more recruiters → 10 total
  for (const c of remaining) {
    const idx = remaining.indexOf(c);
    const recruiter = await prisma.user.create({
      data: {
        name: `${pick(["Alok", "Meera", "Rajesh", "Nandini", "Suresh", "Kiran", "Divya", "Manoj", "Preeti"])} ${pick(["Kulkarni", "Nair", "Bose", "Chopra", "Rathod", "Menon", "Sinha", "Gill", "Acharya"])}`,
        email: `recruiter${idx + 1}@example.com`,
        passwordHash,
        role: "RECRUITER",
        profile: { create: { location: c.location } },
        companies: {
          create: { name: c.name, description: c.description, location: c.location },
        },
      },
    });
    const company = await prisma.company.findFirstOrThrow({ where: { recruiterId: recruiter.id } });
    recruiterUsers.push({ id: recruiter.id, companyId: company.id });
  }
  recruiterUsers[0].companyId = demoCompany!.id;

  // 5 extra companies without dedicated recruiters (owned by existing ones)
  const extraCompanies = COMPANIES.slice(10);
  for (let i = 0; i < extraCompanies.length; i++) {
    const owner = recruiterUsers[randInt(0, recruiterUsers.length - 1)];
    await prisma.company.create({
      data: {
        recruiterId: owner.id,
        name: extraCompanies[i].name,
        description: extraCompanies[i].description,
        location: extraCompanies[i].location,
      },
    });
  }

  const allCompanies = await prisma.company.findMany();
  console.log(`  ✓ ${allCompanies.length} companies, 10 recruiters`);

  // ------------------------------------------------------ seekers
  const seekerUsers: string[] = [demoSeeker.id];
  for (let i = 0; i < SEEKER_NAMES.length - 1; i++) {
    const name = SEEKER_NAMES.filter((n) => n !== "Rahul Sharma")[i];
    const u = await prisma.user.create({
      data: {
        name,
        email: `seeker${i + 1}@example.com`,
        passwordHash,
        role: "JOB_SEEKER",
        profile: {
          create: {
            location: pick(LOCATIONS),
            experience: randInt(0, 8),
            preferredRole: pick(ROLES).title,
            preferredLocation: pick(LOCATIONS),
            bio: "Looking for new opportunities.",
          },
        },
        skills: {
          create: Array.from(new Set(Array.from({ length: randInt(2, 5) }, () => pick(SKILLS)))).map(
            (name) => ({ skillId: skillByName.get(name)!.id }),
          ),
        },
      },
    });
    // Phase 4: assign a variant at seed time (sticky per user).
    await prisma.user.update({
      where: { id: u.id },
      data: { abVariant: abVariantFor(u.id), abAssignedAt: new Date() },
    });
    seekerUsers.push(u.id);
  }
  console.log(`  ✓ ${seekerUsers.length} job seekers`);

  // ------------------------------------------------------ jobs (100+)
  type JobSeed = { roleId: number; companyId: string; location: string; prefix: string; postedDaysAgo: number; status: "ACTIVE" | "CLOSED" };
  const jobSeeds: JobSeed[] = [];
  for (let i = 0; i < 104; i++) {
    const roleId = i % ROLES.length;
    const company = allCompanies[i % allCompanies.length];
    const location = i % 7 === 6 ? "Remote" : pick(LOCATIONS);
    jobSeeds.push({
      roleId,
      companyId: company.id,
      location,
      prefix: pick(TITLE_PREFIXES),
      postedDaysAgo: randInt(0, 45),
      status: i % 13 === 12 ? "CLOSED" : "ACTIVE",
    });
  }

  const jobRecords: { id: string; title: string; skills: string[] }[] = [];
  for (const seed of jobSeeds) {
    const role = ROLES[seed.roleId];
    const title = `${seed.prefix}${role.title}`.trim();
    const extraSkill = pick(SKILLS.filter((s) => !role.skills.includes(s)));
    const jobSkills = [...role.skills, extraSkill];
    const exp = randInt(role.exp[0], role.exp[1]);
    const salMin = randInt(role.salary[0], role.salary[1]);
    const salMax = salMin + randInt(2, 8) * 100000;

    const job = await prisma.job.create({
      data: {
        companyId: seed.companyId,
        title,
        description: role.description,
        location: seed.location,
        experienceRequired: exp,
        salaryMin: salMin,
        salaryMax: salMax,
        employmentType: pickWeighted<EmploymentType>(
          ["FULL_TIME", "FULL_TIME", "FULL_TIME", "CONTRACT", "INTERNSHIP", "PART_TIME"],
          () => 1,
        ),
        status: seed.status,
        postedAt: daysAgo(seed.postedDaysAgo),
        applicationDeadline: (() => {
          const d = daysAgo(-randInt(5, 40));
          return d;
        })(),
        skills: {
          create: jobSkills
            .filter((s) => skillByName.has(s))
            .map((s) => ({ skillId: skillByName.get(s)!.id })),
        },
      },
    });
    jobRecords.push({ id: job.id, title, skills: jobSkills });
  }
  console.log(`  ✓ ${jobRecords.length} jobs`);

  // ------------------------------------------------------ applications
  const activeJobs = jobRecords.filter((_, i) => jobSeeds[i].status === "ACTIVE");
  const applications: { userId: string; jobId: string; status: ApplicationStatus; createdAt: Date }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 130; i++) {
    const userId = pick(seekerUsers);
    const job = pick(activeJobs);
    const key = `${userId}:${job.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    applications.push({
      userId,
      jobId: job.id,
      status: pickWeighted<ApplicationStatus>(
        ["APPLIED", "APPLIED", "UNDER_REVIEW", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "REJECTED", "REJECTED", "HIRED"],
        () => 1,
      ),
      createdAt: daysAgo(randInt(0, 29)),
    });
    if (applications.length >= 110) break;
  }
  await prisma.application.createMany({ data: applications });
  console.log(`  ✓ ${applications.length} applications`);

  // Saved jobs
  const savedPairs = new Set<string>();
  const savedRows: { userId: string; jobId: string; createdAt: Date }[] = [];
  for (let i = 0; i < 60; i++) {
    const userId = pick(seekerUsers);
    const job = pick(activeJobs);
    const key = `${userId}:${job.id}`;
    if (savedPairs.has(key)) continue;
    savedPairs.add(key);
    savedRows.push({ userId, jobId: job.id, createdAt: daysAgo(randInt(0, 29)) });
  }
  await prisma.savedJob.createMany({ data: savedRows });

  // ------------------------------------------------------ sessions + clickstream
  // Realistic 30-day funnel: sessions → PAGE_VIEW → SEARCH → JOB_VIEW →
  // JOB_SAVE → APPLY_START → APPLICATION_SUBMITTED (+ recommendation events).
  console.log("  … generating clickstream (this is the big one)");
  const eventRows: {
    userId: string | null;
    sessionId: string;
    eventType: EventType;
    jobId?: string | null;
    searchQuery?: string | null;
    metadata?: object;
    timestamp: Date;
  }[] = [];

  const sessionIds: string[] = [];
  for (let s = 0; s < 420; s++) {
    const userId = pick(seekerUsers);
    const daysBack = pickWeighted(
      Array.from({ length: 30 }, (_, i) => i),
      (d) => 30 - d, // more activity on recent days
    );
    const startedAt = daysAgo(daysBack);
    const sessionId = `seed-session-${s}`;
    sessionIds.push(sessionId);

    await prisma.session.create({
      data: { id: sessionId, userId, startedAt, endedAt: new Date(startedAt.getTime() + randInt(3, 25) * 60000) },
    });

    const at = (offsetMin: number) => new Date(startedAt.getTime() + offsetMin * 60000);
    let cursor = 0;

    eventRows.push({ userId, sessionId, eventType: "SESSION_START", timestamp: at(cursor) });
    eventRows.push({
      userId, sessionId, eventType: "PAGE_VIEW", metadata: { path: "/" }, timestamp: at(cursor++),
    });

    // 70% of sessions search
    if (Math.random() < 0.7) {
      const q = pick(SEARCH_QUERIES);
      const nResults = Math.random() < 0.06 ? 0 : randInt(2, 18);
      eventRows.push({
        userId, sessionId, eventType: "SEARCH", searchQuery: q,
        metadata: { resultCount: nResults, algorithm: Math.random() < 0.5 ? "tfidf" : "bm25" },
        timestamp: at(cursor++),
      });
      if (Math.random() < 0.25) {
        eventRows.push({
          userId, sessionId, eventType: "FILTER_USED", searchQuery: q,
          metadata: { filter: pick(["location", "employmentType", "experience", "salaryMin"]) },
          timestamp: at(cursor++),
        });
      }

      // 65% of searches lead to ≥1 job view
      if (nResults > 0 && Math.random() < 0.65) {
        const viewedJobs = Array.from({ length: randInt(1, 3) }, () => pick(activeJobs));
        for (const job of viewedJobs) {
          eventRows.push({
            userId, sessionId, eventType: "JOB_VIEW", jobId: job.id,
            metadata: { source: "search" }, timestamp: at(cursor++),
          });

          if (Math.random() < 0.18) {
            eventRows.push({ userId, sessionId, eventType: "JOB_SAVE", jobId: job.id, timestamp: at(cursor++) });
          }

          // 35% of job views start an application
          if (Math.random() < 0.35) {
            eventRows.push({
              userId, sessionId, eventType: "APPLY_START", jobId: job.id, timestamp: at(cursor++),
            });
            // 60% of apply starts submit
            if (Math.random() < 0.6) {
              eventRows.push({
                userId, sessionId, eventType: "APPLICATION_SUBMITTED", jobId: job.id, timestamp: at(cursor++),
              });
            }
          }
        }
      }
    } else {
      // browse without search
      if (Math.random() < 0.5) {
        const job = pick(activeJobs);
        eventRows.push({
          userId, sessionId, eventType: "JOB_VIEW", jobId: job.id,
          metadata: { source: "browse" }, timestamp: at(cursor++),
        });
      }
    }

    // recommendation activity
    if (Math.random() < 0.4) {
      const recJob = pick(activeJobs);
      eventRows.push({
        userId, sessionId, eventType: "RECOMMENDATION_IMPRESSION", jobId: recJob.id,
        metadata: { screen: "recommendations" }, timestamp: at(cursor++),
      });
      if (Math.random() < 0.3) {
        eventRows.push({
          userId, sessionId, eventType: "RECOMMENDATION_CLICK", jobId: recJob.id, timestamp: at(cursor++),
        });
      }
    }

    eventRows.push({ userId, sessionId, eventType: "SESSION_END", timestamp: at(cursor) });
  }

  // Demo seeker gets a rich, presentation-ready history (last 7 days).
  {
    const userId = demoSeeker.id;
    for (let s = 0; s < 6; s++) {
      const startedAt = daysAgo(s);
      const sessionId = `seed-demo-session-${s}`;
      await prisma.session.create({
        data: { id: sessionId, userId, startedAt, endedAt: new Date(startedAt.getTime() + 18 * 60000) },
      });
      const at = (m: number) => new Date(startedAt.getTime() + m * 60000);
      eventRows.push({ userId, sessionId, eventType: "SESSION_START", timestamp: at(0) });
      eventRows.push({ userId, sessionId, eventType: "PAGE_VIEW", metadata: { path: "/jobs" }, timestamp: at(0) });
      eventRows.push({
        userId, sessionId, eventType: "SEARCH", searchQuery: "Java Spring Boot developer Pune",
        metadata: { resultCount: 7, algorithm: "tfidf" }, timestamp: at(1),
      });
      const jobs = [pick(activeJobs), pick(activeJobs)];
      for (const job of jobs) {
        eventRows.push({ userId, sessionId, eventType: "JOB_VIEW", jobId: job.id, metadata: { source: "search" }, timestamp: at(3) });
      }
      eventRows.push({ userId, sessionId, eventType: "JOB_SAVE", jobId: jobs[0].id, timestamp: at(5) });
      eventRows.push({ userId, sessionId, eventType: "APPLY_START", jobId: jobs[1].id, timestamp: at(7) });
      if (s < 3) {
        eventRows.push({ userId, sessionId, eventType: "APPLICATION_SUBMITTED", jobId: jobs[1].id, timestamp: at(8) });
      }
      eventRows.push({ userId, sessionId, eventType: "RECOMMENDATION_IMPRESSION", jobId: pick(activeJobs).id, timestamp: at(10) });
      eventRows.push({ userId, sessionId, eventType: "SESSION_END", timestamp: at(15) });
    }
  }

  // Insert events in chunks.
  const CHUNK = 500;
  for (let i = 0; i < eventRows.length; i += CHUNK) {
    await prisma.analyticsEvent.createMany({ data: eventRows.slice(i, i + CHUNK) });
  }
  console.log(`  ✓ ${eventRows.length} analytics events across ${sessionIds.length + 6} sessions`);

  console.log("\n✅ Seed complete!");
  console.log("\nDemo accounts (password for all: Password123!)");
  console.log("  Job Seeker : demo.seeker@example.com");
  console.log("  Recruiter  : demo.recruiter@example.com");
  console.log("  Admin      : demo.admin@example.com");
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
