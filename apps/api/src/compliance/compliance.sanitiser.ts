/**
 * Compliance sanitiser — the regex-based blocklist that backs the
 * `ComplianceInterceptor`. The list intentionally favours precision over
 * recall: a clean false positive blocks a legitimate narrative until a
 * fixture is added; a missed evasion is documented in
 * `EVASION_FIXTURES` for review.
 */

const FORBIDDEN_PATTERNS: ReadonlyArray<{ readonly label: string; readonly regex: RegExp }> = [
  {
    label: "verb:buy/sell/hold/recommend",
    regex: /\b(?:buy|sell|hold|recommend(?:s|ed|ation)?)\b/gi,
  },
  {
    label: "phrase:you-should-X",
    regex: /\byou\s+should\s+(?:buy|sell|invest|consider|hold|accumulate|exit)\b/gi,
  },
  {
    label: "phrase:strongly-suggest",
    regex: /\b(?:strongly|highly)\s+suggest\b/gi,
  },
  {
    label: "phrase:target-price",
    regex: /\btarget\s+price\b/gi,
  },
  {
    label: "phrase:stop-loss",
    regex: /\bstop\s+loss\b/gi,
  },
  {
    label: "phrase:our-recommendation",
    regex: /\bour\s+recommendation\b/gi,
  },
  {
    label: "numeric:rupee-target",
    regex: /(?:₹|\bRs\.?)\s*\d[\d,]*/gi,
  },
];

export interface SanitiseResult {
  /** Original input — v1 BLOCKS rather than rewriting, so sanitised === input. */
  readonly sanitised: string;
  /** Distinct rule labels that matched the input. */
  readonly violations: readonly string[];
  /** Verbatim matched substrings (preserved for telemetry / error context). */
  readonly matches: readonly string[];
}

export function sanitiseAndCheck(text: string): SanitiseResult {
  if (typeof text !== "string" || text.length === 0) {
    return { sanitised: text ?? "", violations: [], matches: [] };
  }
  const violationLabels = new Set<string>();
  const matches: string[] = [];
  for (const { label, regex } of FORBIDDEN_PATTERNS) {
    regex.lastIndex = 0;
    const hits = text.match(regex);
    if (hits && hits.length > 0) {
      violationLabels.add(label);
      for (const hit of hits) matches.push(hit);
    }
  }
  return {
    sanitised: text,
    violations: [...violationLabels],
    matches,
  };
}
