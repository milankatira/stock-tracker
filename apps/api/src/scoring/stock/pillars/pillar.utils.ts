import { Decimal } from "../decimal";
import type {
  Direction,
  PillarBreakdown,
  StockPillarKey,
  SubFactorBreakdown,
} from "../../types";
import { normaliseSubFactor, type AbsoluteBand } from "../normalise";

export interface SubFactorSpec {
  readonly name: string;
  /** Provenance string used to look the cohort up from `PeerCohortValues`. */
  readonly source: string;
  readonly rawValue: number | null;
  readonly initialWeight: Decimal;
  readonly direction: Direction;
  readonly fallbackBands: readonly AbsoluteBand[];
  readonly peerValues: readonly number[];
  /** If `true`, the sub-factor is reported in the breakdown but does NOT contribute to the score. */
  readonly informational?: boolean;
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

/**
 * Compose a pillar from its constituent sub-factor specs.
 *
 * Behaviour:
 *  - Each present sub-factor (rawValue !== null) is normalised via the
 *    shared `normaliseSubFactor` helper.
 *  - Absent sub-factors are reported with `isAbsent: true` and excluded
 *    from the weighted sum.
 *  - Remaining `initialWeight`s are renormalised so contributing
 *    sub-factors sum to 1.0.
 *  - When EVERY non-informational sub-factor is absent, the pillar
 *    emits a neutral 5.0 with `isFallback: true` and an
 *    `ALL_<PILLAR>_SUBFACTORS_ABSENT` reason.
 */
export function buildPillarFromSubFactors(
  pillar: StockPillarKey,
  weight: Decimal,
  specs: readonly SubFactorSpec[],
): PillarBreakdown {
  // Normalise each sub-factor first.
  type Computed = {
    spec: SubFactorSpec;
    normalisedScore: Decimal;
    isFallback: boolean;
    isAbsent: boolean;
  };
  const computed: Computed[] = specs.map((spec) => {
    if (spec.informational) {
      // Informational sub-factors are reported but weight-zero — they never contribute.
      return {
        spec,
        normalisedScore: ZERO,
        isFallback: false,
        isAbsent: spec.rawValue === null,
      };
    }
    const result = normaliseSubFactor(
      spec.rawValue,
      spec.peerValues,
      spec.fallbackBands,
      spec.direction,
    );
    return {
      spec,
      normalisedScore: result.normalisedScore,
      isFallback: result.isFallback,
      isAbsent: result.isAbsent,
    };
  });

  const contributing = computed.filter(
    (c) => !c.spec.informational && !c.isAbsent,
  );
  const sumOfInitialWeights = contributing.reduce(
    (acc, c) => acc.plus(c.spec.initialWeight),
    ZERO,
  );

  if (contributing.length === 0) {
    return {
      pillar,
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors: computed.map((c) => toBreakdown(c, ZERO)),
      isFallback: true,
      fallbackReason: `ALL_${pillar.toUpperCase()}_SUBFACTORS_ABSENT`,
    };
  }

  const subFactors: SubFactorBreakdown[] = computed.map((c) => {
    if (c.spec.informational || c.isAbsent) {
      return toBreakdown(c, ZERO);
    }
    const renormalised = c.spec.initialWeight
      .div(sumOfInitialWeights)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return toBreakdown(c, renormalised);
  });

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = clampScore(pillarScoreRaw).toDecimalPlaces(
    4,
    Decimal.ROUND_HALF_UP,
  );

  return {
    pillar,
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}

function toBreakdown(
  computed: {
    spec: SubFactorSpec;
    normalisedScore: Decimal;
    isFallback: boolean;
    isAbsent: boolean;
  },
  weightWithinPillar: Decimal,
): SubFactorBreakdown {
  return {
    name: computed.spec.name,
    rawValue: computed.spec.rawValue,
    normalisedScore: computed.normalisedScore,
    weightWithinPillar,
    source: computed.spec.source,
    direction: computed.spec.direction,
    isFallback: computed.isFallback,
    isAbsent: computed.isAbsent,
  };
}

function clampScore(value: Decimal): Decimal {
  return Decimal.max(ZERO, Decimal.min(TEN, value));
}

/** Shared helper for the equal-weight pillars. */
export function equalWeights(count: number): Decimal {
  return ONE.div(count);
}
