/**
 * Domain event emitted by the Phase 3 `EodRecomputeProcessor` after a
 * child job persists a new score (Mongo + Redis writes succeed).
 * Subscribers (Phase 4 narrative-batch listener) react asynchronously
 * so the EOD pipeline never blocks on downstream work.
 */
export const EOD_TICKER_RECOMPUTED_EVENT = "eod.ticker.recomputed";

export interface EodTickerRecomputedEvent {
  readonly ticker: string;
  readonly instrumentId: string;
  readonly instrumentType: "STOCK" | "FUND";
  readonly dataVersionHash: string;
  readonly asOfDate: string;
}
