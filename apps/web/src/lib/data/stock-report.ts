/**
 * Materialised-store read path for the PUBLIC stock SEO page (SEO-04).
 *
 * Distinct from `src/app/_lib/reports/fetch.ts` (the authenticated app
 * report) in two deliberate ways:
 *   1. COOKIELESS. It never calls `cookies()`, so the public route is NOT
 *      opted into dynamic rendering — `generateStaticParams` + ISR keep
 *      working. Auth to the internal API is via the `INTERNAL_API_SECRET`
 *      header instead.
 *   2. Read-only of the precomputed report. No live model call, no live
 *      external data fetch — the crawler request path only touches the
 *      materialised store.
 *
 * Tagged with Next.js cache tags so Plan 02's `revalidateTag` webhook can
 * invalidate a single ticker precisely.
 */
import "server-only";
import type { StockReportDoc } from "@finsight/shared";

const API_BASE =
  process.env.API_BASE ??
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:3001";

const REPORT_TTL_SECONDS = 24 * 60 * 60;

function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers["x-internal-secret"] = secret;
  return headers;
}

export interface MaterialisedReadOptions {
  readonly cacheTags: readonly string[];
}

/**
 * Reads a precomputed stock report. Returns `null` for 404 (long-tail ticker
 * with no report yet) so the page can render the stub + enqueue compute.
 */
export async function getStockReportFromMaterialisedStore(
  ticker: string,
  options: MaterialisedReadOptions,
): Promise<StockReportDoc | null> {
  const res = await fetch(`${API_BASE}/reports/stock/${ticker}`, {
    headers: internalHeaders(),
    next: { tags: [...options.cacheTags], revalidate: REPORT_TTL_SECONDS },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Stock report fetch failed for ${ticker}: ${res.status}`);
  }
  return (await res.json()) as StockReportDoc;
}

/**
 * Fire-and-forget ad-hoc compute enqueue for a long-tail ticker. NEVER awaited
 * on the request path. NestJS-side dedup + per-ticker rate-limit (Phase 3/4)
 * protects against crawler floods (threat T-08-06).
 */
export async function enqueueAdHocStockCompute(ticker: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/jobs/ad-hoc-compute/stock/${ticker}`, {
      method: "POST",
      headers: internalHeaders(),
      // Never cache an enqueue.
      cache: "no-store",
    });
  } catch (error: unknown) {
    // Fire-and-forget: a failed enqueue must not break the stub render. Log
    // for diagnosis but swallow.
    console.warn(
      `Ad-hoc stock compute enqueue failed for ${ticker}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
