import { describe, it, expect } from "vitest";
import { processQuery, tokenize, lightStem } from "../src/services/ir/tokenizer";
import { TfidfIndex } from "../src/services/ir/tfidf";
import { Bm25Index } from "../src/services/ir/bm25";

describe("tokenizer pipeline", () => {
  it("normalizes case and whitespace", () => {
    expect(tokenize("Java   SPRING boot")).toEqual(["java", "spring", "boot"]);
  });

  it("removes stop words", () => {
    const out = processQuery("a developer with Java and SQL for the team");
    expect(out).not.toContain("a");
    expect(out).not.toContain("and");
    expect(out).not.toContain("the");
    expect(out).toContain("java");
    expect(out).toContain("sql");
  });

  it("stems plurals", () => {
    expect(lightStem("developers")).toBe("developer");
    expect(lightStem("technologies")).toBe("technology");
  });

  it("matches stemmed plurals across query and document", () => {
    const q = processQuery("Java developers");
    expect(q).toContain("developer"); // stemmed from "developers"
  });
});

const CORPUS = [
  { id: "j1", text: "Senior Java Backend Developer Spring Boot REST APIs SQL Pune TechNova" },
  { id: "j2", text: "Spring Boot Developer Java microservices REST APIs Mumbai InfyWay" },
  { id: "j3", text: "Python Backend Developer REST APIs Pandas SQL Bangalore QuantumSoft" },
  { id: "j4", text: "Frontend Developer React TypeScript JavaScript Remote PixelWorks" },
  { id: "j5", text: "DevOps Engineer Docker Kubernetes AWS CI CD CloudSprint" },
];

describe("TF-IDF vector space model", () => {
  const index = new TfidfIndex(CORPUS);

  it("ranks Java/Spring jobs above unrelated jobs", () => {
    const results = index.search("Java Spring Boot developer Pune");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("j1"); // has java + spring + boot + pune
    const ids = results.map((r) => r.id);
    expect(ids.indexOf("j1")).toBeLessThan(ids.indexOf("j4")); // frontend job ranks lower
  });

  it("returns scores in (0, 1] for cosine similarity", () => {
    const results = index.search("Java Spring Boot developer");
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1.0000001);
    }
  });

  it("gives a near-exact match a high cosine score", () => {
    // Query covers every term of j4's text.
    const results = index.search("frontend developer react typescript javascript remote");
    expect(results[0].id).toBe("j4");
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it("scores documents sharing zero terms at 0 (excluded)", () => {
    const results = index.search("kubernetes docker devops");
    expect(results.some((r) => r.id === "j4")).toBe(false); // no overlap with j4
  });

  it("rare terms get higher idf than common terms", () => {
    // "pune" appears in 1 doc; "developer" appears in 3 docs.
    expect(index.idf("pune")).toBeGreaterThan(index.idf("developer"));
  });

  it("explain() reports per-term contributions", () => {
    const ex = index.explain("Java Spring Boot", "j1");
    expect(ex).not.toBeNull();
    expect(ex!.score).toBeGreaterThan(0);
    const terms = ex!.terms.map((t) => t.term);
    expect(terms).toContain("java");
    expect(terms).toContain("spring");
    const total = ex!.terms.reduce((a, t) => a + t.contribution, 0);
    expect(total).toBeCloseTo(ex!.dotProduct, 5);
  });
});

describe("BM25 ranking", () => {
  const index = new Bm25Index(CORPUS);

  it("ranks matching jobs and puts Java/Spring jobs first", () => {
    const results = index.search("Java Spring Boot developer Pune");
    expect(results[0].id).toBe("j1");
    const ids = results.map((r) => r.id);
    expect(ids.indexOf("j5")).toBe(-1); // no term overlap → not returned
  });

  it("is sensitive to term frequency (higher tf → higher score)", () => {
    const boosted = new Bm25Index([
      { id: "a", text: "java java java java developer" },
      { id: "b", text: "java developer" },
    ]);
    const results = boosted.search("java");
    expect(results[0].id).toBe("a");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("is sensitive to document length (shorter doc scores higher for same tf)", () => {
    const idx = new Bm25Index([
      { id: "short", text: "java developer" },
      { id: "long", text: "java developer design build scalable server side applications rest apis spring boot sql microservices" },
    ]);
    const results = idx.search("developer");
    expect(results[0].id).toBe("short");
  });

  it("idf is non-negative for every term including absent terms", () => {
    expect(index.idf("java")).toBeGreaterThanOrEqual(0);
    expect(index.idf("zzzznotpresent")).toBeGreaterThanOrEqual(0);
  });

  it("explain() matches search() score for the same query/doc", () => {
    const results = index.search("Java Spring Boot developer", 5);
    const ex = index.explain("Java Spring Boot developer", results[0].id);
    expect(ex!.score).toBeCloseTo(results[0].score, 5);
  });
});

describe("TF-IDF vs BM25 ranking differences", () => {
  // A long document that mentions java often vs a short doc with java once.
  // BM25's length normalization + saturation penalizes the long doc more
  // than TF-IDF cosine does for this configuration.
  const docs = [
    { id: "short", text: "java developer" },
    {
      id: "long",
      text:
        "java java java java java java java java java java developer developer developer " +
        "design build test deploy maintain large scale distributed systems with java " +
        "across multiple teams using agile practices and java tooling",
    },
  ];

  it("both algorithms rank but their score scales and behavior differ", () => {
    const tfidf = new TfidfIndex(docs).search("java");
    const bm25 = new Bm25Index(docs).search("java");
    expect(tfidf.length).toBe(2);
    expect(bm25.length).toBe(2);

    // Cosine similarity is normalized to [0,1]; BM25 is unbounded above.
    expect(Math.max(...tfidf.map((r) => r.score))).toBeLessThanOrEqual(1.0000001);
    expect(Math.max(...bm25.map((r) => r.score))).toBeGreaterThan(0);

    // BM25 term-frequency saturation: the tf component is bounded by k1+1,
    // so a doc with tf=19 can score at most ~2.5x a doc with tf=1 (same
    // idf), no matter how many times the term repeats.
    const [long, short] = bm25[0].id === "long" ? bm25 : [bm25[1], bm25[0]];
    expect(long.id).toBe("long");
    expect(long.score / short.score).toBeLessThan(2.5);
    expect(long.score / short.score).toBeGreaterThan(1); // still ranks higher
  });
});
