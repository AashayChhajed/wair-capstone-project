/**
 * Unit tests for Phase 2 (controlled query expansion) and Phase 3
 * (baseline rule-based search-intent classifier).
 */
import { describe, it, expect } from "vitest";
import {
  expandQuery,
  expansionForTerm,
  SYNONYM_DICT,
  MAX_EXPANSIONS_PER_QUERY,
} from "../src/services/ir/queryExpansion";
import { classifyIntent } from "../src/services/ir/intent";

describe("controlled query expansion (Phase 2)", () => {
  it("expands a short alias token to its canonical term", () => {
    const r = expandQuery("js developer");
    expect(r.didExpand).toBe(true);
    expect(r.expandedQuery).toBe("javascript developer");
    expect(r.applied).toEqual([{ from: "js", to: ["javascript"] }]);
  });

  it("expands multi-word targets (ML → machine learning)", () => {
    const r = expandQuery("ml engineer");
    expect(r.expandedQuery).toBe("machine learning engineer");
    expect(r.applied).toEqual([{ from: "ml", to: ["machine learning"] }]);
  });

  it("expands the example dictionary entries", () => {
    expect(expandQuery("node developer").expandedQuery).toBe("node.js developer");
    expect(expandQuery("db administrator").expandedQuery).toBe("database administrator");
    expect(expandQuery("reactjs frontend").expandedQuery).toBe("react frontend");
  });

  it("does NOT expand when the target term is already in the query", () => {
    // "javascript js" — js is redundant, expanding would duplicate the term.
    const r = expandQuery("javascript js developer");
    expect(r.didExpand).toBe(false);
    expect(r.applied).toHaveLength(0);
    expect(r.expandedQuery).toBe("javascript js developer");
  });

  it("caps the number of expansions per query (anti over-expansion)", () => {
    const r = expandQuery("js ml ai db node");
    expect(r.applied.length).toBe(MAX_EXPANSIONS_PER_QUERY);
    expect(r.expandedQuery).toContain("javascript");
    expect(r.expandedQuery).toContain("machine learning");
    // Beyond the cap, tokens pass through unchanged.
    expect(r.expandedQuery).toContain("db");
    expect(r.expandedQuery).toContain("node");
  });

  it("passes unknown tokens through unchanged", () => {
    const r = expandQuery("java spring boot pune");
    expect(r.didExpand).toBe(false);
    expect(r.expandedQuery).toBe("java spring boot pune");
  });

  it("is case-insensitive and handles punctuation in keys", () => {
    expect(expandQuery("JS developer").expandedQuery).toBe("javascript developer");
    expect(expandQuery("ReactJS").expandedQuery).toBe("react");
  });

  it("exposes the dictionary for the explain endpoint", () => {
    expect(expansionForTerm("js")).toEqual(["javascript"]);
    expect(expansionForTerm("ML")).toEqual(["machine learning"]);
    expect(expansionForTerm("not-a-dict-term")).toBeNull();
    expect(Object.keys(SYNONYM_DICT).length).toBeGreaterThan(10);
  });
});

describe("baseline search-intent classifier (Phase 3)", () => {
  it("classifies noun-phrase job queries as TRANSACTIONAL", () => {
    const r = classifyIntent("java developer jobs in pune");
    expect(r.intent).toBe("TRANSACTIONAL");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies plain job-title queries as TRANSACTIONAL", () => {
    const r = classifyIntent("machine learning engineer");
    expect(r.intent).toBe("TRANSACTIONAL");
  });

  it("classifies question/learning queries as INFORMATIONAL", () => {
    const r = classifyIntent("what is the difference between react and angular");
    expect(r.intent).toBe("INFORMATIONAL");
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it("classifies known-entity lookups as NAVIGATIONAL", () => {
    const r = classifyIntent("technova solutions careers");
    expect(r.intent).toBe("NAVIGATIONAL");
  });

  it("falls back to the portal default when there is no lexical evidence", () => {
    const r = classifyIntent("zzz qqq");
    expect(r.intent).toBe("TRANSACTIONAL");
    expect(r.confidence).toBeLessThanOrEqual(0.34);
  });

  it("always returns a valid intent with confidence in [0, 1]", () => {
    for (const q of ["apply for java developer job", "react tutorial for beginners", "acme ltd jobs"]) {
      const r = classifyIntent(q);
      expect(["INFORMATIONAL", "NAVIGATIONAL", "TRANSACTIONAL"]).toContain(r.intent);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(r.signals)).toBe(true);
    }
  });
});