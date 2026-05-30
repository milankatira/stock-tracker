import { describe, expect, it } from "vitest";
import {
  aggregateSentimentPillar,
  RECOMPUTE_THRESHOLD,
  SOURCE_AUTHORITY,
  TAU_HOURS,
  type SentimentItem,
} from "./aggregator";

const ASOF = new Date("2026-05-29T12:00:00.000Z");

function item(
  partial: Partial<SentimentItem> & Pick<SentimentItem, "sentiment">,
): SentimentItem {
  return {
    source: "moneycontrol",
    confidence: 1,
    publishedAt: new Date(ASOF.getTime() - 60 * 60 * 1000), // 1h old
    ...partial,
  };
}

function hoursAgo(h: number): Date {
  return new Date(ASOF.getTime() - h * 60 * 60 * 1000);
}

describe("aggregateSentimentPillar", () => {
  it("returns null for empty input (so ScoringModule falls back to neutral)", () => {
    expect(aggregateSentimentPillar([], ASOF)).toBeNull();
  });

  it("returns > 5 (and <= 10) for three positive items", () => {
    const result = aggregateSentimentPillar(
      [item({ sentiment: "POSITIVE" }), item({ sentiment: "POSITIVE" }), item({ sentiment: "POSITIVE" })],
      ASOF,
    );
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(5);
    expect(result!).toBeLessThanOrEqual(10);
  });

  it("returns < 5 (and >= 0) for three negative items", () => {
    const result = aggregateSentimentPillar(
      [item({ sentiment: "NEGATIVE" }), item({ sentiment: "NEGATIVE" }), item({ sentiment: "NEGATIVE" })],
      ASOF,
    );
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(5);
    expect(result!).toBeGreaterThanOrEqual(0);
  });

  it("returns exactly 5 for neutral-only items", () => {
    const result = aggregateSentimentPillar(
      [item({ sentiment: "NEUTRAL" }), item({ sentiment: "NEUTRAL" })],
      ASOF,
    );
    expect(result).toBeCloseTo(5, 6);
  });

  it("weights recent items more heavily (recency decay, tau=168h)", () => {
    // recent POSITIVE vs week-old NEGATIVE → recent positive dominates
    const result = aggregateSentimentPillar(
      [
        item({ sentiment: "POSITIVE", publishedAt: hoursAgo(1) }),
        item({ sentiment: "NEGATIVE", publishedAt: hoursAgo(168) }),
      ],
      ASOF,
    );
    expect(result!).toBeGreaterThan(5);
  });

  it("weights higher-authority sources more (mixed polarity, equal age)", () => {
    // BSE-positive (1.2) vs newsdata-negative (0.6) at equal age → positive wins
    const bsePos = aggregateSentimentPillar(
      [
        item({ sentiment: "POSITIVE", source: "bse-announcements", publishedAt: hoursAgo(1) }),
        item({ sentiment: "NEGATIVE", source: "newsdata-io", publishedAt: hoursAgo(1) }),
      ],
      ASOF,
    );
    expect(bsePos!).toBeGreaterThan(5);

    // Swap authorities → negative wins
    const bseNeg = aggregateSentimentPillar(
      [
        item({ sentiment: "NEGATIVE", source: "bse-announcements", publishedAt: hoursAgo(1) }),
        item({ sentiment: "POSITIVE", source: "newsdata-io", publishedAt: hoursAgo(1) }),
      ],
      ASOF,
    );
    expect(bseNeg!).toBeLessThan(5);
  });

  it("defaults an unknown source to authority 0.5 (graceful, no throw)", () => {
    // unknown-source positive (0.5) vs BSE negative (1.2) equal age → BSE negative dominates
    const result = aggregateSentimentPillar(
      [
        item({ sentiment: "POSITIVE", source: "some-random-blog", publishedAt: hoursAgo(1) }),
        item({ sentiment: "NEGATIVE", source: "bse-announcements", publishedAt: hoursAgo(1) }),
      ],
      ASOF,
    );
    expect(result!).toBeLessThan(5);
    expect(SOURCE_AUTHORITY["some-random-blog"]).toBeUndefined();
  });

  it("treats zero-confidence items as neutral (den is confidence-independent)", () => {
    // den = sum of weights (>0); num = sum(w*polarity*0) = 0 → raw 0 → 5.0
    const result = aggregateSentimentPillar(
      [
        item({ sentiment: "POSITIVE", confidence: 0 }),
        item({ sentiment: "NEGATIVE", confidence: 0 }),
      ],
      ASOF,
    );
    expect(result).toBeCloseTo(5, 6);
  });

  it("clamps to [0, 10]", () => {
    const result = aggregateSentimentPillar(
      Array.from({ length: 20 }, () => item({ sentiment: "POSITIVE" })),
      ASOF,
    );
    expect(result!).toBeLessThanOrEqual(10);
    expect(result!).toBeGreaterThanOrEqual(0);
  });

  it("exposes tunable constants", () => {
    expect(TAU_HOURS).toBe(168);
    expect(RECOMPUTE_THRESHOLD).toBe(0.5);
    expect(SOURCE_AUTHORITY["bse-announcements"]).toBeGreaterThan(
      SOURCE_AUTHORITY["newsdata-io"]!,
    );
  });
});
