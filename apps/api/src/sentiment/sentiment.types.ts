import type { SentimentLabel } from "./aggregator";

export type { SentimentLabel };

/** Lookback window (days) for the news that feeds the sentiment pillar. */
export const SENTIMENT_LOOKBACK_DAYS = 30;

/** Coverage metadata returned alongside a computed pillar value. */
export interface SentimentCoverage {
  readonly itemCount: number;
  readonly lookbackDays: number;
}

/** Result of a pillar computation: the [0..10] value (or null) + coverage. */
export interface PillarResult {
  readonly value: number | null;
  readonly coverage: SentimentCoverage;
}
