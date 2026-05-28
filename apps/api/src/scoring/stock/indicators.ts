import { Decimal } from "./decimal";

const ZERO = new Decimal(0);
const TEN = new Decimal(10);
const SEVEN = new Decimal(7);
const FIVE = new Decimal(5);
const THREE = new Decimal(3);
const TWO = new Decimal(2);

/**
 * Price vs moving-average ratio. Returns `null` when the MA is missing
 * or zero. Callers map the resulting decimal to a sub-factor score
 * (above MA + rising = strong, below MA = weak).
 */
export function priceVsMa(price: number, ma: number | null): Decimal | null {
  if (ma === null || ma === 0 || !Number.isFinite(ma)) return null;
  return new Decimal(price).minus(ma).div(ma);
}

/**
 * Map an RSI14 reading to a 0..10 score:
 *   - 50 → 10 (neutral zone, healthiest)
 *   - 30 / 70 → 5
 *   - ≤ 20 or ≥ 80 → 0
 * Linear interpolation in between.
 */
export function rsiScore(rsi14: number | null): Decimal {
  if (rsi14 === null || !Number.isFinite(rsi14)) return FIVE;
  const value = new Decimal(rsi14);
  if (value.lte(20) || value.gte(80)) return ZERO;
  if (value.lte(30)) {
    return value.minus(20).times(0.5);
  }
  if (value.lte(50)) {
    return value.minus(30).div(20).times(5).plus(5);
  }
  if (value.lte(70)) {
    return new Decimal(70).minus(value).div(20).times(5).plus(5);
  }
  return new Decimal(80).minus(value).times(0.5);
}

/**
 * MACD/signal crossover state mapped to four buckets:
 *   - macd > signal AND macd > 0 → 10 (uptrend confirmation)
 *   - macd > signal AND macd < 0 → 7 (early reversal up)
 *   - macd < signal AND macd > 0 → 5 (early reversal down)
 *   - macd < signal AND macd < 0 → 2 (downtrend confirmation)
 */
export function macdState(
  macd: number | null,
  signal: number | null,
): Decimal {
  if (
    macd === null ||
    signal === null ||
    !Number.isFinite(macd) ||
    !Number.isFinite(signal)
  ) {
    return FIVE;
  }
  if (macd > signal && macd > 0) return TEN;
  if (macd > signal && macd < 0) return SEVEN;
  if (macd < signal && macd > 0) return FIVE;
  return TWO;
}

/**
 * Bollinger band position mapped to a 0..10 score. Centre 40-60 % of
 * the band = 10 (healthy mean reversion zone); 20-80 % = 7; outside
 * = 3 (overextended).
 */
export function bollingerPositionScore(
  price: number,
  lower: number | null,
  upper: number | null,
): Decimal {
  if (
    lower === null ||
    upper === null ||
    !Number.isFinite(lower) ||
    !Number.isFinite(upper) ||
    upper === lower
  ) {
    return FIVE;
  }
  const position = new Decimal(price).minus(lower).div(new Decimal(upper).minus(lower));
  if (position.gte(0.4) && position.lte(0.6)) return TEN;
  if (position.gte(0.2) && position.lte(0.8)) return SEVEN;
  return THREE;
}
