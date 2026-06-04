export * from "./api-errors";
export * from "./comparison";
export * from "./fund-report";
export * from "./instrument-match";
export * from "./instruments";
export * from "./news";
export * from "./providers";
export * from "./scoring";
export * from "./stock-report";
export * from "./verdict";
export * from "./watchlist";

/**
 * Sentinel value used by Plan 01 to prove the shared package round-trips
 * between `apps/web` and `apps/api`. Both sides import this value and
 * compare the runtime strings in the home-page smoke test. Safe to remove
 * once additional shared exports (Verdict, DTOs, etc.) provide the same
 * proof of life.
 */
export const SHARED_SENTINEL = "@finsight/shared-v0" as const;
