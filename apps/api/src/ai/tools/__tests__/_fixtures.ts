import { vi } from "vitest";
import type { FundReportDoc, StockReportDoc } from "@finsight/shared";
import type { ToolContext } from "../tool.types";

export const STOCK_DOC: StockReportDoc = {
  ticker: "RELIANCE",
  name: "Reliance Industries",
  sector: "Energy",
  asOf: "2026-05-28T00:00:00.000Z",
  dataVersionHash: "dvh-stock-123",
  score: {
    value: 7.2,
    verdict: "STRONG_SCORE" as StockReportDoc["score"]["verdict"],
    pillars: {
      fundamentals: 8,
      valuation: 6,
      technical: 7,
      sentiment: 7,
      risk: 6,
      event: 5,
    },
    weightsVersion: "1",
  },
  fundamentals: {
    pe: 25.4,
    pb: 4.12,
    roe: 18.3,
    roce: 22.1,
    debtEquity: 0.43,
    marketCap: 1_500_000,
  },
  technicals: {
    rsi14: 56.2,
    macdSignal: "bullish",
    dma50: 2900,
    dma200: 2700,
    price: 2950,
    beta: 1.05,
  },
  insights: {
    volatility: { stddev1y: 0.21 },
    profitConsistency: { profitableQuartersPct: 92, window: "12Q" },
    eventSensitivity: { avgAbsReturnOnResultDay: 0.03, baseline: 0.01 },
    swot: {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
      citedSources: [],
    },
    promoterHoldings: { latestPct: 50.3, deltaPctVsPrevQ: 0 },
  },
  peers: [
    { ticker: "ONGC", name: "ONGC", score: 6.1, sector: "Energy" },
    { ticker: "IOC", name: "Indian Oil", score: 5.4, sector: "Energy" },
    { ticker: "BPCL", name: "BPCL", score: 5.9, sector: "Energy" },
    { ticker: "GAIL", name: "GAIL", score: 6.3, sector: "Energy" },
  ],
  narrative: null,
  disclaimers: { analysis: "Analysis, not advice." },
  dataLineage: [],
};

export const FUND_DOC: FundReportDoc = {
  schemeCode: "120503",
  name: "Parag Parikh Flexi Cap",
  category: "Flexi Cap",
  asOf: "2026-05-28T00:00:00.000Z",
  dataVersionHash: "dvh-fund-456",
  score: {
    value: 8.1,
    verdict: "STRONG_SCORE" as FundReportDoc["score"]["verdict"],
    pillars: {
      returns: 8,
      riskAdjusted: 8,
      consistency: 8,
      costs: 7,
      manager: 9,
      portfolio: 8,
    },
    weightsVersion: "1",
  },
  returns: {
    fund: { "1y": 18.2, "3y": 21.4, "5y": 19.8, "10y": 17.1 },
    benchmark: { "1y": 14.1, "3y": 16.0, "5y": 15.2, "10y": 13.0 },
    category: { "1y": 13.5, "3y": 15.1, "5y": 14.0, "10y": 12.2 },
  },
  risk: { sharpe1y: 1.4, stddev1y: 0.16, maxDrawdown1y: -0.12 },
  holdings: [],
  sectorAllocation: [],
  meta: {
    expenseRatioPct: 0.62,
    aumCr: 75000,
    managerName: "Rajeev Thakkar",
    managerTenureYears: 12,
  },
  peers: [],
  narrative: null,
  disclaimers: { analysis: "Analysis, not advice." },
  dataLineage: [],
};

export function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    reports: { getStock: vi.fn().mockResolvedValue(STOCK_DOC) },
    fundReports: { getFund: vi.fn().mockResolvedValue(FUND_DOC) },
    news: { getRecentForTicker: vi.fn().mockResolvedValue([]) },
    search: { searchInstruments: vi.fn().mockResolvedValue([]) },
    userId: "user-1",
    scope: { type: "stock", symbols: ["RELIANCE"] },
    ...overrides,
  };
}
