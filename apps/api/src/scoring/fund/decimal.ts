/**
 * Single Decimal config point — re-export from the stock module so all
 * scoring pillars (stock + fund) share the same precision + rounding
 * configuration. Importing here ensures the side-effect of
 * `Decimal.set(...)` runs before any fund pillar arithmetic.
 */
export { Decimal } from "../stock/decimal";
