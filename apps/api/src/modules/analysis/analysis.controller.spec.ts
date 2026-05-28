import { describe, expect, it, vi } from "vitest";
import { AnalysisController } from "./analysis.controller";
import type { AnalysisReportService } from "./analysis-report.service";
import type { AnalysisService } from "./analysis.service";

describe("AnalysisController", () => {
  it("delegates score requests to AnalysisService", () => {
    const result = {
      score: 5,
      verdict: "CAUTION",
      insightCards: [],
    };
    const service = {
      score: vi.fn(() => result),
    } as unknown as AnalysisService;
    const body = {
      valuation: 50,
      growth: 50,
      profitability: 50,
      balanceSheet: 50,
      momentum: 50,
      risk: 50,
    };

    expect(new AnalysisController(service, {} as AnalysisReportService).score(body)).toBe(
      result,
    );
    expect(service.score).toHaveBeenCalledWith(body);
  });

  it("delegates report requests to AnalysisReportService", async () => {
    const result = {
      asset: { name: "Reliance Industries", type: "stock", symbol: "RELIANCE.NS" },
      quote: {
        symbol: "RELIANCE.NS",
        price: 2450.5,
        currency: "INR",
        asOf: "2026-05-28T06:00:00.000Z",
        source: "yahoo-finance",
      },
      score: { score: 7, verdict: "STRONG_SCORE", insightCards: [] },
      citations: [],
      narrative: "Plain-English narrative",
    };
    const reports = {
      createStockReport: vi.fn(async () => result),
    } as unknown as AnalysisReportService;
    const body = {
      assetName: "Reliance Industries",
      assetType: "stock" as const,
      symbol: "RELIANCE",
      valuation: 72,
      growth: 68,
      profitability: 74,
      balanceSheet: 70,
      momentum: 64,
      risk: 35,
    };

    await expect(
      new AnalysisController({} as AnalysisService, reports).report(body),
    ).resolves.toBe(result);
    expect(reports.createStockReport).toHaveBeenCalledWith(body);
  });
});
