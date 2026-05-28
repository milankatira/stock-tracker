import { describe, expect, it } from "vitest";
import {
  calculateScore,
  normalizeMetric,
  type ScoreInput,
} from "../src/scoring";
import { VERDICTS } from "../src/verdict";

const baseInput: ScoreInput = {
  valuation: 72,
  growth: 68,
  profitability: 74,
  balanceSheet: 70,
  momentum: 64,
  risk: 35,
};

describe("normalizeMetric", () => {
  it("clamps metrics into the 0..100 range", () => {
    expect(normalizeMetric(-10)).toBe(0);
    expect(normalizeMetric(48.6)).toBe(49);
    expect(normalizeMetric(140)).toBe(100);
  });
});

describe("calculateScore", () => {
  it("computes a deterministic 1..10 score from weighted metric inputs", () => {
    expect(calculateScore(baseInput)).toEqual({
      score: 7,
      verdict: VERDICTS.STRONG_SCORE,
      insightCards: [
        { label: "Valuation", score: 72, weight: 0.2 },
        { label: "Growth", score: 68, weight: 0.2 },
        { label: "Profitability", score: 74, weight: 0.2 },
        { label: "Balance sheet", score: 70, weight: 0.15 },
        { label: "Momentum", score: 64, weight: 0.15 },
        { label: "Risk control", score: 65, weight: 0.1 },
      ],
    });
  });

  it("maps weak metrics to WEAK_SCORE", () => {
    expect(
      calculateScore({
        valuation: 20,
        growth: 15,
        profitability: 25,
        balanceSheet: 30,
        momentum: 15,
        risk: 82,
      }).verdict,
    ).toBe(VERDICTS.WEAK_SCORE);
  });

  it("maps mixed metrics to CAUTION", () => {
    expect(
      calculateScore({
        valuation: 50,
        growth: 54,
        profitability: 48,
        balanceSheet: 55,
        momentum: 52,
        risk: 49,
      }).verdict,
    ).toBe(VERDICTS.CAUTION);
  });

  it("never allows risk to improve the score when risk is high", () => {
    const lowRisk = calculateScore({ ...baseInput, risk: 10 });
    const highRisk = calculateScore({ ...baseInput, risk: 90 });

    expect(highRisk.score).toBeLessThan(lowRisk.score);
  });
});
