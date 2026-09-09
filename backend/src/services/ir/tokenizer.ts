/**
 * Query/document processing pipeline for the Information Retrieval engine.
 *
 * Pipeline: normalize -> tokenize -> stop-word removal -> light stemming.
 * Every document (job posting) and every user query passes through the exact
 * same pipeline so that both live in the same term space (Vector Space Model).
 */

export const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "he", "in", "is", "it", "its", "of", "on", "or", "that", "the", "to", "was",
  "were", "will", "with", "who", "you", "your", "we", "our", "us", "this",
  "these", "those", "there", "their", "they", "them", "i", "me", "my",
]);

/**
 * Very light stemmer: strips common English suffixes. Deliberately kept
 * simple and explainable (Porter is overkill for this corpus and harder
 * to walk through in a presentation).
 */
export function lightStem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y"; // "technologies" -> "technology"
  if (word.endsWith("sses")) return word.slice(0, -2); // "classes" -> "class"
  if (word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2); // "interfaces" -> "interfac" (acceptable)
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1); // "developers" -> "developer"
  }
  // Only strip "ing" when a meaningful stem remains (keeps "spring" intact).
  if (word.endsWith("ing") && word.length - 3 >= 4) return word.slice(0, -3); // "developing" -> "develop"
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2); // "developed" -> "develop"
  return word;
}

/** Normalize: lowercase, collapse whitespace. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Tokenize on non-alphanumeric boundaries (keeps C++, C#, node.js intact-ish). */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 0 && /[a-z0-9]/.test(t));
}

/** Full pipeline: normalize -> tokenize -> stop-word removal -> stem. */
export function processText(text: string): string[] {
  return tokenize(text)
    .filter((t) => !STOP_WORDS.has(t))
    .map(lightStem)
    .filter((t) => t.length > 0);
}

/** Process a search query through the pipeline (same as documents). */
export function processQuery(query: string): string[] {
  return processText(query);
}
