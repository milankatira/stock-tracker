/** TTL (seconds) used by the chain services when writing to the stale-cache. */
export const CHAIN_STALE_TTL_SECONDS = {
  PRICE_QUOTE: 60 * 60 * 24, // 24h — Phase 1 cache TTL guidance
  PRICE_HISTORY: 60 * 60 * 24,
  FUNDAMENTALS: 60 * 60 * 24 * 7,
  NAV_SNAPSHOT: 60 * 60 * 24,
  NAV_HISTORY: 60 * 60 * 24 * 7,
  SCHEME_LIST: 60 * 60 * 24 * 14,
  NEWS_RECENT: 60 * 60,
} as const;
