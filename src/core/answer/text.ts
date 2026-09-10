/**
 * Small text primitives shared by the answer and story analysers.
 *
 * Everything here is deliberately naive: no stemmer, no embeddings, no model
 * call. The analysers make claims a user will argue with ("you never
 * mentioned indexes"), so the rule behind each claim has to be one a person
 * can read and check. A cleverer matcher that is occasionally inexplicable
 * would be worse, not better.
 */

/** Words too common to carry meaning when matching an outline point. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this",
  "these", "those", "of", "to", "in", "on", "at", "by", "for", "with", "from",
  "as", "is", "are", "was", "were", "be", "been", "being", "it", "its", "you",
  "your", "they", "their", "we", "our", "i", "my", "me", "us", "them", "he",
  "she", "his", "her", "have", "has", "had", "do", "does", "did", "will",
  "would", "can", "could", "should", "may", "might", "must", "not", "no",
  "so", "up", "out", "about", "into", "over", "how", "what", "when", "where",
  "which", "who", "why", "any", "some", "all", "each", "other", "such",
  "e.g", "eg", "ie", "etc", "specific", "used", "using", "use",
]);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function contentWords(text: string): string[] {
  return words(text).filter(
    (word) => word.length >= 3 && !STOPWORDS.has(word),
  );
}

/**
 * Loose containment: matches "indexes" against "index", and "optimise"
 * against "optimising", without pulling in a stemmer whose behaviour nobody
 * on the team could predict.
 */
export function mentions(haystack: readonly string[], needle: string): boolean {
  const target = needle.toLowerCase();
  const stem = target.replace(/(ing|ed|es|s)$/u, "");

  return haystack.some((word) => {
    if (word === target) return true;
    if (stem.length < 4) return false;
    return word.startsWith(stem) || stem.startsWith(word.replace(/(ing|ed|es|s)$/u, ""));
  });
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
