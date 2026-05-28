export { PRICE_PROVIDER } from "./price-provider.port";
export { FUND_PROVIDER } from "./fund-provider.port";
export { NEWS_PROVIDER } from "./news-provider.port";

/**
 * Token published by the NSE adapter for the corporate-actions accessor.
 * It is intentionally separate from PRICE_PROVIDER so the Plan 02-03
 * adjustment service can consume corporate actions without anointing NSE
 * as a primary price source.
 */
export const CORPORATE_ACTIONS_PROVIDER = Symbol("CORPORATE_ACTIONS_PROVIDER");
