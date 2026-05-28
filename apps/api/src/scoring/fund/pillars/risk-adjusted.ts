// [ASSUMED A6] — riskFreeRateMonthly is the 10Y G-Sec monthly snapshot
// (RBI WSS), matched 1:1 with monthlyReturns by IST close.
import { Decimal } from "../decimal";
import type { PillarBreakdown, SubFactorBreakdown } from "../../types";
import type { ScoreFundInput } from "../types";
import { normaliseSubFactor, type AbsoluteBand } from "../normalise";
import { sharpeRatio, sortinoRatio } from "../returns-math";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

// [ASSUMED A3] — Sharpe / Sortino fallback bands when peer cohort < 20.
const SHARPE_BANDS: readonly AbsoluteBand[] = [
  { upTo: -0.5, score: 0 },
  { upTo: 0, score: 3 },
  { upTo: 0.5, score: 6 },
  { upTo: 1, score: 8 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const SORTINO_BANDS: readonly AbsoluteBand[] = SHARPE_BANDS;

const W_SHARPE = new Decimal("0.50");
const W_SORTINO = new Decimal("0.50");

export function scoreRiskAdjustedPillar(
  input: ScoreFundInput,
  weight: Decimal,
): PillarBreakdown {
  const sharpe = sharpeRatio(
    input.monthlyReturns,
    input.riskFreeRateMonthly,
  );
  const sortino = sortinoRatio(
    input.monthlyReturns,
    input.riskFreeRateMonthly,
  );

  const sharpeResult =
    sharpe === null
      ? null
      : normaliseSubFactor(
          sharpe.toNumber(),
          input.peerCohort["risk.sharpe3y"] ?? [],
          SHARPE_BANDS,
          "higher",
        );
  const sortinoResult =
    sortino === null
      ? null
      : normaliseSubFactor(
          sortino.toNumber(),
          input.peerCohort["risk.sortino3y"] ?? [],
          SORTINO_BANDS,
          "higher",
        );

  const entries = [
    { name: "sharpe3y", source: "risk.sharpe3y", initialWeight: W_SHARPE, rawValue: sharpe?.toNumber() ?? null, result: sharpeResult },
    { name: "sortino3y", source: "risk.sortino3y", initialWeight: W_SORTINO, rawValue: sortino?.toNumber() ?? null, result: sortinoResult },
  ];
  const present = entries.filter((e) => e.result !== null);
  const sumWeights = present.reduce(
    (acc, e) => acc.plus(e.initialWeight),
    ZERO,
  );

  const subFactors: SubFactorBreakdown[] = entries.map((entry) => {
    if (!entry.result) {
      return {
        name: entry.name,
        source: entry.source,
        rawValue: entry.rawValue,
        direction: "higher",
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
      direction: "higher",
      normalisedScore: entry.result.normalisedScore,
      weightWithinPillar: renormalised,
      isFallback: entry.result.isFallback,
      isAbsent: false,
    };
  });

  if (present.length === 0) {
    return {
      pillar: "risk-adjusted",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_RISK_ADJUSTED_SUBFACTORS_ABSENT",
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "risk-adjusted",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}
