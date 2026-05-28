import Decimal from "decimal.js";

/**
 * Vitest snapshot serialiser for `Decimal` values. Renders a Decimal as
 * its stable `toFixed()` string so internal-representation changes in
 * decimal.js never cause spurious snapshot diffs.
 */
export default {
  test(value: unknown): boolean {
    return value instanceof Decimal;
  },
  serialize(value: Decimal): string {
    return `Decimal("${value.toFixed()}")`;
  },
};
