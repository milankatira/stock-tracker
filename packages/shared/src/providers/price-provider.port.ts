import type { ProviderResult } from "./provider-result";

/**
 * Per the cross-phase contract: Quote carries the timestamp as a real Date
 * (not an ISO string) because adapter callers run in Node and want to do
 * timezone math before any serialisation boundary.
 */
export interface Quote {
  readonly price: number;
  readonly asOf: Date;
  readonly currency: "INR";
}

/**
 * Daily bar. `close` is ALWAYS the corporate-action-adjusted close; the
 * unadjusted value is preserved as `rawClose` for audit/cross-checks
 * against NSE corporate actions (see Plan 02-03 adjustment service).
 */
export interface OHLCVBar {
  readonly ts: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly rawClose: number;
  readonly volume: number;
}

export type QuoteSummaryModule =
  | "price"
  | "summaryDetail"
  | "defaultKeyStatistics"
  | "financialData"
  | "incomeStatementHistory"
  | "balanceSheetHistory"
  | "cashflowStatementHistory"
  | "assetProfile";

export interface Fundamentals {
  readonly marketCap?: number;
  readonly trailingPE?: number;
  readonly priceToBook?: number;
  readonly returnOnEquity?: number;
  readonly debtToEquity?: number;
  readonly beta?: number;
  readonly sharesOutstanding?: number;
  /** Pass-through bag for the scoring engine — typed only at the field level above. */
  readonly raw: Record<string, unknown>;
}

export interface PriceProvider {
  getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>>;
  getDailyHistory(
    yahooSymbol: string,
    from: Date,
    to: Date,
  ): Promise<ProviderResult<OHLCVBar[]>>;
  getFundamentals(
    yahooSymbol: string,
    modules: readonly QuoteSummaryModule[],
  ): Promise<ProviderResult<Fundamentals>>;
}

export const PRICE_PROVIDER = Symbol("PRICE_PROVIDER");
