import { Decimal } from "../decimal";
import type {
  PillarBreakdown,
  ScoreStockSentiment,
  SubFactorBreakdown,
} from "../../types";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

export const NO_SENTIMENT_DATA_PRE_PHASE_6 = "NO_SENTIMENT_DATA_PRE_PHASE_6";
export const ALL_SENTIMENT_SUBFACTORS_ABSENT = "ALL_SENTIMENT_SUBFACTORS_ABSENT";

const W_LAST30D = new Decimal("0.7");
const W_CONSENSUS = new Decimal("0.3");

/**
 * Sentiment pillar — 10% of the final stock score. Returns a neutral
 * 5.0 with `isFallback: true, fallbackReason: NO_SENTIMENT_DATA_PRE_PHASE_6`
 * when the loader passes `sentiment === null` (pre-Phase 6 news outage
 * resilience contract). When the object is present but both sub-factors
 * are missing, returns 5.0 with `ALL_SENTIMENT_SUBFACTORS_ABSENT`.
 */
export function scoreSentimentPillar(
  sentiment: ScoreStockSentiment | null,
  weight: Decimal,
): PillarBreakdown {
  if (sentiment === null) {
    return {
      pillar: "sentiment",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors: [],
      isFallback: true,
      fallbackReason: NO_SENTIMENT_DATA_PRE_PHASE_6,
    };
  }

  const entries: ReadonlyArray<{
    readonly name: string;
    readonly source: string;
    readonly rawValue: number | null;
    readonly initialWeight: Decimal;
  }> = [
    {
      name: "last30dAggregate",
      source: "sentiment.last30dAggregate",
      rawValue: sentiment.last30dAggregate,
      initialWeight: W_LAST30D,
    },
    {
      name: "analystConsensus",
      source: "sentiment.analystConsensus",
      rawValue: sentiment.analystConsensus,
      initialWeight: W_CONSENSUS,
    },
  ];

  const present = entries.filter(
    (e) => e.rawValue !== null && Number.isFinite(e.rawValue),
  );
  const sumWeights = present.reduce(
    (acc, e) => acc.plus(e.initialWeight),
    ZERO,
  );

  const subFactors: SubFactorBreakdown[] = entries.map((entry) => {
    const isAbsent = entry.rawValue === null || !Number.isFinite(entry.rawValue);
    if (isAbsent) {
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
    const value = new Decimal(entry.rawValue as number);
    const clamped = Decimal.max(ZERO, Decimal.min(TEN, value));
    const renormalised = entry.initialWeight
      .div(sumWeights)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return {
      name: entry.name,
      source: entry.source,
      rawValue: entry.rawValue,
      direction: "higher",
      normalisedScore: clamped.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
      weightWithinPillar: renormalised,
      isFallback: false,
      isAbsent: false,
    };
  });

  if (present.length === 0) {
    return {
      pillar: "sentiment",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: ALL_SENTIMENT_SUBFACTORS_ABSENT,
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "sentiment",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}
