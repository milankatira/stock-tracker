import { Decimal } from "./decimal";
import type {
  PillarBreakdown,
  ScoreResult,
  ScoreStockInput,
} from "../types";
import { SCORING_ENGINE_VERSION } from "../version";
import { clampAndRoundFinal, toVerdict } from "./compose";
import { scoreEventPillar } from "./pillars/event";
import { scoreFundamentalsPillar } from "./pillars/fundamentals";
import { scoreRiskPillar } from "./pillars/risk";
import { scoreSentimentPillar } from "./pillars/sentiment";
import { scoreTechnicalPillar } from "./pillars/technical";
import { scoreValuationPillar } from "./pillars/valuation";

// [ASSUMED] A2 — Top-level pillar weights per RESEARCH.md.
const W_FUNDAMENTALS = new Decimal("0.35");
const W_VALUATION = new Decimal("0.20");
const W_TECHNICAL = new Decimal("0.20");
const W_SENTIMENT = new Decimal("0.10");
const W_RISK = new Decimal("0.10");
const W_EVENT = new Decimal("0.05");

const ZERO = new Decimal(0);

/**
 * Pure deterministic 1-10 stock score. The function:
 *  1. Builds each of the six pillar breakdowns in fixed order.
 *  2. Sums `pillar.weightedContribution` (pillarScore × weight).
 *  3. Clamps the total to [0, 10] and rounds HALF_UP to 1dp.
 *  4. Derives the compliance verdict via `toVerdict`.
 *
 * Determinism guarantees:
 *  - All arithmetic via `decimal.js` with `ROUND_HALF_UP` configured once
 *    in `./decimal.ts`.
 *  - No `Date.now()` / `Math.random()` / I/O. Time + data are inputs.
 *  - Identical input deep-equal produces value-equal output across
 *    Node 20 + Node 22 (snapshot CI matrix).
 */
export function scoreStock(input: ScoreStockInput): ScoreResult {
  const pillars: readonly PillarBreakdown[] = [
    scoreFundamentalsPillar(
      input.fundamentals,
      input.shareholding,
      input.peerCohort,
      W_FUNDAMENTALS,
    ),
    scoreValuationPillar(input.valuation, input.peerCohort, W_VALUATION),
    scoreTechnicalPillar(input.technical, W_TECHNICAL),
    scoreSentimentPillar(input.sentiment, W_SENTIMENT),
    scoreRiskPillar(
      input.risk,
      input.shareholding,
      input.peerCohort,
      W_RISK,
    ),
    scoreEventPillar(input.event, W_EVENT),
  ];

  const total = pillars.reduce(
    (acc, pillar) => acc.plus(pillar.weightedContribution),
    ZERO,
  );
  const finalScore = clampAndRoundFinal(total);

  return {
    score: finalScore.toNumber(),
    verdict: toVerdict(finalScore),
    pillars,
    inputHash: input._inputHash,
    scoringEngineVersion: SCORING_ENGINE_VERSION,
    computedAt: "",
  };
}
