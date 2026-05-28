import { Decimal } from "../decimal";
import type {
  PillarBreakdown,
  ScoreStockEvent,
  SubFactorBreakdown,
} from "../../types";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

const W_EACH = new Decimal("1").div(3);

// [ASSUMED] A3 — abs-return bands. Lower mean absolute reaction = better.
function eventScore(meanAbsReturnPct: number | null): Decimal | null {
  if (meanAbsReturnPct === null || !Number.isFinite(meanAbsReturnPct)) {
    return null;
  }
  const v = Math.abs(meanAbsReturnPct);
  if (v <= 1) return TEN;
  if (v <= 2) return new Decimal(8);
  if (v <= 3) return FIVE;
  if (v <= 5) return new Decimal(3);
  return ZERO;
}

/**
 * Event pillar — 5% of the final stock score. Lower mean absolute
 * post-event return (less reaction surprise) = higher score.
 */
export function scoreEventPillar(
  event: ScoreStockEvent,
  weight: Decimal,
): PillarBreakdown {
  type Entry = {
    name: string;
    source: string;
    rawValue: number | null;
    score: Decimal | null;
  };

  const entries: Entry[] = [
    {
      name: "meanAbsReturnResults5",
      source: "event.meanAbsReturnResults5",
      rawValue: event.meanAbsReturnResults5,
      score: eventScore(event.meanAbsReturnResults5),
    },
    {
      name: "meanAbsReturnDividends5",
      source: "event.meanAbsReturnDividends5",
      rawValue: event.meanAbsReturnDividends5,
      score: eventScore(event.meanAbsReturnDividends5),
    },
    {
      name: "meanAbsReturnSectorNews5",
      source: "event.meanAbsReturnSectorNews5",
      rawValue: event.meanAbsReturnSectorNews5,
      score: eventScore(event.meanAbsReturnSectorNews5),
    },
  ];

  const present = entries.filter((e) => e.score !== null);
  const sumWeights = present.reduce((acc) => acc.plus(W_EACH), ZERO);

  const subFactors: SubFactorBreakdown[] = entries.map((entry) => {
    const isAbsent = entry.score === null;
    if (isAbsent) {
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
    const renormalised = W_EACH.div(sumWeights).toDecimalPlaces(
      4,
      Decimal.ROUND_HALF_UP,
    );
    return {
      name: entry.name,
      source: entry.source,
      rawValue: entry.rawValue,
      direction: "lower",
      normalisedScore: (entry.score as Decimal).toDecimalPlaces(
        4,
        Decimal.ROUND_HALF_UP,
      ),
      weightWithinPillar: renormalised,
      isFallback: false,
      isAbsent: false,
    };
  });

  if (present.length === 0) {
    return {
      pillar: "event",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_EVENT_SUBFACTORS_ABSENT",
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "event",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}
