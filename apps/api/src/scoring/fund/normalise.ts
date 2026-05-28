/**
 * Re-export of the stock-module normaliser helpers so funds reuse the
 * exact same percentile-rank / absolute-band / weight-redistribution
 * logic. Single source of truth.
 */
export {
  percentileRank,
  absoluteBand,
  normaliseSubFactor,
  type AbsoluteBand,
  type NormaliseSubFactorResult,
} from "../stock/normalise";
