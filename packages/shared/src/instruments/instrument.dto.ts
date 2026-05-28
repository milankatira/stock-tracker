export type ExchangeCode = "NSE" | "BSE";
export type MarketCapBucket = "LARGE" | "MID" | "SMALL";

/**
 * Canonical wire shape for a single equity instrument. The Mongo schema
 * lives in Plan 02-03; this DTO is the contract every other layer
 * consumes.
 *
 * `popularity` is a **cross-phase contract** — Phase 5 search ranks by it.
 * `dataVersionHash` is the Phase 4 cache key seed
 * (sha1 over [lastPriceTs, lastFundamentalsTs, lastNewsTs]).
 */
export interface InstrumentDto {
  readonly id: string;
  readonly isin?: string;
  readonly nseSymbol: string;
  readonly bseCode?: string;
  readonly yahooSymbol: string;
  readonly name: string;
  readonly primaryExchange: ExchangeCode;
  readonly currency: "INR";
  readonly sector?: string;
  readonly industry?: string;
  readonly marketCapCategory?: MarketCapBucket;
  /** Market cap in ₹ crore — drives Phase 5 search ranking. */
  readonly popularity: number;
  readonly isActive: boolean;
  readonly dataVersionHash: string;
}
