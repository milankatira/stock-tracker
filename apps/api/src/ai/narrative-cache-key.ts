/**
 * Versioned cache key for the per-instrument Gemini narrative context.
 * The key bakes the data-version hash so a new EOD recompute (which
 * advances the hash) naturally orphans the old key — no explicit
 * invalidation needed.
 */
export function buildNarrativeCacheKey(
  ticker: string,
  dataVersionHash: string,
): string {
  if (!ticker || ticker.length === 0) {
    throw new Error("ticker required for narrative cache key");
  }
  if (!dataVersionHash || dataVersionHash.length === 0) {
    throw new Error("dataVersionHash required for narrative cache key");
  }
  return `gemini-ctx:${ticker}:${dataVersionHash}`;
}
