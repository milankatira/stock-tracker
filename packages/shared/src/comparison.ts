import type { Verdict } from "./verdict";

/**
 * Wire contract for the 2-3-way stock comparison (STOCK-07). Shared by
 * `apps/api` (CompareController response) and `apps/web` (compare result
 * page render) so the structured-output shape never drifts between the
 * two sides.
 *
 * Compliance + AI-invariant notes for the next engineer:
 *  - `scoreDelta` is computed deterministically server-side
 *    (`winnerScore - max(otherScores)`); Gemini's emitted number is
 *    discarded. Gemini only ever contributes the prose `rationale`.
 *  - `rationale` has already passed the forbidden-verb sanitiser
 *    (`applyReplacements`) — no BUY/SELL/recommend/target-price language.
 */
export interface CompareInput {
  /** 2..3 NSE/BSE symbols (uppercase alphanumeric + dot). */
  readonly symbols: readonly string[];
}

export interface ComparisonScore {
  readonly symbol: string;
  readonly value: number;
  readonly verdict: Verdict;
  readonly asOfDate: string;
}

export interface ComparisonVerdict {
  /** Always one of the input symbols (schema-enum-constrained + checked). */
  readonly winnerSymbol: string;
  /** ≤ 400 chars, sanitised prose written by Gemini. */
  readonly rationale: string;
  /** Deterministic: winnerScore - max(otherScores), 2dp. Never from Gemini. */
  readonly scoreDelta: number;
  readonly scores: readonly ComparisonScore[];
}

/**
 * Returned (HTTP 422) when any requested symbol has no persisted score
 * yet — typically a freshly-added instrument awaiting the next nightly
 * recompute. The UI surfaces a friendly "try again tomorrow" message
 * rather than dead-ending the user.
 */
export interface PendingScoreResponse {
  readonly error: "SCORE_PENDING";
  readonly symbol: string;
}
