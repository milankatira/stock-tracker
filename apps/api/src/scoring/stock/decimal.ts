import Decimal from "decimal.js";

/**
 * Configure decimal.js once for the whole scoring core. Every pillar
 * imports `Decimal` from THIS module (not directly from `decimal.js`)
 * so the configuration is guaranteed applied before any arithmetic
 * runs. Cross-runtime determinism (Node 20 + 22) relies on this.
 */
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 20,
});

export { Decimal };
