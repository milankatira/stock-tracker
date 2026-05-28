import type { WatchlistResponse } from "@finsight/shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

export async function fetchWatchlist(): Promise<WatchlistResponse> {
  const res = await fetch(`${API_BASE}/watchlist`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Watchlist fetch failed: ${res.status}`);
  return (await res.json()) as WatchlistResponse;
}

export async function addWatchlistItem(input: {
  readonly instrumentId: string;
  readonly instrumentType: "STOCK" | "FUND";
}): Promise<void> {
  const res = await fetch(`${API_BASE}/watchlist/items`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Add to watchlist failed: ${res.status}`);
}

export async function removeWatchlistItem(instrumentId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/watchlist/items/${encodeURIComponent(instrumentId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error(`Remove from watchlist failed: ${res.status}`);
}
