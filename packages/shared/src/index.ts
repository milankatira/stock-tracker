export * from "./api-errors";
export * from "./verdict";

/**
 * Sentinel value used by Plan 01 to prove the shared package round-trips
 * between `apps/web` and `apps/api`. Both sides import this value and
 * compare the runtime strings in the home-page smoke test. Safe to remove
 * once additional shared exports (Verdict, DTOs, etc.) provide the same
 * proof of life.
 */
export const SHARED_SENTINEL = "@finsight/shared-v0" as const;
