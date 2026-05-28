import { Decimal } from "../decimal";
import type { PillarBreakdown, SubFactorBreakdown } from "../../types";
import type { ScoreFundInput } from "../types";
import { normaliseSubFactor, type AbsoluteBand } from "../normalise";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

// [ASSUMED A3] — expense-ratio fallback bands (lower is better).
const EXPENSE_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0.5, score: 10 },
  { upTo: 1.0, score: 7 },
  { upTo: 1.5, score: 4 },
  { upTo: 2.0, score: 2 },
  { upTo: Number.POSITIVE_INFINITY, score: 0 },
];

export function scoreCostsPillar(
  input: ScoreFundInput,
  weight: Decimal,
): PillarBreakdown {
  const expenseRatio = input.costs.expenseRatio;
  if (expenseRatio === null) {
    return {
      pillar: "costs",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors: [
        {
          name: "expenseRatio",
          source: "costs.expenseRatio",
          rawValue: null,
          direction: "lower",
          normalisedScore: ZERO,
          weightWithinPillar: ZERO,
          isFallback: false,
          isAbsent: true,
        },
      ],
      isFallback: true,
      fallbackReason: "ALL_COSTS_SUBFACTORS_ABSENT",
    };
  }
  const result = normaliseSubFactor(
    expenseRatio,
    input.peerCohort["costs.expenseRatio"] ?? [],
    EXPENSE_BANDS,
    "lower",
  );
  const sub: SubFactorBreakdown = {
    name: "expenseRatio",
    source: "costs.expenseRatio",
    rawValue: expenseRatio,
    direction: "lower",
    normalisedScore: result.normalisedScore,
    weightWithinPillar: new Decimal(1),
    isFallback: result.isFallback,
    isAbsent: false,
  };
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, result.normalisedScore))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return {
    pillar: "costs",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors: [sub],
    isFallback: false,
  };
}
