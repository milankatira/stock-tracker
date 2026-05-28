import { Decimal } from "./decimal";
import { Verdict } from "../types";

const ZERO = new Decimal(0);
const TEN = new Decimal(10);

/**
 * Branded verdict from the final 1dp score per the compliance
 * vocabulary (STRONG_SCORE / CAUTION / WEAK_SCORE). Forbidden
 * recommendation verbs are blocked project-wide by
 * `scripts/forbid-verbs.sh`.
 */
export function toVerdict(score: Decimal): Verdict {
  if (score.gte("8.5")) return Verdict.STRONG_SCORE;
  if (score.gte("5.0")) return Verdict.CAUTION;
  return Verdict.WEAK_SCORE;
}

/**
 * Clamp the weighted-sum total to [0, 10] and round HALF_UP to 1dp.
 */
export function clampAndRoundFinal(total: Decimal): Decimal {
  return Decimal.max(ZERO, Decimal.min(TEN, total)).toDecimalPlaces(
    1,
    Decimal.ROUND_HALF_UP,
  );
}
