/**
 * Numeric audit — flags any numeric token in a narrative that isn't
 * present in the verified set of values (typically derived from
 * `ScoreInput`). The check accepts both the suffixed and the
 * un-suffixed form of a verified value so "13.7" and "13.7%" both
 * match `{ roe: '13.7%' }`.
 */

const NUMBER_TOKEN_RE = /-?\d+(?:[.,]\d+)?%?/g;

export interface AuditResult {
  readonly ok: boolean;
  readonly unexpectedTokens: readonly string[];
}

export function auditNumbers(
  narrative: string,
  verified: Record<string, string>,
): AuditResult {
  if (!narrative || narrative.length === 0) {
    return { ok: true, unexpectedTokens: [] };
  }
  const allowed = buildAllowedSet(verified);
  const unexpected: string[] = [];
  for (const match of narrative.matchAll(NUMBER_TOKEN_RE)) {
    const token = match[0];
    if (!allowed.has(canonical(token))) {
      unexpected.push(token);
    }
  }
  return {
    ok: unexpected.length === 0,
    unexpectedTokens: unexpected,
  };
}

function buildAllowedSet(verified: Record<string, string>): Set<string> {
  const allowed = new Set<string>();
  for (const value of Object.values(verified)) {
    if (typeof value !== "string" || value.length === 0) continue;
    const canonicalised = canonical(value);
    allowed.add(canonicalised);
    if (canonicalised.endsWith("%")) {
      allowed.add(canonicalised.slice(0, -1));
    } else {
      allowed.add(`${canonicalised}%`);
    }
  }
  return allowed;
}

function canonical(token: string): string {
  return token.replace(/,/g, "");
}
