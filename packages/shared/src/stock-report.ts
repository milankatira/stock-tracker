import type { Verdict } from "./verdict";

export interface Pillars {
  readonly fundamentals: number;
  readonly valuation: number;
  readonly technical: number;
  readonly sentiment: number;
  readonly risk: number;
  readonly event: number;
}

export interface SwotPayload {
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly opportunities: readonly string[];
  readonly threats: readonly string[];
  readonly citedSources: readonly string[];
}

export interface InsightsBlock {
  readonly volatility: { readonly stddev1y: number };
  readonly profitConsistency: {
    readonly profitableQuartersPct: number;
    readonly window: "12Q";
  };
  readonly eventSensitivity: {
    readonly avgAbsReturnOnResultDay: number;
    readonly baseline: number;
  };
  readonly swot: SwotPayload;
  readonly promoterHoldings: {
    readonly latestPct: number;
    readonly deltaPctVsPrevQ: number;
  };
}

export interface Peer {
  readonly ticker: string;
  readonly name: string;
  readonly score: number;
  readonly sector?: string;
}

export interface Narrative {
  readonly paragraph: string;
  readonly citedSources: readonly string[];
  readonly generatedAt: string;
  readonly auditPassed: true;
}

export interface Disclaimers {
  readonly analysis: string;
  readonly pastPerformance?: string;
}

export interface DataLineageEntry {
  readonly field: string;
  readonly source: string;
  readonly stale: boolean;
}

export interface StockReportDoc {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly asOf: string;
  readonly dataVersionHash: string;
  readonly score: {
    readonly value: number;
    readonly verdict: Verdict;
    readonly pillars: Pillars;
    readonly weightsVersion: string;
  };
  readonly fundamentals: {
    readonly pe: number;
    readonly pb: number;
    readonly roe: number;
    readonly roce: number;
    readonly debtEquity: number;
    readonly marketCap: number;
  };
  readonly technicals: {
    readonly rsi14: number;
    readonly macdSignal: "bullish" | "bearish" | "neutral";
    readonly dma50: number;
    readonly dma200: number;
    readonly price: number;
    readonly beta: number;
  };
  readonly insights: InsightsBlock;
  readonly peers: readonly Peer[];
  readonly narrative: Narrative | null;
  readonly disclaimers: Disclaimers;
  readonly dataLineage: readonly DataLineageEntry[];
}

export type Timeframe = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y" | "MAX";
export const TIMEFRAMES: readonly Timeframe[] = [
  "1D",
  "1W",
  "1M",
  "6M",
  "1Y",
  "5Y",
  "MAX",
];

export interface OhlcCandle {
  /** Unix epoch seconds. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}
