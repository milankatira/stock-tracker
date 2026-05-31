/**
 * Post-answer citation validator (CHAT-03 finalisation). Every numeric
 * token in the assistant's answer must trace back to a number a tool
 * actually returned this turn — otherwise it is a potential hallucination
 * and we surface a `CITATION_MISSING` event + `[verify]` marker.
 *
 * Intentionally SKIPS:
 *  - bare standalone integers (`42`, `1 of 3`) — the system prompt requires
 *    Gemini to attach units (₹/Cr/Lakh/%), so a bare integer is not an
 *    authoritative figure and matching it would be noisy/false-positive.
 *  - dates (`2026-05-28`) — no `.`-decimal, so the decimal pattern misses
 *    them and the suffix/percent/₹ patterns don't apply.
 *
 * MATCHES: ₹-prefixed amounts, Cr/Lakh/L/K/M/B/Tn-suffixed numbers,
 * percentages, and any decimal (`7.2`).
 */
export const NUMERIC_TOKEN = new RegExp(
  [
    "₹\\s?[\\d,]+(\\.\\d+)?",
    "\\d+(\\.\\d+)?\\s?(Cr|Lakh|L|K|M|B|Tn)\\b",
    "\\d+(\\.\\d+)?\\s?%",
    "\\d+\\.\\d+",
  ].join("|"),
  "g",
);

export interface CitationCheckInput {
  readonly data: unknown;
  readonly sourceTag: string;
  readonly asOfDate: Date;
}

export interface CitationCheckResult {
  readonly ok: boolean;
  readonly missing: string[];
}

function normalise(token: string): string {
  return token
    .replace(/₹\s?/, "")
    .replace(/\s*(Cr|Lakh|L|K|M|B|Tn)\b/i, "")
    .replace(/%/, "")
    .replace(/\s+/g, "");
}

export function validateCitations(
  answer: string,
  toolResults: readonly CitationCheckInput[],
): CitationCheckResult {
  NUMERIC_TOKEN.lastIndex = 0;
  const numbers = answer.match(NUMERIC_TOKEN) ?? [];
  const haystack = JSON.stringify(toolResults.map((r) => r.data));
  const missing = numbers.filter(
    (n) => !haystack.includes(normalise(n)) && !haystack.includes(n),
  );
  return { ok: missing.length === 0, missing };
}
