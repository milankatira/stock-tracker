import { Decimal } from "../decimal";
import type { PillarBreakdown, SubFactorBreakdown } from "../../types";
import type { ScoreFundInput } from "../types";
import { downsideCaptureRatio, quartileStability } from "../returns-math";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

const W_QUARTILE = new Decimal("0.60");
const W_DOWNSIDE_CAPTURE = new Decimal("0.40");

// [ASSUMED A3] — downside capture bands (lower is better).
function captureScore(ratio: Decimal): Decimal {
  if (ratio.lt(80)) return TEN;
  if (ratio.lt(100)) return new Decimal(7);
  if (ratio.lt(120)) return new Decimal(4);
  return ZERO;
}

export function scoreConsistencyPillar(
  input: ScoreFundInput,
  weight: Decimal,
): PillarBreakdown {
  // Build rolling 1Y windows from the monthly series — each window is a
  // 12-month slice. The fund "won" a window if its cumulative return
  // beat the category median's cumulative return for the same window.
  const windows = rollingTopHalfWindows(
    input.monthlyReturns,
    input.categoryMedianMonthlyReturns,
  );
  const quartile = quartileStability(windows);

  const downside = downsideCaptureRatio(
    input.monthlyReturns,
    input.benchmarkMonthlyReturns,
  );

  const subFactors: SubFactorBreakdown[] = [];

  // Quartile stability — always reported (returns 5.0 on empty input).
  const isAbsentQuartile = windows.length === 0;
  subFactors.push({
    name: "quartileStability",
    source: "consistency.quartileStability",
    rawValue: isAbsentQuartile ? null : windows.length,
    direction: "higher",
    normalisedScore: isAbsentQuartile ? ZERO : quartile,
    weightWithinPillar: ZERO,
    isFallback: false,
    isAbsent: isAbsentQuartile,
  });

  const isAbsentDownside = downside === null;
  subFactors.push({
    name: "downsideCapture",
    source: "consistency.downsideCapture",
    rawValue: isAbsentDownside ? null : downside?.toNumber() ?? null,
    direction: "lower",
    normalisedScore: isAbsentDownside ? ZERO : captureScore(downside as Decimal),
    weightWithinPillar: ZERO,
    isFallback: false,
    isAbsent: isAbsentDownside,
  });

  const present = subFactors.filter((sf) => !sf.isAbsent);
  if (present.length === 0) {
    return {
      pillar: "consistency",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_CONSISTENCY_SUBFACTORS_ABSENT",
    };
  }

  const initialWeights: Record<string, Decimal> = {
    quartileStability: W_QUARTILE,
    downsideCapture: W_DOWNSIDE_CAPTURE,
  };
  const sumWeights = present.reduce(
    (acc, sf) => acc.plus(initialWeights[sf.name]),
    ZERO,
  );
  const subFactorsWithWeights = subFactors.map((sf) => {
    if (sf.isAbsent) return sf;
    const renormalised = initialWeights[sf.name]
      .div(sumWeights)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return { ...sf, weightWithinPillar: renormalised };
  });

  const pillarScoreRaw = subFactorsWithWeights.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "consistency",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors: subFactorsWithWeights,
    isFallback: false,
  };
}

function rollingTopHalfWindows(
  fundMonthly: readonly number[],
  catMonthly: readonly number[],
): boolean[] {
  if (
    fundMonthly.length < 12 ||
    fundMonthly.length !== catMonthly.length
  ) {
    return [];
  }
  const windows: boolean[] = [];
  for (let start = 0; start + 12 <= fundMonthly.length; start += 1) {
    const fundCumulative = fundMonthly
      .slice(start, start + 12)
      .reduce((acc, v) => acc + v, 0);
    const catCumulative = catMonthly
      .slice(start, start + 12)
      .reduce((acc, v) => acc + v, 0);
    windows.push(fundCumulative >= catCumulative);
  }
  return windows;
}
