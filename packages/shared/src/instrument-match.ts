/**
 * Shared search-result contract consumed by both `apps/api` (returned by
 * `SearchService.searchInstruments`) and `apps/web` (the `InstrumentSearch`
 * dropdown). Stocks expose `symbol` (NSE ticker like `RELIANCE`); funds
 * expose `schemeCode` (AMFI scheme code, numeric string). The
 * presentation layer routes the click via the discriminant `type`:
 *   - STOCK → /stock/<symbol>
 *   - FUND  → /fund/<schemeCode>
 */
export type InstrumentMatchType = "STOCK" | "FUND";
export type InstrumentExchange = "NSE" | "BSE" | "AMFI";

export interface InstrumentMatch {
  readonly id: string;
  readonly type: InstrumentMatchType;
  /** Stocks: NSE ticker symbol. Funds: AMFI scheme code (numeric string). */
  readonly symbol: string;
  readonly name: string;
  readonly exchange?: InstrumentExchange;
  /** Higher = more relevant. Combines text-match score with popularity. */
  readonly score: number;
}
