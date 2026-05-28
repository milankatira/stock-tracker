import { Decimal } from "../decimal";
import type {
  PillarBreakdown,
  ScoreStockTechnical,
  SubFactorBreakdown,
} from "../../types";
import {
  bollingerPositionScore,
  macdState,
  priceVsMa,
  rsiScore,
} from "../indicators";

const ZERO = new Decimal(0);
const FIVE = new Decimal(5);
const TEN = new Decimal(10);

// [ASSUMED] A2 — Technical sub-factor weights (Beta is informational / weight 0).
const W_SMA50 = new Decimal("0.15");
const W_SMA200 = new Decimal("0.20");
const W_RSI = new Decimal("0.15");
const W_MACD = new Decimal("0.10");
const W_BB = new Decimal("0.10");
const W_R1Y = new Decimal("0.15");
const W_R3Y = new Decimal("0.15");

/**
 * Technical pillar — 20% weight. Sub-factor scores are computed from
 * the price + indicator inputs directly (no cohort needed); when the
 * indicator is missing, the sub-factor is `isAbsent` and its weight is
 * redistributed.
 *
 * Beta is reported in the breakdown with `weightWithinPillar = 0` so
 * downstream UIs can show it without it influencing the pillar score.
 */
export function scoreTechnicalPillar(
  technical: ScoreStockTechnical,
  weight: Decimal,
): PillarBreakdown {
  type Entry = {
    name: string;
    source: string;
    rawValue: number | null;
    direction: "higher" | "lower";
    initialWeight: Decimal;
    score: Decimal | null;
  };

  const entries: Entry[] = [
    {
      name: "sma50",
      source: "technical.sma50",
      rawValue: technical.sma50,
      direction: "higher",
      initialWeight: W_SMA50,
      score: maRatioScore(technical.price, technical.sma50),
    },
    {
      name: "sma200",
      source: "technical.sma200",
      rawValue: technical.sma200,
      direction: "higher",
      initialWeight: W_SMA200,
      score: maRatioScore(technical.price, technical.sma200),
    },
    {
      name: "rsi14",
      source: "technical.rsi14",
      rawValue: technical.rsi14,
      direction: "higher",
      initialWeight: W_RSI,
      score: technical.rsi14 === null ? null : rsiScore(technical.rsi14),
    },
    {
      name: "macd",
      source: "technical.macd",
      rawValue:
        technical.macd?.macd !== undefined ? technical.macd.macd : null,
      direction: "higher",
      initialWeight: W_MACD,
      score:
        technical.macd === null
          ? null
          : macdState(technical.macd.macd, technical.macd.signal),
    },
    {
      name: "bollinger",
      source: "technical.bollinger",
      rawValue:
        technical.bollinger?.upper !== undefined
          ? technical.bollinger.upper
          : null,
      direction: "higher",
      initialWeight: W_BB,
      score:
        technical.bollinger === null
          ? null
          : bollingerPositionScore(
              technical.price,
              technical.bollinger.lower,
              technical.bollinger.upper,
            ),
    },
    {
      name: "return1yVsNifty",
      source: "technical.return1yVsNifty",
      rawValue: technical.return1yVsNifty,
      direction: "higher",
      initialWeight: W_R1Y,
      score: relativeReturnScore(technical.return1yVsNifty),
    },
    {
      name: "return3yVsNifty",
      source: "technical.return3yVsNifty",
      rawValue: technical.return3yVsNifty,
      direction: "higher",
      initialWeight: W_R3Y,
      score: relativeReturnScore(technical.return3yVsNifty),
    },
  ];

  const present = entries.filter((e) => e.score !== null);
  const sumWeights = present.reduce(
    (acc, e) => acc.plus(e.initialWeight),
    ZERO,
  );

  const subFactors: SubFactorBreakdown[] = entries.map((entry) => {
    const isAbsent = entry.score === null;
    if (isAbsent) {
      return {
        name: entry.name,
        source: entry.source,
        rawValue: entry.rawValue,
        direction: entry.direction,
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
      direction: entry.direction,
      normalisedScore: (entry.score as Decimal).toDecimalPlaces(
        4,
        Decimal.ROUND_HALF_UP,
      ),
      weightWithinPillar: renormalised,
      isFallback: false,
      isAbsent: false,
    };
  });

  // Beta — informational only, weight 0.
  subFactors.push({
    name: "beta",
    source: "technical.beta",
    rawValue: technical.beta,
    direction: "higher",
    normalisedScore: ZERO,
    weightWithinPillar: ZERO,
    isFallback: false,
    isAbsent: technical.beta === null,
  });

  if (present.length === 0) {
    return {
      pillar: "technical",
      pillarScore: FIVE,
      weight,
      weightedContribution: weight.times(FIVE),
      subFactors,
      isFallback: true,
      fallbackReason: "ALL_TECHNICAL_SUBFACTORS_ABSENT",
    };
  }

  const pillarScoreRaw = subFactors.reduce(
    (acc, sf) => acc.plus(sf.normalisedScore.times(sf.weightWithinPillar)),
    ZERO,
  );
  const pillarScore = Decimal.max(ZERO, Decimal.min(TEN, pillarScoreRaw))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    pillar: "technical",
    pillarScore,
    weight,
    weightedContribution: pillarScore.times(weight),
    subFactors,
    isFallback: false,
  };
}

function maRatioScore(price: number, ma: number | null): Decimal | null {
  const ratio = priceVsMa(price, ma);
  if (ratio === null) return null;
  if (ratio.gte(0.1)) return TEN;
  if (ratio.gte(0.02)) return new Decimal(8);
  if (ratio.gte(-0.02)) return FIVE;
  if (ratio.gte(-0.1)) return new Decimal(3);
  return ZERO;
}

function relativeReturnScore(value: number | null): Decimal | null {
  if (value === null || !Number.isFinite(value)) return null;
  const v = new Decimal(value);
  if (v.gte(0.2)) return TEN;
  if (v.gte(0.05)) return new Decimal(8);
  if (v.gte(-0.05)) return FIVE;
  if (v.gte(-0.2)) return new Decimal(3);
  return ZERO;
}
