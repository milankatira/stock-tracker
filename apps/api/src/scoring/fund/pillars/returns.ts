// [ASSUMED A9] — benchmarkTriCagr* fields are TRI per the Phase 2
// ingestion contract. PRI series would systematically under-estimate
// the benchmark and skew this pillar. No runtime guard is possible
// at value level; correctness is enforced by Phase 2 source wiring.
import { Decimal } from "../decimal";
import type {
  PeerCohortValues,
  PillarBreakdown,
  SubFactorBreakdown,
} from "../../types";
import type { ScoreFundInput } from "../types";
import { normaliseSubFactor, type AbsoluteBand } from "../normalise";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

// [ASSUMED A3] — fallback bands when peer cohort < 20.
const EXCESS_BANDS: readonly AbsoluteBand[] = [
  { upTo: -3, score: 0 },
  { upTo: 0, score: 3 },
  { upTo: 2, score: 6 },
  { upTo: 5, score: 8 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];

const W_3Y_BENCH = new Decimal("0.30");
const W_3Y_CAT = new Decimal("0.20");
const W_5Y_BENCH = new Decimal("0.30");
const W_5Y_CAT = new Decimal("0.20");

export function scoreReturnsPillar(
  input: ScoreFundInput,
  weight: Decimal,
): PillarBreakdown {
  const returns = input.returns;
  const cohort: PeerCohortValues = input.peerCohort;

  const entries = [
    spec(
      "fundExcess3yVsBenchmark",
      "returns.fundExcess3yVsBenchmark",
      diff(returns.fundCagr3y, returns.benchmarkTriCagr3y),
      W_3Y_BENCH,
      cohort,
    ),
    spec(
      "fundExcess3yVsCategory",
      "returns.fundExcess3yVsCategory",
      diff(returns.fundCagr3y, returns.categoryMedianCagr3y),
      W_3Y_CAT,
      cohort,
    ),
    spec(
      "fundExcess5yVsBenchmark",
      "returns.fundExcess5yVsBenchmark",
      diff(returns.fundCagr5y, returns.benchmarkTriCagr5y),
      W_5Y_BENCH,
      cohort,
    ),
    spec(
      "fundExcess5yVsCategory",
      "returns.fundExcess5yVsCategory",
      diff(returns.fundCagr5y, returns.categoryMedianCagr5y),
      W_5Y_CAT,
      cohort,
    ),
  ];

  return composePillar("returns", weight, entries);
}

interface PillarSpec {
  readonly name: string;
  readonly source: string;
  readonly rawValue: number | null;
  readonly initialWeight: Decimal;
  readonly peerValues: readonly number[];
}

function spec(
  name: string,
  source: string,
  rawValue: number | null,
  initialWeight: Decimal,
  cohort: PeerCohortValues,
): PillarSpec {
  return {
    name,
    source,
    rawValue,
    initialWeight,
    peerValues: cohort[source] ?? [],
  };
}

function diff(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function composePillar(
  pillar: PillarBreakdown["pillar"],
  weight: Decimal,
  specs: readonly PillarSpec[],
): PillarBreakdown {
  const normalised = specs.map((s) => ({
    spec: s,
    result: normaliseSubFactor(s.rawValue, s.peerValues, EXCESS_BANDS, "higher"),
  }));
  const present = normalised.filter((n) => !n.result.isAbsent);
  const sumWeights = present.reduce(
    (acc, n) => acc.plus(n.spec.initialWeight),
    ZERO,
  );

  const subFactors: SubFactorBreakdown[] = normalised.map((n) => {
    if (n.result.isAbsent) {
      return {
        name: n.spec.name,
        source: n.spec.source,
        rawValue: n.spec.rawValue,
        direction: "higher",
        normalisedScore: ZERO,
        weightWithinPillar: ZERO,
        isFallback: false,
        isAbsent: true,
      };
    }
    const renormalised = n.spec.initialWeight
      .div(sumWeights)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return {
      name: n.spec.name,
      source: n.spec.source,
      rawValue: n.spec.rawValue,
      direction: "higher",
      normalisedScore: n.result.normalisedScore,
      weightWithinPillar: renormalised,
      isFallback: n.result.isFallback,
      isAbsent: false,
    };
  });

  if (present.length === 0) {
    return {
      pillar,
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_RETURNS_SUBFACTORS_ABSENT",
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar,
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}
