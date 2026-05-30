import { describe, expect, it } from "vitest";
import {
  pillarCacheKey,
  shouldTriggerRecompute,
  toScoreStockSentiment,
  toSentimentItem,
} from "./pillar-publisher";
import { RECOMPUTE_THRESHOLD } from "./aggregator";

describe("pillarCacheKey", () => {
  it("namespaces by instrument id", () => {
    expect(pillarCacheKey("INFY")).toBe("sentiment:pillar:INFY");
  });
});

describe("toSentimentItem", () => {
  it("defaults a missing confidence to 1", () => {
    const item = toSentimentItem({
      source: "moneycontrol",
      sentiment: "POSITIVE",
      sentimentConfidence: null,
      publishedAt: "2026-05-29T00:00:00.000Z",
    });
    expect(item.confidence).toBe(1);
    expect(item.publishedAt).toBeInstanceOf(Date);
  });

  it("preserves a provided confidence", () => {
    const item = toSentimentItem({
      source: "et-markets",
      sentiment: "NEGATIVE",
      sentimentConfidence: 0.42,
      publishedAt: new Date(),
    });
    expect(item.confidence).toBe(0.42);
  });
});

describe("shouldTriggerRecompute", () => {
  it("never triggers when the new value is null", () => {
    expect(shouldTriggerRecompute(7, null)).toBe(false);
    expect(shouldTriggerRecompute(null, null)).toBe(false);
  });

  it("triggers on a first-ever value (no prior)", () => {
    expect(shouldTriggerRecompute(null, 6.5)).toBe(true);
  });

  it("triggers when the shift is >= threshold", () => {
    expect(shouldTriggerRecompute(5.0, 5.5)).toBe(true);
    expect(shouldTriggerRecompute(7.0, 6.5)).toBe(true);
  });

  it("does NOT trigger when the shift is < threshold", () => {
    expect(shouldTriggerRecompute(5.0, 5.4)).toBe(false);
    expect(shouldTriggerRecompute(7.0, 7.0)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(shouldTriggerRecompute(5, 5.3, 0.2)).toBe(true);
    expect(RECOMPUTE_THRESHOLD).toBe(0.5);
  });
});

describe("toScoreStockSentiment", () => {
  it("maps a non-null value onto last30dAggregate with null analystConsensus", () => {
    expect(toScoreStockSentiment(7.5)).toEqual({
      last30dAggregate: 7.5,
      analystConsensus: null,
    });
  });

  it("returns null for a null value (preserves Phase-3 neutral fallback)", () => {
    expect(toScoreStockSentiment(null)).toBeNull();
  });
});
