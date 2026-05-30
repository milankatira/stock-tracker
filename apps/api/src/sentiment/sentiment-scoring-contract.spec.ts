import { describe, expect, it } from "vitest";
import { scoreStock } from "../scoring";
import { STOCK_FIXTURES } from "../scoring/stock/__tests__/fixtures";
import { NO_SENTIMENT_DATA_PRE_PHASE_6 } from "../scoring/stock/pillars/sentiment";
import { toScoreStockSentiment } from "./pillar-publisher";

/**
 * NEWS-04 contract proof. The Phase-2↔3 score loader is still a stub
 * (StocksScoreLoader throws), so the EOD cron cannot run end-to-end yet.
 * What this spec locks down is the contract the loader will use: the
 * scoring engine consumes `SentimentService.computePillar()` output
 * directly, and a `null` value preserves the Phase-3 neutral fallback.
 */
const base = STOCK_FIXTURES[0]!.input;

function sentimentPillar(input: typeof base) {
  const result = scoreStock(input);
  const pillar = result.pillars.find((p) => p.pillar === "sentiment");
  if (!pillar) throw new Error("sentiment pillar missing from ScoreResult");
  return pillar;
}

describe("sentiment pillar feeds the scoring engine (NEWS-04)", () => {
  it("consumes a news-derived value via last30dAggregate (not a fallback)", () => {
    const input = { ...base, sentiment: toScoreStockSentiment(7.5) };
    const pillar = sentimentPillar(input);

    expect(pillar.isFallback).toBe(false);
    expect(pillar.pillarScore.toNumber()).toBeCloseTo(7.5, 4);
  });

  it("falls back to neutral when the aggregator returns null (no news)", () => {
    const input = { ...base, sentiment: toScoreStockSentiment(null) };
    expect(input.sentiment).toBeNull(); // contract passed null through
    const pillar = sentimentPillar(input);

    expect(pillar.isFallback).toBe(true);
    expect(pillar.fallbackReason).toBe(NO_SENTIMENT_DATA_PRE_PHASE_6);
    expect(pillar.pillarScore.toNumber()).toBe(5);
  });

  it("a low news value drags the sentiment pillar below neutral", () => {
    const input = { ...base, sentiment: toScoreStockSentiment(2.0) };
    const pillar = sentimentPillar(input);

    expect(pillar.isFallback).toBe(false);
    expect(pillar.pillarScore.toNumber()).toBeLessThan(5);
  });
});
