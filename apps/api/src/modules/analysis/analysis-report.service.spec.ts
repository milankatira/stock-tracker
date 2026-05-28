import { describe, expect, it, vi } from "vitest";
import type { MarketDataService, Quote } from "../market-data/market-data.service";
import type { NarrativeService } from "../narrative/narrative.service";
import { AnalysisReportService } from "./analysis-report.service";

const quote: Quote = {
  symbol: "RELIANCE.NS",
  price: 2450.5,
  currency: "INR",
  asOf: "2026-05-28T06:00:00.000Z",
  source: "yahoo-finance",
};

const request = {
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

function makeService() {
  const marketData = {
    getStockQuote: vi.fn(async () => quote),
  } as unknown as MarketDataService;
  const narrative = {
    getNarrative: vi.fn(async () => "Plain-English narrative"),
  } as unknown as NarrativeService;

  return {
    service: new AnalysisReportService(marketData, narrative),
    marketData,
    narrative,
  };
}

describe("AnalysisReportService", () => {
  it("combines quote, deterministic score, citations, and narrative", async () => {
    const { service, marketData, narrative } = makeService();

    await expect(service.createStockReport(request)).resolves.toMatchObject({
      asset: {
        name: "Reliance Industries",
        type: "stock",
        symbol: "RELIANCE.NS",
      },
      quote,
      score: {
        score: 7,
        verdict: "STRONG_SCORE",
      },
      narrative: "Plain-English narrative",
      citations: ["Yahoo Finance quote for RELIANCE.NS as of 2026-05-28T06:00:00.000Z"],
    });
    expect(marketData.getStockQuote).toHaveBeenCalledWith("RELIANCE");
    expect(narrative.getNarrative).toHaveBeenCalledWith(
      expect.objectContaining({
        assetName: "Reliance Industries",
        assetType: "stock",
        cacheKey: expect.stringMatching(
          /^stock:RELIANCE\.NS:7:STRONG_SCORE:72:68:74:70:64:65:[a-f0-9]{16}$/,
        ),
        citations: ["Yahoo Finance quote for RELIANCE.NS as of 2026-05-28T06:00:00.000Z"],
      }),
    );
  });

  it("changes the narrative cache key when quote citation freshness changes", async () => {
    const { service, marketData, narrative } = makeService();
    vi.mocked(marketData.getStockQuote)
      .mockResolvedValueOnce(quote)
      .mockResolvedValueOnce({
        ...quote,
        asOf: "2026-05-28T06:01:00.000Z",
      });

    await service.createStockReport(request);
    await service.createStockReport(request);

    const cacheKeys = vi
      .mocked(narrative.getNarrative)
      .mock.calls.map(([input]) => input.cacheKey);
    expect(cacheKeys[0]).not.toBe(cacheKeys[1]);
  });
});
