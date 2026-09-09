/**
 * Recommendation engine unit tests (pure logic, no DB).
 */
import { describe, it, expect } from "vitest";
import {
  roleSimilarity,
  locationMatchScore,
  experienceMatchScore,
  parseWeights,
  DEFAULT_WEIGHTS,
} from "../src/services/recommendation.service";

describe("roleSimilarity", () => {
  it("is 1 for identical roles", () => {
    expect(roleSimilarity("Backend Developer", "Backend Developer")).toBe(1);
  });

  it("is high for overlapping titles", () => {
    const score = roleSimilarity("Backend Developer", "Backend Developer (Java)");
    expect(score).toBeGreaterThan(0.6);
  });

  it("is low for unrelated titles", () => {
    const score = roleSimilarity("Backend Developer", "Graphic Designer");
    expect(score).toBeLessThan(0.3);
  });

  it("is 0 when no preference is set", () => {
    expect(roleSimilarity(null, "Any Job")).toBe(0);
  });
});

describe("locationMatchScore", () => {
  it("exact match scores 1", () => {
    expect(locationMatchScore("Pune", "Pune")).toBe(1);
    expect(locationMatchScore("pune", "Pune ")).toBe(1); // case/space insensitive
  });

  it("remote jobs score 0.8 against a city preference", () => {
    expect(locationMatchScore("Remote", "Pune")).toBe(0.8);
    expect(locationMatchScore("Pune", "Remote")).toBe(0.8);
  });

  it("different cities score 0", () => {
    expect(locationMatchScore("Mumbai", "Pune")).toBe(0);
  });

  it("scores 0 with no preference", () => {
    expect(locationMatchScore("Pune", null)).toBe(0);
  });
});

describe("experienceMatchScore", () => {
  it("full score when candidate meets requirement", () => {
    const r = experienceMatchScore(2, 2);
    expect(r.score).toBe(1);
  });

  it("mild penalty for being significantly overqualified", () => {
    const r = experienceMatchScore(9, 1);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.score).toBeLessThan(1);
  });

  it("partial score when slightly under", () => {
    expect(experienceMatchScore(1, 2).score).toBe(0.6);
  });

  it("decays for large gaps", () => {
    const far = experienceMatchScore(0, 6).score;
    const near = experienceMatchScore(0, 2).score;
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThanOrEqual(0.2);
  });
});

describe("parseWeights", () => {
  it("falls back to defaults on missing/invalid env", () => {
    expect(parseWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights("bad,input")).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights("0.5,0.2,0.2")).toEqual(DEFAULT_WEIGHTS); // wrong length
  });

  it("parses custom weights", () => {
    expect(parseWeights("0.5,0.2,0.2,0.1")).toEqual({
      skills: 0.5, role: 0.2, location: 0.2, experience: 0.1,
    });
  });
});
