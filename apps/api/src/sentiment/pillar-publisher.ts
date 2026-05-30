import type { ScoreStockSentiment } from "../scoring";
import { RECOMPUTE_THRESHOLD, type SentimentItem } from "./aggregator";

/**
 * Pure helpers for the sentiment-pillar publish path (NEWS-04). The
 * orchestration (fetch news, cache, enqueue recompute) lives in
 * `SentimentService`; the decision logic and the scoring-contract
 * mapping are isolated here so they are trivially unit-testable.
 */

/** Redis key for the last-published pillar value of an instrument. */
export function pillarCacheKey(instrumentId: string): string {
  return `sentiment:pillar:${instrumentId}`;
}

/**
 * Map a classified-news document (lean shape) to the aggregator's input.
 * Defensive about missing confidence — defaults to 1.
 */
export function toSentimentItem(doc: {
  source: string;
  sentiment: SentimentItem["sentiment"];
  sentimentConfidence?: number | null;
  publishedAt: Date | string;
}): SentimentItem {
  return {
    source: doc.source,
    sentiment: doc.sentiment,
    confidence:
      typeof doc.sentimentConfidence === "number" ? doc.sentimentConfidence : 1,
    publishedAt: new Date(doc.publishedAt),
  };
}

/**
 * Decide whether a pillar change warrants an intraday recompute.
 * `true` only when the new value is non-null and differs from the prior
 * cached value by at least `RECOMPUTE_THRESHOLD`. A first-ever value
 * (no prior) with content also triggers, so the first batch of news for
 * an instrument is reflected without waiting for the nightly EOD.
 */
export function shouldTriggerRecompute(
  prev: number | null,
  next: number | null,
  threshold: number = RECOMPUTE_THRESHOLD,
): boolean {
  if (next === null) return false;
  if (prev === null) return true;
  return Math.abs(next - prev) >= threshold;
}

/**
 * Map the aggregator's [0..10] output into the scoring engine's
 * `ScoreStockSentiment` contract. `null` value → `null` so the scorer
 * keeps its Phase-3 neutral fallback (`NO_SENTIMENT_DATA_PRE_PHASE_6`).
 * `analystConsensus` stays `null` — no analyst feed in Phase 6.
 */
export function toScoreStockSentiment(
  value: number | null,
): ScoreStockSentiment | null {
  if (value === null) return null;
  return { last30dAggregate: value, analystConsensus: null };
}
