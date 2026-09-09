/**
 * Controlled query expansion.
 *
 * A small, hand-curated, ONE-DIRECTIONAL abbreviation/alias dictionary.
 * Expansion rules to avoid over-expansion (which would introduce irrelevant
 * results):
 *
 *   1. Only short or ambiguous tokens are expanded (abbreviations, aliases).
 *   2. Expansion is skipped when the target term is already present in the
 *      query (e.g. "javascript js" does not become "javascript javascript").
 *   3. Each token has at most one expansion group; no transitive chaining
 *      (js → javascript → … is impossible by construction).
 *   4. The total number of applied expansions per query is capped.
 *
 * This is a controlled dictionary, NOT automatic relevance feedback or an
 * embedding-based expander.
 */

/** Canonical expansion targets are RAW terms — they pass through the same
 * tokenizer/stemmer as everything else, so "machine learning" yields the two
 * processed tokens "machine" and "learning". */
export const SYNONYM_DICT: Record<string, string[]> = {
  js: ["javascript"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  node: ["node.js"],
  reactjs: ["react"],
  "react.js": ["react"],
  "reactjs.": ["react"],
  k8s: ["kubernetes"],
  db: ["database"],
  dbs: ["database"],
  postgres: ["postgresql"],
  ts: ["typescript"],
  oop: ["object oriented programming"],
  api: ["rest apis"],
  apis: ["rest apis"],
};

/** Hard cap on expansions per query (anti-over-expansion guard). */
export const MAX_EXPANSIONS_PER_QUERY = 3;

export interface ExpansionApplied {
  from: string;
  to: string[];
}

export interface ExpansionResult {
  expandedQuery: string;
  applied: ExpansionApplied[];
  /** true when at least one token was expanded */
  didExpand: boolean;
}

/** Extract the first alphanumeric-ish word from a raw whitespace token. */
function wordKey(raw: string): string {
  const m = raw.toLowerCase().match(/[a-z0-9+#.]+/g);
  return m ? m.join("") : "";
}

/**
 * Expand a raw query string using the controlled dictionary.
 * Tokens that are not in the dictionary pass through unchanged.
 */
export function expandQuery(rawQuery: string): ExpansionResult {
  const rawTokens = rawQuery.split(/\s+/).filter(Boolean);
  const allKeys = new Set(rawTokens.map(wordKey));

  const applied: ExpansionApplied[] = [];
  const outTokens: string[] = [];

  for (const token of rawTokens) {
    const key = wordKey(token);
    const expansion = SYNONYM_DICT[key];

    const canExpand =
      expansion !== undefined &&
      applied.length < MAX_EXPANSIONS_PER_QUERY &&
      // skip if every target term already appears in the query
      !expansion.every((target) => allKeys.has(wordKey(target)));

    if (canExpand) {
      applied.push({ from: key, to: expansion });
      outTokens.push(expansion.join(" "));
    } else {
      outTokens.push(token);
    }
  }

  return {
    expandedQuery: outTokens.join(" "),
    applied,
    didExpand: applied.length > 0,
  };
}

/** Look up what a single term would expand to (used by explain endpoints). */
export function expansionForTerm(term: string): string[] | null {
  return SYNONYM_DICT[term.toLowerCase()] ?? null;
}
