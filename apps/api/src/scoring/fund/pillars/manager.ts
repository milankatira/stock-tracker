import { Decimal } from "../decimal";
import type { PillarBreakdown, SubFactorBreakdown } from "../../types";
import type { ScoreFundInput } from "../types";
import { normaliseSubFactor, type AbsoluteBand } from "../normalise";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

// [ASSUMED A3] — manager tenure fallback bands.
const TENURE_BANDS: readonly AbsoluteBand[] = [
  { upTo: 1, score: 3 },
  { upTo: 3, score: 6 },
  { upTo: 5, score: 8 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
// [ASSUMED A3] — manager 3Y CAGR excess bands.
const CAGR_EXCESS_BANDS: readonly AbsoluteBand[] = [
  { upTo: -3, score: 0 },
  { upTo: 0, score: 4 },
  { upTo: 2, score: 7 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];

const W_TENURE = new Decimal("0.50");
const W_TRACK_RECORD = new Decimal("0.50");

export function scoreManagerPillar(
  input: ScoreFundInput,
  weight: Decimal,
): PillarBreakdown {
  const tenure = input.manager.currentManagerTenureYears;
  const managerMedianExcess =
    input.manager.managerMedianCagr3y === null ||
    input.returns.categoryMedianCagr3y === null
      ? null
      : input.manager.managerMedianCagr3y - input.returns.categoryMedianCagr3y;

  const tenureResult =
    tenure === null
      ? null
      : normaliseSubFactor(tenure, [], TENURE_BANDS, "higher");
  const trackResult =
    managerMedianExcess === null
      ? null
      : normaliseSubFactor(
          managerMedianExcess,
          input.peerCohort["manager.medianCagr3yExcess"] ?? [],
          CAGR_EXCESS_BANDS,
          "higher",
        );

  const entries = [
    {
      name: "currentManagerTenureYears",
      source: "manager.tenure",
      initialWeight: W_TENURE,
      rawValue: tenure,
      result: tenureResult,
    },
    {
      name: "managerMedianCagr3yExcess",
      source: "manager.medianCagr3yExcess",
      initialWeight: W_TRACK_RECORD,
      rawValue: managerMedianExcess,
      result: trackResult,
    },
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
      pillar: "manager",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_MANAGER_SUBFACTORS_ABSENT",
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "manager",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}
