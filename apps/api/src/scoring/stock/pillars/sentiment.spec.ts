import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import {
  ALL_SENTIMENT_SUBFACTORS_ABSENT,
  NO_SENTIMENT_DATA_PRE_PHASE_6,
  scoreSentimentPillar,
} from "./sentiment";

const W = new Decimal("0.10");

describe("scoreSentimentPillar", () => {
  it("returns NO_SENTIMENT_DATA_PRE_PHASE_6 fallback when input is null", () => {
    const pillar = scoreSentimentPillar(null, W);
    expect(pillar.isFallback).toBe(true);
    expect(pillar.fallbackReason).toBe(NO_SENTIMENT_DATA_PRE_PHASE_6);
    expect(pillar.pillarScore.toFixed(4)).toBe("5.0000");
    expect(pillar.weightedContribution.toFixed(4)).toBe("0.5000");
    expect(pillar.subFactors).toEqual([]);
  });

  it("uses only the present sub-factor and renormalises its weight to 1.0", () => {
    const pillar = scoreSentimentPillar(
      { last30dAggregate: 8, analystConsensus: null },
      W,
    );
    expect(pillar.isFallback).toBe(false);
    expect(pillar.pillarScore.toFixed(4)).toBe("8.0000");
    const last30 = pillar.subFactors.find((sf) => sf.name === "last30dAggregate");
    expect(last30?.weightWithinPillar.toFixed(4)).toBe("1.0000");
    expect(last30?.isAbsent).toBe(false);
    const consensus = pillar.subFactors.find(
      (sf) => sf.name === "analystConsensus",
    );
    expect(consensus?.isAbsent).toBe(true);
  });

  it("returns ALL_SENTIMENT_SUBFACTORS_ABSENT when both sub-factors are null", () => {
    const pillar = scoreSentimentPillar(
      { last30dAggregate: null, analystConsensus: null },
      W,
    );
    expect(pillar.isFallback).toBe(true);
    expect(pillar.fallbackReason).toBe(ALL_SENTIMENT_SUBFACTORS_ABSENT);
    expect(pillar.pillarScore.toFixed(4)).toBe("5.0000");
  });
});
