import type { InstrumentMatchType } from "./instrument-match";

/**
 * One row in a user's watchlist. `instrumentId` is the Mongo ObjectId
 * (string) of the source instrument document; the report pages route
 * users via the human-meaningful surrogate (NSE ticker for stocks, AMFI
 * scheme code for funds) returned alongside on the report DTOs.
 *
 * `latestScore` / `previousScore` are joined server-side from the
 * Phase 3 EOD recompute's Redis materialiser (`score:latest:<id>` and
 * `score:prev:<id>` ScoreSnapshot keys). Either can be `null` if the
 * EOD job has not yet written a snapshot — the UI renders `—` in that
 * case and tells the user the score will appear after market close.
 */
export interface WatchlistItem {
  readonly instrumentId: string;
  readonly instrumentType: InstrumentMatchType;
  readonly addedAt: string;
  readonly latestScore: number | null;
  readonly previousScore: number | null;
  readonly delta: number | null;
}

export interface WatchlistResponse {
  readonly items: readonly WatchlistItem[];
}

export const WATCHLIST_MAX_ITEMS = 200 as const;
