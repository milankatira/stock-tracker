import { describe, expect, it } from "vitest";
import { VERDICTS } from "@finsight/shared";
import { AnalysisService } from "./analysis.service";

describe("AnalysisService", () => {
  it("returns deterministic scoring output", () => {
    expect(
      new AnalysisService().score({
        valuation: 72,
        growth: 68,
        profitability: 74,
        balanceSheet: 70,
        momentum: 64,
        risk: 35,
      }),
    ).toMatchObject({
      score: 7,
      verdict: VERDICTS.STRONG_SCORE,
      insightCards: expect.arrayContaining([
        { label: "Risk control", score: 65, weight: 0.1 },
      ]),
    });
  });
});
