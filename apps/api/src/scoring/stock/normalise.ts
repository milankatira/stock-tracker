import { Decimal } from "./decimal";
import type { Direction } from "../types";

export interface AbsoluteBand {
  /** Upper-inclusive boundary. Use `Number.POSITIVE_INFINITY` for the catch-all. */
  readonly upTo: number;
  readonly score: number;
}

const NEUTRAL = new Decimal(5);
const ZERO = new Decimal(0);
const TEN = new Decimal(10);
const PEER_THRESHOLD = 20;

/**
 * Percentile-rank normaliser with average-rank tie breaking.
 * Empty cohort → neutral 5. Result rounded HALF_UP to 4 dp.
 *
 * `direction: 'higher'` — higher raw value = higher score (e.g. ROE).
 * `direction: 'lower'` — lower raw value = higher score (e.g. P/E).
 */
export function percentileRank(
  value: number,
  peerValues: readonly number[],
  direction: Direction,
): Decimal {
  if (peerValues.length === 0) return NEUTRAL;
  let below = 0;
  let equal = 0;
  for (const peer of peerValues) {
    if (peer < value) below += 1;
    else if (peer === value) equal += 1;
  }
  const ranked = below + equal / 2; // average rank for ties
  const fraction = new Decimal(ranked).div(peerValues.length);
  const ascending = fraction.times(10);
  const score = direction === "higher" ? ascending : TEN.minus(ascending);
  return clampDecimal(score).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Absolute-band fallback used when the peer cohort is too small
 * (length < 20) for a meaningful percentile rank. `bands` MUST be
 * sorted ascending by `upTo`.
 *
 * `direction: 'higher'` returns the band's `score` directly.
 * `direction: 'lower'` mirrors around 10 — `10 - score` — so smaller
 * input values still yield higher scores.
 */
export function absoluteBand(
  value: number,
  bands: readonly AbsoluteBand[],
  direction: Direction,
): Decimal {
  for (const band of bands) {
    if (value <= band.upTo) {
      const score = new Decimal(band.score);
      const out = direction === "higher" ? score : TEN.minus(score);
      return clampDecimal(out).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }
  }
  const tail = new Decimal(bands[bands.length - 1]?.score ?? 5);
  const fallback = direction === "higher" ? tail : TEN.minus(tail);
  return clampDecimal(fallback).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export interface NormaliseSubFactorResult {
  readonly normalisedScore: Decimal;
  readonly isFallback: boolean;
  readonly isAbsent: boolean;
}

/**
 * One-stop normaliser for a single sub-factor. The caller passes the
 * raw value (possibly `null`), the peer cohort, the absolute-band
 * fallback, and the direction. Returns the score + the diagnostic
 * flags consumed by `PillarBreakdown`.
 *
 * Absent → `normalisedScore = 0`, caller redistributes the weight.
 */
export function normaliseSubFactor(
  rawValue: number | null,
  peerValues: readonly number[],
  fallbackBands: readonly AbsoluteBand[],
  direction: Direction,
): NormaliseSubFactorResult {
  if (rawValue === null || !Number.isFinite(rawValue)) {
    return { normalisedScore: ZERO, isFallback: false, isAbsent: true };
  }
  if (peerValues.length >= PEER_THRESHOLD) {
    return {
      normalisedScore: percentileRank(rawValue, peerValues, direction),
      isFallback: false,
      isAbsent: false,
    };
  }
  return {
    normalisedScore: absoluteBand(rawValue, fallbackBands, direction),
    isFallback: true,
    isAbsent: false,
  };
}

function clampDecimal(value: Decimal): Decimal {
  return Decimal.max(ZERO, Decimal.min(TEN, value));
}
