import type { InstrumentMatch } from "@finsight/shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

/**
 * Client-side instrument search.
 *
 * Short-circuits on queries shorter than 2 characters so callers
 * (debounced inputs) never hit the network for incomplete prefixes.
 * Forwards browser cookies (`credentials: 'include'`) so the cookie-
 * based auth context survives the cross-origin RSC fetch.
 */
export async function searchInstruments(
  q: string,
  options: { readonly type?: "STOCK" | "FUND"; readonly limit?: number; readonly signal?: AbortSignal } = {},
): Promise<readonly InstrumentMatch[]> {
  if (q.trim().length < 2) return [];
  const params = new URLSearchParams({ q });
  if (options.type) params.set("type", options.type);
  if (options.limit) params.set("limit", String(options.limit));

  const res = await fetch(`${API_BASE}/search/instruments?${params}`, {
    credentials: "include",
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  return (await res.json()) as readonly InstrumentMatch[];
}
