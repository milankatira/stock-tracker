/**
 * Test fixtures for Phase 08 public SEO pages.
 *
 * IMPORTANT: These mirror the REAL Phase-4 DTOs (`StockReportDoc` /
 * `FundReportDoc` from `@finsight/shared`), NOT the stale `<interfaces>`
 * sample in 08-01-PLAN.md. The plan's sample (`{symbol, exchange,
 * verdictLabel, oneLineSummary}`) predates the actual contract; per the
 * plan's own instruction ("If any field is missing in Phase 4's actual
 * DTO ... do NOT invent fields") we align to reality.
 *
 * Verdict enum -> display label mapping lives in the existing
 * `VerdictBadge` COPY map:
 *   STRONG_SCORE -> "Strong Score", CAUTION -> "Caution", WEAK_SCORE -> "Weak Score".
 * "one-line summary" is sourced from `narrative.paragraph` (no dedicated
 * one-liner field exists yet -- TODO Phase 4 if one is added).
 */
import type {
  StockReportDoc,
  FundReportDoc,
  InstrumentDto,
} from "@finsight/shared";

export const stockFixture: StockReportDoc = {
  ticker: "RELIANCE",
  name: "Reliance Industries Ltd",
  sector: "Energy",
  asOf: "2026-05-27T18:00:00.000Z",
  dataVersionHash: "sha1:reliance-test",
  score: {
    value: 8,
    verdict: "STRONG_SCORE" as StockReportDoc["score"]["verdict"],
    pillars: {
      fundamentals: 8.2,
      valuation: 7.1,
      technical: 7.8,
      sentiment: 7.5,
      risk: 8.0,
      event: 7.9,
    },
    weightsVersion: "v1",
  },
  fundamentals: {
    pe: 24.3,
    pb: 2.1,
    roe: 9.4,
    roce: 11.2,
    debtEquity: 0.42,
    marketCap: 1850000,
  },
  technicals: {
    rsi14: 56,
    macdSignal: "bullish",
    dma50: 2850,
    dma200: 2710,
    price: 2920,
    beta: 1.05,
  },
  insights: {
    volatility: { stddev1y: 0.21 },
    profitConsistency: { profitableQuartersPct: 100, window: "12Q" },
    eventSensitivity: { avgAbsReturnOnResultDay: 0.03, baseline: 0.012 },
    swot: {
      strengths: ["Diversified conglomerate"],
      weaknesses: ["Capital intensive"],
      opportunities: ["Retail + telecom expansion"],
      threats: ["Commodity cycle"],
      citedSources: ["yahoo-finance2"],
    },
    promoterHoldings: { latestPct: 50.3, deltaPctVsPrevQ: 0.0 },
  },
  peers: [
    {
      ticker: "ONGC",
      name: "Oil & Natural Gas Corp",
      score: 6,
      sector: "Energy",
    },
    { ticker: "IOC", name: "Indian Oil Corp", score: 5, sector: "Energy" },
    { ticker: "BPCL", name: "Bharat Petroleum", score: 6, sector: "Energy" },
  ],
  narrative: {
    paragraph:
      "Reliance Industries shows diversified conglomerate strength with consistent profit growth and strong promoter holding across its energy, retail, and telecom segments.",
    citedSources: ["yahoo-finance2", "moneycontrol-rss"],
    generatedAt: "2026-05-27T18:00:00.000Z",
    auditPassed: true,
  },
  disclaimers: {
    analysis:
      "Analysis, not investment advice. FinSight AI is not a SEBI-registered Research Analyst or Investment Adviser.",
    pastPerformance:
      "Past performance is not indicative of future returns. Investments are subject to market risks.",
  },
  dataLineage: [
    { field: "price", source: "yahoo-finance2", stale: false },
    { field: "fundamentals", source: "yahoo-finance2", stale: false },
  ],
};

export const fundFixture: FundReportDoc = {
  schemeCode: "120503",
  name: "Parag Parikh Flexi Cap Fund Direct Growth",
  category: "Flexi Cap",
  asOf: "2026-05-27T18:00:00.000Z",
  dataVersionHash: "sha1:ppfas-test",
  score: {
    value: 9,
    verdict: "STRONG_SCORE" as FundReportDoc["score"]["verdict"],
    pillars: {
      returns: 9.1,
      riskAdjusted: 8.8,
      consistency: 9.0,
      costs: 8.5,
      manager: 9.2,
      portfolio: 8.7,
    },
    weightsVersion: "v1",
  },
  returns: {
    fund: { "1y": 0.22, "3y": 0.19, "5y": 0.21, "10y": 0.18 },
    benchmark: { "1y": 0.16, "3y": 0.15, "5y": 0.16, "10y": 0.14 },
    category: { "1y": 0.18, "3y": 0.16, "5y": 0.17, "10y": 0.15 },
  },
  risk: { sharpe1y: 1.4, stddev1y: 0.13, maxDrawdown1y: -0.18 },
  holdings: [
    { name: "HDFC Bank", weightPct: 7.2, sector: "Financials" },
    { name: "Bajaj Holdings", weightPct: 6.1, sector: "Financials" },
  ],
  sectorAllocation: [
    { sector: "Financials", weightPct: 32.1 },
    { sector: "Technology", weightPct: 18.4 },
  ],
  meta: {
    expenseRatioPct: 0.63,
    aumCr: 82000,
    managerName: "Rajeev Thakkar",
    managerTenureYears: 12,
  },
  peers: [
    { schemeCode: "118989", name: "HDFC Flexi Cap Direct Growth", score: 7 },
    { schemeCode: "125354", name: "Quant Flexi Cap Direct Growth", score: 8 },
    { schemeCode: "120465", name: "UTI Flexi Cap Direct Growth", score: 6 },
  ],
  narrative: {
    paragraph:
      "Parag Parikh Flexi Cap delivers consistent outperformance versus the Nifty 500 TRI with disciplined risk management and a low expense ratio.",
    citedSources: ["mfapi.in", "amfi"],
    generatedAt: "2026-05-27T18:00:00.000Z",
    auditPassed: true,
  },
  disclaimers: {
    analysis:
      "Analysis, not investment advice. FinSight AI is not a SEBI-registered Research Analyst or Investment Adviser.",
    pastPerformance:
      "Past performance is not indicative of future returns. Mutual fund investments are subject to market risks.",
  },
  dataLineage: [{ field: "nav", source: "mfapi.in", stale: false }],
};

/**
 * Dual-listed instrument fixture -- drives canonical NSE-preference test.
 * Sourced from the Phase-2 `InstrumentDto` contract (`nseSymbol`,
 * `bseCode`, `primaryExchange`).
 */
export const dualListedInstrumentFixture: InstrumentDto = {
  id: "instr_reliance",
  isin: "INE002A01018",
  nseSymbol: "RELIANCE",
  bseCode: "500325",
  yahooSymbol: "RELIANCE.NS",
  name: "Reliance Industries Ltd",
  primaryExchange: "NSE",
  currency: "INR",
  sector: "Energy",
  popularity: 1850000,
  isActive: true,
  dataVersionHash: "sha1:reliance-instr",
};

/** Simulates a long-tail instrument with no precomputed report yet. */
export const longTailUnknownFixture = null;
