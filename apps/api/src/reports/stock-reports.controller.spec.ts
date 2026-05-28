import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { makeVerdict, type StockReportDoc } from "@finsight/shared";
import { ReportsService } from "./reports.service";
import { StockReportsController } from "./stock-reports.controller";

function makeService(doc: StockReportDoc | null): ReportsService {
  return {
    getStock: vi.fn().mockResolvedValue(doc),
  } as unknown as ReportsService;
}

const stub: StockReportDoc = {
  ticker: "RELIANCE",
  name: "Reliance",
  sector: "Energy",
  asOf: "2026-05-27",
  dataVersionHash: "v1",
  score: {
    value: 7,
    verdict: makeVerdict("CAUTION"),
    pillars: {
      fundamentals: 7,
      valuation: 6,
      technical: 7,
      sentiment: 5,
      risk: 6,
      event: 7,
    },
    weightsVersion: "0.1.0",
  },
  fundamentals: {
    pe: 25,
    pb: 4,
    roe: 18,
    roce: 22,
    debtEquity: 0.4,
    marketCap: 1_500_000,
  },
  technicals: {
    rsi14: 55,
    macdSignal: "bullish",
    dma50: 2400,
    dma200: 2200,
    price: 2500,
    beta: 1,
  },
  insights: {
    volatility: { stddev1y: 0.22 },
    profitConsistency: { profitableQuartersPct: 80, window: "12Q" },
    eventSensitivity: { avgAbsReturnOnResultDay: 1.5, baseline: 1 },
    swot: {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
      citedSources: [],
    },
    promoterHoldings: { latestPct: 50, deltaPctVsPrevQ: 0 },
  },
  peers: [],
  narrative: null,
  disclaimers: { analysis: "..." },
  dataLineage: [],
};

describe("StockReportsController.getStock", () => {
  it("returns the StockReportDoc when the service finds it", async () => {
    const controller = new StockReportsController(makeService(stub));
    await expect(controller.getStock("RELIANCE")).resolves.toMatchObject({
      ticker: "RELIANCE",
    });
  });

  it("throws NotFoundException when the ticker has no report", async () => {
    const controller = new StockReportsController(makeService(null));
    await expect(controller.getStock("UNKNOWN")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects an invalid ticker format with BadRequest", async () => {
    const controller = new StockReportsController(makeService(stub));
    await expect(controller.getStock("BAD!TICKER")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("accepts NSE-style tickers including '.', '&', and '-'", async () => {
    const controller = new StockReportsController(makeService(stub));
    await expect(
      controller.getStock("M&M-FIN"),
    ).resolves.toBeDefined();
  });
});
