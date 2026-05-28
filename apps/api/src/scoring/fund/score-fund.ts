import { Decimal } from "./decimal";
import type { PillarBreakdown, ScoreResult } from "../types";
import type { ScoreFundInput } from "./types";
import { SCORING_ENGINE_VERSION } from "../version";
import { clampAndRoundFinal, toVerdict } from "./compose";
import { scoreConsistencyPillar } from "./pillars/consistency";
import { scoreCostsPillar } from "./pillars/costs";
import { scoreManagerPillar } from "./pillars/manager";
import { scorePortfolioPillar } from "./pillars/portfolio";
import { scoreReturnsPillar } from "./pillars/returns";
import { scoreRiskAdjustedPillar } from "./pillars/risk-adjusted";

// [ASSUMED A2] — pillar weights per RESEARCH.md.
const W_RETURNS = new Decimal("0.35");
const W_RISK_ADJUSTED = new Decimal("0.25");
const W_CONSISTENCY = new Decimal("0.15");
const W_COSTS = new Decimal("0.10");
const W_MANAGER = new Decimal("0.10");
const W_PORTFOLIO = new Decimal("0.05");

const ZERO = new Decimal(0);

/**
 * Pure deterministic 1-10 mutual-fund score. v1 supports DIRECT/GROWTH
 * only — non-direct or non-growth inputs throw a typed error (A7).
 *
 * Same determinism guarantees as `scoreStock`:
 *  - All arithmetic via `decimal.js` with `ROUND_HALF_UP` configured once.
 *  - No system-clock reads or randomness — time and data are inputs.
 *  - Identical input deep-equal produces value-equal output across
 *    Node 20 + Node 22.
 */
export function scoreFund(input: ScoreFundInput): ScoreResult {
  if (input.planType !== "DIRECT" || input.option !== "GROWTH") {
    throw new Error(
      `scoreFund v1 supports DIRECT/GROWTH only — got planType=${input.planType} option=${input.option}`,
    );
  }

  const pillars: readonly PillarBreakdown[] = [
    scoreReturnsPillar(input, W_RETURNS),
    scoreRiskAdjustedPillar(input, W_RISK_ADJUSTED),
    scoreConsistencyPillar(input, W_CONSISTENCY),
    scoreCostsPillar(input, W_COSTS),
    scoreManagerPillar(input, W_MANAGER),
    scorePortfolioPillar(input, W_PORTFOLIO),
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
