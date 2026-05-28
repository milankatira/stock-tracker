/**
 * Discriminated result envelope returned by every external-data adapter
 * (Yahoo, NSE, MFAPI, AMFI, RSS, NewsData…). Adapters never throw on
 * upstream errors — they return one of three shapes so the caller can
 * decide whether to fall back, serve stale, or persist.
 *
 * - `ok`    — fresh payload validated at the adapter boundary
 * - `stale` — last-known-good payload served past its freshness window
 * - `err`   — typed failure; the chain may try the next provider
 *
 * Non-validation infrastructure errors are intentionally THROWN (not
 * returned) so the circuit breaker (Plan 03 chain) can count failures.
 */
export type ProviderResult<T> =
  | { status: "ok"; data: T; source: string; fetchedAt: Date }
  | {
      status: "stale";
      data: T;
      source: string;
      fetchedAt: Date;
      stalenessSeconds: number;
    }
  | {
      status: "err";
      reason:
        | "timeout"
        | "open-circuit"
        | "validation"
        | "rate-limited"
        | "upstream-5xx"
        | "not-found"
        | "unknown";
      message: string;
      source: string;
    };

export type ProviderOk<T> = Extract<ProviderResult<T>, { status: "ok" }>;
export type ProviderStale<T> = Extract<ProviderResult<T>, { status: "stale" }>;
export type ProviderErr = Extract<ProviderResult<unknown>, { status: "err" }>;
