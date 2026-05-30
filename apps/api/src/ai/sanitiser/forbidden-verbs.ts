/**
 * Forbidden-verb blocklist for the Ask FinSight stream (CHAT-03). Mirrors
 * the compliance sanitiser's intent but operates on streamed sentences:
 * a match either triggers a `NON_COMPLIANT_BUYSELL` refusal or is
 * replaced with SEBI-safe phrasing before the sentence reaches the client.
 *
 * v1 favours precision — each pattern is anchored on word boundaries so a
 * "new buyer entered the market" headline is not a false positive.
 */
export const FORBIDDEN_VERBS: readonly RegExp[] = [
  /\b(?:should\s+(?:i\s+)?(?:buy|sell|invest|exit|accumulate))\b/i,
  /\b(?:buy|sell)\s+(?:now|this|the\s+stock|recommendation)\b/i,
  /\b(?:i|we)\s+recommend\b/i,
  /\brecommend(?:s|ed|ation)?\b/i,
  /\btarget\s+price\b/i,
  /\bstop\s+loss\b/i,
  /\bguaranteed\s+returns?\b/i,
  /\brisk[\s-]?free\b/i,
  /\b(?:will|would)\s+definitely\b/i,
  /\bi\s+am\s+sebi\b/i,
];

/**
 * Replacement map applied case-insensitively, longest-phrase first, so
 * "you should buy" is rewritten before the bare "buy". Values use the
 * approved verdict vocabulary ("Strong Score") and analysis framing.
 */
export const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\byou\s+should\s+buy\b/gi, "the analysis suggests a Strong Score for"],
  [/\byou\s+should\s+sell\b/gi, "the analysis suggests a Weak Score for"],
  [/\bshould\s+i\s+buy\b/gi, "the analysis for"],
  [/\b(?:i|we)\s+recommend\b/gi, "the analysis highlights"],
  [/\brecommend(?:s|ed|ation)?\b/gi, "analysis"],
  [/\btarget\s+price\b/gi, "analyst-tracked level"],
  [/\bstop\s+loss\b/gi, "downside reference level"],
  [/\bguaranteed\s+returns?\b/gi, "historical returns"],
  [/\brisk[\s-]?free\b/gi, "lower-risk"],
  [/\bbuy\b/gi, "consider the Strong Score for"],
  [/\bsell\b/gi, "consider the Weak Score for"],
];

export function containsForbidden(text: string): boolean {
  return FORBIDDEN_VERBS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function applyReplacements(text: string): string {
  let out = text;
  for (const [re, replacement] of REPLACEMENTS) {
    out = out.replace(re, replacement);
  }
  return out;
}
