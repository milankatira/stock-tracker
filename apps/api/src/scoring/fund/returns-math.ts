import { Decimal } from "./decimal";

/**
 * Pure math helpers consumed by the fund pillars. Every function:
 *  - Operates on plain `number[]` arrays of monthly returns.
 *  - Returns `Decimal` rounded HALF_UP to 4 dp (or `null` when the
 *    input is too short / mathematically undefined — e.g. division by
 *    a zero denominator).
 *  - Has no side effects, no I/O, no time/random access.
 */

const FOUR_DP = (value: Decimal): Decimal =>
  value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

const SQRT_12 = new Decimal(12).sqrt();
const MIN_SHARPE_LENGTH = 12;

export function meanReturn(returns: readonly number[]): Decimal {
  if (returns.length === 0) return new Decimal(0);
  const sum = returns.reduce(
    (acc: Decimal, value: number) => acc.plus(value),
    new Decimal(0),
  );
  return FOUR_DP(sum.div(returns.length));
}

export function stdDev(returns: readonly number[]): Decimal {
  if (returns.length < 2) return new Decimal(0);
  const mean = meanReturn(returns);
  const variance = returns
    .reduce(
      (acc: Decimal, value: number) =>
        acc.plus(new Decimal(value).minus(mean).pow(2)),
      new Decimal(0),
    )
    .div(returns.length - 1);
  return FOUR_DP(variance.sqrt());
}

export function downsideStdDev(
  returns: readonly number[],
  threshold = 0,
): Decimal {
  const downside = returns.filter((value) => value < threshold);
  if (downside.length < 2) return new Decimal(0);
  const variance = downside
    .reduce(
      (acc: Decimal, value: number) =>
        acc.plus(new Decimal(value).minus(threshold).pow(2)),
      new Decimal(0),
    )
    .div(downside.length);
  return FOUR_DP(variance.sqrt());
}

/**
 * Annualised Sharpe ratio. Returns `null` when:
 *  - The input series has fewer than 12 aligned data points.
 *  - Excess-return stddev is zero (e.g. perfectly constant returns).
 */
export function sharpeRatio(
  fundMonthly: readonly number[],
  riskFreeMonthly: readonly number[],
): Decimal | null {
  if (
    fundMonthly.length < MIN_SHARPE_LENGTH ||
    fundMonthly.length !== riskFreeMonthly.length
  ) {
    return null;
  }
  const excess = fundMonthly.map((value, idx) => value - riskFreeMonthly[idx]);
  const denom = stdDev(excess);
  if (denom.isZero()) return null;
  const num = meanReturn(excess).times(12);
  return FOUR_DP(num.div(denom.times(SQRT_12)));
}

/**
 * Annualised Sortino ratio. Returns `null` when there are no negative
 * excess returns (downside stddev = 0).
 */
export function sortinoRatio(
  fundMonthly: readonly number[],
  riskFreeMonthly: readonly number[],
): Decimal | null {
  if (
    fundMonthly.length < MIN_SHARPE_LENGTH ||
    fundMonthly.length !== riskFreeMonthly.length
  ) {
    return null;
  }
  const excess = fundMonthly.map((value, idx) => value - riskFreeMonthly[idx]);
  const denom = downsideStdDev(excess);
  if (denom.isZero()) return null;
  const num = meanReturn(excess).times(12);
  return FOUR_DP(num.div(denom.times(SQRT_12)));
}

/**
 * Downside capture ratio (as a percentage). Returns `null` if there
 * are no negative benchmark months in the aligned series.
 */
export function downsideCaptureRatio(
  fundMonthly: readonly number[],
  benchmarkMonthly: readonly number[],
): Decimal | null {
  if (
    fundMonthly.length === 0 ||
    fundMonthly.length !== benchmarkMonthly.length
  ) {
    return null;
  }
  const downFund: number[] = [];
  const downBench: number[] = [];
  for (let i = 0; i < benchmarkMonthly.length; i += 1) {
    if (benchmarkMonthly[i] < 0) {
      downFund.push(fundMonthly[i]);
      downBench.push(benchmarkMonthly[i]);
    }
  }
  if (downBench.length === 0) return null;
  const benchMean = meanReturn(downBench);
  if (benchMean.isZero()) return null;
  return FOUR_DP(meanReturn(downFund).div(benchMean).times(100));
}

/**
 * Maps the percentage of rolling 1Y windows where the fund finished in
 * the top-2 (top half) quartiles of its category to a 0..10 score.
 *
 * Caller passes the boolean classification per window (precomputed by
 * the loader). 0 % → 0, 100 % → 10.
 */
export function quartileStability(
  windowsInTopTwoQuartiles: readonly boolean[],
): Decimal {
  if (windowsInTopTwoQuartiles.length === 0) return new Decimal(5);
  const hits = windowsInTopTwoQuartiles.filter((win) => win).length;
  return FOUR_DP(new Decimal(hits).div(windowsInTopTwoQuartiles.length).times(10));
}
