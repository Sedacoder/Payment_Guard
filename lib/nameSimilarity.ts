import type { Merchant } from "./types";

/** Generic business words ignored before comparing, so "Naivaz" can match "Naivas Supermarket". */
const FILLER_WORDS: ReadonlySet<string> = new Set([
  "supermarket",
  "supermarkets",
  "store",
  "stores",
  "shop",
  "plc",
  "ltd",
  "limited",
  "inc",
  "official",
]);

/** Lowercase, drop punctuation, split into words. */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Cleaned name used for comparison. Falls back to all words if stripping empties it. */
export function normalizeName(name: string): string {
  const words = tokenize(name);
  const core = words.filter((w) => !FILLER_WORDS.has(w));
  return (core.length > 0 ? core : words).join(" ");
}

/** Number of single-letter edits (insert, delete, change) to turn a into b. */
function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity from 0 (nothing alike) to 1 (identical) after cleaning both names. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(x, y) / longest;
}

export interface ClosestMatch {
  merchant: Merchant;
  similarity: number;
}

/** The verified merchant whose name is most similar to `payeeName`, or null if there are none. */
export function findClosestMerchant(
  payeeName: string,
  merchants: readonly Merchant[],
): ClosestMatch | null {
  let best: ClosestMatch | null = null;
  for (const merchant of merchants) {
    const similarity = nameSimilarity(payeeName, merchant.name);
    if (best === null || similarity > best.similarity) best = { merchant, similarity };
  }
  return best;
}
