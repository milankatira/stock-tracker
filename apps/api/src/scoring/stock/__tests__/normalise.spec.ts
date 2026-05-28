import { describe, expect, it } from "vitest";
import {
  absoluteBand,
  normaliseSubFactor,
  percentileRank,
  type AbsoluteBand,
} from "../normalise";

const HIGHER = "higher" as const;
const LOWER = "lower" as const;

describe("percentileRank", () => {
  it("returns 5.0000 for an empty cohort", () => {
    expect(percentileRank(10, [], HIGHER).toFixed(4)).toBe("5.0000");
  });

  it("returns 10.0000 when value is above every peer (direction: higher)", () => {
    expect(percentileRank(100, [10, 20, 30, 40, 50], HIGHER).toFixed(4)).toBe(
      "10.0000",
    );
  });

  it("returns 0.0000 when value is below every peer (direction: higher)", () => {
    expect(percentileRank(0, [10, 20, 30, 40, 50], HIGHER).toFixed(4)).toBe(
      "0.0000",
    );
  });

  it("inverts the score for direction: lower", () => {
    const ascending = percentileRank(100, [10, 20, 30, 40, 50], HIGHER).toFixed(
      4,
    );
    const descending = percentileRank(100, [10, 20, 30, 40, 50], LOWER).toFixed(
      4,
    );
    expect(ascending).toBe("10.0000");
    expect(descending).toBe("0.0000");
  });

  it("uses average rank for ties (cohort of identical values)", () => {
    expect(percentileRank(5, [5, 5, 5, 5, 5], HIGHER).toFixed(4)).toBe("5.0000");
  });
});

describe("absoluteBand", () => {
  const bands: readonly AbsoluteBand[] = [
    { upTo: 5, score: 0 },
    { upTo: 15, score: 5 },
    { upTo: 25, score: 8 },
    { upTo: Number.POSITIVE_INFINITY, score: 10 },
  ];

  it("returns the matched band's score (direction: higher)", () => {
    expect(absoluteBand(10, bands, HIGHER).toFixed(4)).toBe("5.0000");
    expect(absoluteBand(20, bands, HIGHER).toFixed(4)).toBe("8.0000");
    expect(absoluteBand(100, bands, HIGHER).toFixed(4)).toBe("10.0000");
  });

  it("mirrors around 10 for direction: lower", () => {
    expect(absoluteBand(10, bands, LOWER).toFixed(4)).toBe("5.0000");
    expect(absoluteBand(3, bands, LOWER).toFixed(4)).toBe("10.0000");
  });
});

describe("normaliseSubFactor", () => {
  const bands: readonly AbsoluteBand[] = [
    { upTo: 5, score: 0 },
    { upTo: 15, score: 5 },
    { upTo: 25, score: 8 },
    { upTo: Number.POSITIVE_INFINITY, score: 10 },
  ];

  it("reports isAbsent when the raw value is null", () => {
    const result = normaliseSubFactor(null, [1, 2, 3], bands, HIGHER);
    expect(result.isAbsent).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.normalisedScore.toFixed(4)).toBe("0.0000");
  });

  it("uses absoluteBand when the peer cohort has fewer than 20 entries", () => {
    const result = normaliseSubFactor(10, [1, 2, 3], bands, HIGHER);
    expect(result.isFallback).toBe(true);
    expect(result.isAbsent).toBe(false);
    expect(result.normalisedScore.toFixed(4)).toBe("5.0000");
  });

  it("uses percentileRank when the cohort has 20 or more entries", () => {
    const cohort = Array.from({ length: 25 }, (_, i) => i);
    const result = normaliseSubFactor(24, cohort, bands, HIGHER);
    expect(result.isFallback).toBe(false);
    expect(result.normalisedScore.toNumber()).toBeGreaterThanOrEqual(9);
  });
});
