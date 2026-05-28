import type { AiOutput } from "./ai.types";

export type Verdict = "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";

const VERDICT_COPY: Readonly<Record<Verdict, string>> = {
  STRONG_SCORE: "Strong Score",
  CAUTION: "Caution",
  WEAK_SCORE: "Weak Score",
};

/**
 * Compliance-safe deterministic fallback narrative. Emitted when the
 * Gemini retry budget is exhausted (`NarrativeAuditFailedError`). The
 * verdict copy uses the branded `STRONG_SCORE / CAUTION / WEAK_SCORE`
 * vocabulary — NEVER the BSH verbs that `forbid-verbs.sh` rejects.
 *
 * Inspection invariant: `buildFallbackNarrative(...)` MUST round-trip
 * cleanly through `sanitiseAndCheck()` — verified by the unit test in
 * `fallback-narrative.spec.ts`.
 */
export const FALLBACK_TEMPLATE = "FinSight Score: {{score}}. Verdict: {{verdict}}.";

export function buildFallbackNarrative(
  score: number,
  verdict: Verdict,
): AiOutput {
  const text = `FinSight Score: ${score}. Verdict: ${VERDICT_COPY[verdict]}.`;
  return {
    text,
    citedSources: ["score"],
    touchesReturns: false,
  };
}
