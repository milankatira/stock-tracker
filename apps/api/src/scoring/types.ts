import type Decimal from "decimal.js";

export type Direction = "higher" | "lower";

export enum Verdict {
  STRONG_SCORE = "STRONG_SCORE",
  CAUTION = "CAUTION",
  WEAK_SCORE = "WEAK_SCORE",
}

export interface SubFactorBreakdown {
  readonly name: string;
  /** Raw observed input value — `null` means the loader could not provide it. */
  readonly rawValue: number | null;
  /** Normalised 0..10 score (4dp) for this sub-factor. */
  readonly normalisedScore: Decimal;
  /** Effective weight inside the pillar after absent-sub-factor redistribution. */
  readonly weightWithinPillar: Decimal;
  /** Stable provenance string — e.g. `'fundamentals.roeTtm'`. */
  readonly source: string;
  readonly direction: Direction;
  /** True if the absolute-band fallback was used (cohort < 20). */
  readonly isFallback: boolean;
  /** True if the input value was missing — sub-factor contributes nothing. */
  readonly isAbsent: boolean;
}

export type StockPillarKey =
  | "fundamentals"
  | "valuation"
  | "technical"
  | "sentiment"
  | "risk"
  | "event";

export type FundPillarKey =
  | "returns"
  | "risk-adjusted"
  | "consistency"
  | "costs"
  | "manager"
  | "portfolio";

export interface PillarBreakdown {
  readonly pillar: StockPillarKey | FundPillarKey;
  readonly pillarScore: Decimal;
  readonly weight: Decimal;
  readonly weightedContribution: Decimal;
  readonly subFactors: readonly SubFactorBreakdown[];
  readonly isFallback: boolean;
  readonly fallbackReason?: string;
}

export interface ScoreResult {
  /** Final 1-10 score rounded HALF_UP to 1dp. */
  readonly score: number;
  readonly verdict: Verdict;
  readonly pillars: readonly PillarBreakdown[];
  /** sha256 over canonical input (loader-computed). Empty string in the pure path. */
  readonly inputHash: string;
  readonly scoringEngineVersion: string;
  /** ISO-8601 — empty in the pure core; the orchestration shell stamps this. */
  readonly computedAt: string;
}

export interface PeerCohortValues {
  readonly [subFactorSource: string]: readonly number[];
}

export interface ScoreStockFundamentals {
  readonly roeTtm: number | null;
  readonly roceTtm: number | null;
  readonly debtToEquity: number | null;
  readonly revenueCagr3y: number | null;
  readonly profitCagr3y: number | null;
  readonly opMarginTtm: number | null;
}

export interface ScoreStockShareholding {
  readonly promoterPct: number | null;
  readonly pledgedPctOfPromoter: number | null;
  readonly pledgedPctTrend90d: number | null;
}

export interface ScoreStockValuation {
  readonly peTtm: number | null;
  readonly pb: number | null;
  readonly peg: number | null;
  readonly evEbitda: number | null;
  readonly divYield: number | null;
}

export interface ScoreStockTechnical {
  readonly price: number;
  readonly sma50: number | null;
  readonly sma200: number | null;
  readonly rsi14: number | null;
  readonly macd: { readonly macd: number; readonly signal: number } | null;
  readonly bollinger: { readonly upper: number; readonly lower: number } | null;
  readonly return1yVsNifty: number | null;
  readonly return3yVsNifty: number | null;
  readonly beta: number | null;
}

export interface ScoreStockSentiment {
  readonly last30dAggregate: number | null;
  readonly analystConsensus: number | null;
}

export interface ScoreStockRisk {
  readonly volatility1yAnnualised: number | null;
  readonly maxDrawdown1y: number | null;
  readonly earningsConsistencyPct: number | null;
  readonly auditQualifications: number | null;
}

export interface ScoreStockEvent {
  readonly meanAbsReturnResults5: number | null;
  readonly meanAbsReturnDividends5: number | null;
  readonly meanAbsReturnSectorNews5: number | null;
}

export interface ScoreStockInput {
  readonly instrumentId: string;
  /** `'YYYY-MM-DD'` in IST. */
  readonly asOfDate: string;
  readonly fundamentals: ScoreStockFundamentals;
  readonly shareholding: ScoreStockShareholding;
  readonly valuation: ScoreStockValuation;
  readonly sectorMedians: { readonly pe: number | null };
  readonly technical: ScoreStockTechnical;
  /** `null` pre-Phase 6 → neutral 5.0 fallback (NO_SENTIMENT_DATA_PRE_PHASE_6). */
  readonly sentiment: ScoreStockSentiment | null;
  readonly risk: ScoreStockRisk;
  readonly event: ScoreStockEvent;
  readonly peerCohort: PeerCohortValues;
  readonly _inputHash: string;
}
