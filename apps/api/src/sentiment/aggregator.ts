/**
 * Pure sentiment-pillar aggregator (NEWS-04). No I/O, no DI — easy to
 * unit test and audit. Maps a set of classified news items for one
 * instrument into a single [0..10] sentiment-pillar value that feeds
 * `ScoreStockSentiment.last30dAggregate` in the scoring engine.
 *
 * Formula (06-RESEARCH.md Pattern 4 / Example 6):
 *   w_i    = exp(-ageHours_i / TAU_HOURS) * sourceAuthority(source_i)
 *   raw    = Σ(w_i * polarity_i * confidence_i) / Σ(w_i)   ∈ [-1, +1]
 *   pillar = clamp(5 + 5 * raw, 0, 10)
 *
 * Returns `null` for an empty set so the scoring engine keeps its
 * Phase-3 neutral fallback (`NO_SENTIMENT_DATA_PRE_PHASE_6`).
 *
 * The constants below are deliberately exported and admin-tuneable —
 * recency half-life, per-source authority, and the selective-recompute
 * threshold are all knobs surfaced for the milestone retro.
 */

export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface SentimentItem {
  readonly source: string;
  readonly sentiment: SentimentLabel;
  readonly confidence: number; // 0..1
  readonly publishedAt: Date;
}

/** Recency half-life in hours (7 days). Tunable knob. */
export const TAU_HOURS = 168;

/**
 * Pillar-point delta that triggers a selective `score-recompute:{ticker}`
 * job. Smaller shifts are absorbed by the nightly EOD recompute.
 */
export const RECOMPUTE_THRESHOLD = 0.5;

/** Per-source trust weight. Unknown sources default to 0.5. Admin-tuneable. */
export const SOURCE_AUTHORITY: Readonly<Record<string, number>> = {
  "bse-announcements": 1.2,
  "nse-announcements": 1.2,
  moneycontrol: 1.0,
  "et-markets": 1.0,
  livemint: 1.0,
  "business-standard": 1.0,
  "newsdata-io": 0.6,
};

const DEFAULT_AUTHORITY = 0.5;

const POLARITY: Readonly<Record<SentimentLabel, number>> = {
  POSITIVE: 1,
  NEUTRAL: 0,
  NEGATIVE: -1,
};

const MS_PER_HOUR = 3_600_000;

export function aggregateSentimentPillar(
  items: readonly SentimentItem[],
  asOf: Date,
): number | null {
  if (items.length === 0) {
    return null;
  }

  let num = 0;
  let den = 0;
  for (const it of items) {
    const ageHours = Math.max(0, (asOf.getTime() - it.publishedAt.getTime()) / MS_PER_HOUR);
    const authority = SOURCE_AUTHORITY[it.source] ?? DEFAULT_AUTHORITY;
    const weight = Math.exp(-ageHours / TAU_HOURS) * authority;
    const confidence = Number.isFinite(it.confidence) ? it.confidence : 1;
    num += weight * POLARITY[it.sentiment] * confidence;
    den += weight;
  }

  if (den === 0) {
    return null;
  }

  const raw = num / den; // [-1, +1]
  return Math.max(0, Math.min(10, 5 + 5 * raw));
}
