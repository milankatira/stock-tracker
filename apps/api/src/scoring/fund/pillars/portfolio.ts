import { Decimal } from "../decimal";
import type { PillarBreakdown, SubFactorBreakdown } from "../../types";
import type { ScoreFundInput } from "../types";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

// [ASSUMED A3] — portfolio concentration / tilt / turnover bands.
function top10Score(value: number): Decimal {
  if (value < 25) return TEN;
  if (value < 40) return new Decimal(7);
  if (value < 55) return new Decimal(4);
  return ZERO;
}
function sectorTiltScore(value: number): Decimal {
  if (value < 10) return TEN;
  if (value < 20) return new Decimal(7);
  if (value < 35) return new Decimal(4);
  return ZERO;
}
function turnoverScore(value: number): Decimal {
  if (value < 30) return TEN;
  if (value < 80) return new Decimal(7);
  if (value < 150) return new Decimal(4);
  return ZERO;
}

const W_TOP10 = new Decimal("0.40");
const W_TILT = new Decimal("0.30");
const W_TURNOVER = new Decimal("0.30");

export function scorePortfolioPillar(
  input: ScoreFundInput,
  weight: Decimal,
): PillarBreakdown {
  const top10 = input.portfolio.top10HoldingsPctOfAum;
  const tilt = input.portfolio.sectorTiltAbsolutePct;
  const turnover = input.portfolio.annualTurnoverPct;

  const entries = [
    {
      name: "top10HoldingsPctOfAum",
      source: "portfolio.top10HoldingsPctOfAum",
      initialWeight: W_TOP10,
      rawValue: top10,
      score: top10 === null ? null : top10Score(top10),
    },
    {
      name: "sectorTiltAbsolutePct",
      source: "portfolio.sectorTiltAbsolutePct",
      initialWeight: W_TILT,
      rawValue: tilt,
      score: tilt === null ? null : sectorTiltScore(tilt),
    },
    {
      name: "annualTurnoverPct",
      source: "portfolio.annualTurnoverPct",
      initialWeight: W_TURNOVER,
      rawValue: turnover,
      score: turnover === null ? null : turnoverScore(turnover),
    },
  ];

  const present = entries.filter((e) => e.score !== null);
  const sumWeights = present.reduce(
    (acc, e) => acc.plus(e.initialWeight),
    ZERO,
  );

  const subFactors: SubFactorBreakdown[] = entries.map((entry) => {
    if (entry.score === null) {
      return {
        name: entry.name,
        source: entry.source,
        rawValue: entry.rawValue,
        direction: "lower",
        normalisedScore: ZERO,
        weightWithinPillar: ZERO,
        isFallback: false,
        isAbsent: true,
      };
    }
    const renormalised = entry.initialWeight
      .div(sumWeights)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return {
      name: entry.name,
      source: entry.source,
      rawValue: entry.rawValue,
      direction: "lower",
      normalisedScore: entry.score.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
      weightWithinPillar: renormalised,
      isFallback: false,
      isAbsent: false,
    };
  });

  if (present.length === 0) {
    return {
      pillar: "portfolio",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_PORTFOLIO_SUBFACTORS_ABSENT",
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "portfolio",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}
