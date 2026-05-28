/**
 * Branded `Verdict` type — the canonical compliance contract for FinSight AI.
 *
 * Requirement: COMP-01 (no BUY/SELL/HOLD verbs anywhere — every verdict is one of
 * STRONG_SCORE / CAUTION / WEAK_SCORE, derived from a numeric score).
 *
 * Why branded (not a plain string-literal union):
 *   A plain `'STRONG_SCORE' | 'CAUTION' | 'WEAK_SCORE'` union is bypassable via
 *   `'BUY' as Verdict` at any call site. Brands attach a phantom symbol that the
 *   compiler tracks but the runtime never sees, so the only legal construction
 *   site is `makeVerdict(...)` — which accepts only the three allowed literals.
 *
 *   The cast `'BUY' as unknown as Verdict` still technically compiles (TS allows
 *   double-casts through `unknown`), which is why the companion
 *   `scripts/forbid-verbs.sh` greps the repo for the forbidden vocabulary at CI
 *   time — defence-in-depth at the textual level.
 *
 * Consumers MUST use one of:
 *   - `VERDICTS.STRONG_SCORE` / `VERDICTS.CAUTION` / `VERDICTS.WEAK_SCORE` (constants)
 *   - `makeVerdict('STRONG_SCORE')` (smart constructor)
 *   - `isVerdict(x)` (runtime guard for external data)
 */

declare const verdictBrand: unique symbol;

/**
 * Branded string type. The phantom `verdictBrand` member exists only at the type
 * level and cannot be produced by hand — only `makeVerdict()` returns this type.
 */
export type Verdict = string & { readonly [verdictBrand]: true };

// Private to this module — do NOT export. Consumers go through makeVerdict /
// VERDICTS so the brand stays inforceable. If a UI selector needs to enumerate
// allowed values in a later phase, add a separate `VERDICT_LITERALS` const at
// that time rather than widening this surface.
const ALLOWED = ["STRONG_SCORE", "CAUTION", "WEAK_SCORE"] as const;
type VerdictLiteral = (typeof ALLOWED)[number];

/**
 * Smart constructor — the ONLY type-safe way to build a `Verdict`.
 *
 * - Compile-time: rejects any literal not in {STRONG_SCORE, CAUTION, WEAK_SCORE}.
 * - Runtime (defence-in-depth): if a caller forces a bad value through with
 *   `as any`, throws `Error('Invalid verdict: <value>')`.
 *
 * @example
 *   const v: Verdict = makeVerdict('STRONG_SCORE');     // OK
 *   const bad = makeVerdict('not-a-verdict' as any);    // throws at runtime
 */
export function makeVerdict(value: VerdictLiteral): Verdict {
  if (!(ALLOWED as readonly string[]).includes(value)) {
    // Defence in depth — type system already covers this when no `as any`
    // is used at the call site.
    throw new Error(`Invalid verdict: ${value}`);
  }
  return value as unknown as Verdict;
}

/**
 * Runtime type guard — narrows `unknown` to `Verdict`.
 *
 * Use this when ingesting untrusted data (HTTP payloads, DB documents, Gemini
 * tool-call results). Pair with Zod for end-to-end validation:
 *
 * @example
 *   const VerdictZ = z.string().refine(isVerdict);
 */
export function isVerdict(v: unknown): v is Verdict {
  return typeof v === "string" && (ALLOWED as readonly string[]).includes(v);
}

/**
 * Pre-constructed `Verdict` constants. Prefer these to repeated
 * `makeVerdict('STRONG_SCORE')` calls — same value, same identity, no
 * allocation per call.
 */
export const VERDICTS = {
  STRONG_SCORE: makeVerdict("STRONG_SCORE"),
  CAUTION: makeVerdict("CAUTION"),
  WEAK_SCORE: makeVerdict("WEAK_SCORE"),
} as const;
